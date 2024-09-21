import * as vscode from 'vscode';
import * as path from 'node:path';
import * as ts from 'typescript';
import type { DirectiveResult, DirectiveTreeItem } from './types';
import { CategoryTreeItem, FolderTreeItem, FileTreeItem, ExportedFunctionItem } from './tree-items';
import { UnusedFunctionDetector } from './reference-provider';

export class DirectiveTreeProvider implements vscode.TreeDataProvider<DirectiveTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DirectiveTreeItem | undefined | null > = new vscode.EventEmitter<DirectiveTreeItem | undefined | null >();
    readonly onDidChangeTreeData: vscode.Event<DirectiveTreeItem | undefined | null > = this._onDidChangeTreeData.event;
    private updateDebounceTimer: NodeJS.Timeout | undefined;
    private isUpdating= false;

    private unusedFunctions: Set<string> = new Set();
    private isAnalyzing = false;

    constructor(
        private results: DirectiveResult[],
        private context: vscode.ExtensionContext,
        private workspaceRoot: string
    ) { }

    getTreeItem(element: DirectiveTreeItem): vscode.TreeItem {

        return element;
    }

    getChildren(element?: DirectiveTreeItem): Thenable<DirectiveTreeItem[]> {
        if (!element) {
            // Root level - return categories
            return Promise.resolve([
                new CategoryTreeItem('use client', 'use-client', vscode.TreeItemCollapsibleState.Collapsed),
                new CategoryTreeItem('use server', 'use-server', vscode.TreeItemCollapsibleState.Collapsed)
            ]);
        }

        if (element instanceof CategoryTreeItem) {
            const categoryResults = this.results.filter(r => r.directive === element.label);
            return Promise.resolve(this.buildFolderStructure(categoryResults, element.id));
        }

        if (element instanceof FolderTreeItem) {
            return Promise.resolve(element.children);
        }

        if (element instanceof FileTreeItem) {
            return this.scanReferencesForFile(element);
        }

        return Promise.resolve([]);
    }

    private async scanReferencesForFile(fileItem: FileTreeItem): Promise<ExportedFunctionItem[]> {
        const document = await vscode.workspace.openTextDocument(fileItem.result.uri);
        const exportedFunctions = await this.parseFileForExportedFunctions(fileItem.result.uri);

        // Find references for each exported function
        const functionItems: ExportedFunctionItem[] = [];
        for (const func of exportedFunctions) {
            const references = await this.findReferencesForFunction(func, document);
            const isUnused = references.length <= 1; // Consider function unused if it only has its own declaration as a reference
            functionItems.push(new ExportedFunctionItem(func.label, func.range, func.uri, isUnused, func.neverUnused));
        }

        // Update the file item's children
        fileItem.children = functionItems;

        // Trigger a refresh for this specific file item
        this._onDidChangeTreeData.fire(fileItem);

        return functionItems;
    }

    private async findReferencesForFunction(functionItem: ExportedFunctionItem, document: vscode.TextDocument): Promise<vscode.Location[]> {
        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            functionItem.uri,
            functionItem.range.start
        );

        return references || [];
    }

    private buildFolderStructure(results: DirectiveResult[], parentId: string): DirectiveTreeItem[] {
        const folders: Map<string, FolderTreeItem> = new Map();
        const rootItems: DirectiveTreeItem[] = [];

        for (const result of results) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(result.uri);
            if (workspaceFolder) {
                const relativePath = path.relative(workspaceFolder.uri.fsPath, path.dirname(result.uri.fsPath));
                const pathParts = relativePath.split(path.sep);

                let currentPath = '';
                let currentFolder: FolderTreeItem | undefined;

                pathParts.forEach((part, index) => {
                    currentPath = path.join(currentPath, part);
                    const folderId = `${parentId}-${currentPath}`;

                    if (!folders.has(folderId)) {
                        const newFolder = new FolderTreeItem(
                            part,
                            folderId,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            [],
                            currentPath,
                            this.context
                        );
                        folders.set(folderId, newFolder);

                        if (index === 0) {
                            rootItems.push(newFolder);
                        } else {
                            // Add as a child to the parent folder
                            const parentFolderId = `${parentId}-${path.dirname(currentPath)}`;
                            const parentFolder = folders.get(parentFolderId);
                            if (parentFolder) {
                                parentFolder.children.push(newFolder);
                            }
                        }
                    }

                    currentFolder = folders.get(folderId);
                });

                if (currentFolder) {
                    const fileName = path.basename(result.uri.fsPath);
                    const fileItem = new FileTreeItem(`${fileName}:${result.line}`, result, [], this.context);
                    currentFolder.children.push(fileItem);
                }
            }
        }

        return rootItems;
    }

    public async analyzeUnusedFunctions(): Promise<void> {
        if (this.isAnalyzing) {
            vscode.window.showInformationMessage('Analysis is already in progress.');
            return;
        }

        this.isAnalyzing = true;
        const maxFilesToProcess = 100; // Adjust this number based on performance

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing unused functions",
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                vscode.window.showInformationMessage('Unused function analysis cancelled.');
                this.isAnalyzing = false;
            });

            try {
                const detector = new UnusedFunctionDetector(this.workspaceRoot);
                const files = await vscode.workspace.findFiles('**/*.{js,ts,jsx,tsx}', '**/node_modules/**');

                const filesToProcess = files.slice(0, maxFilesToProcess);

                let processedFiles = 0;
                for (const file of filesToProcess) {
                    if (token.isCancellationRequested) {
                        break;
                    }

                    await detector.analyzeFile(file);
                    processedFiles++;
                    progress.report({
                        message: `Processed ${processedFiles} of ${filesToProcess.length} files`,
                        increment: 100 / filesToProcess.length
                    });
                }

                this.unusedFunctions = detector.getUnusedFunctions();
                await this.updateUnusedStatus();

                if (processedFiles < files.length) {
                    vscode.window.showInformationMessage(`Analyzed ${processedFiles} out of ${files.length} files. Run the analysis again for more comprehensive results.`);
                } else {
                    vscode.window.showInformationMessage('Unused function analysis complete.');
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Error during unused function analysis: ${error}`);
            } finally {
                this.isAnalyzing = false;
            }
        });
    }



    private async parseFileForExportedFunctions(uri: vscode.Uri): Promise<ExportedFunctionItem[]> {
        const document = await vscode.workspace.openTextDocument(uri);
        const sourceFile = ts.createSourceFile(
            uri.fsPath,
            document.getText(),
            ts.ScriptTarget.Latest,
            true
        );

        const exportedFunctions: ExportedFunctionItem[] = [];
        const isUseServerFile = this.isUseServerFile(sourceFile);
        const isTsxFile = path.extname(uri.fsPath) === '.tsx';

        const visit = (node: ts.Node) => {
            if (ts.isFunctionDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                this.addExportedFunction(node, node.name?.text, document, uri, exportedFunctions, isUseServerFile && isTsxFile);
            } else if (ts.isVariableStatement(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                for (const declaration of node.declarationList.declarations) {
                    if (ts.isVariableDeclaration(declaration)) {
                        this.addExportedFunction(declaration, declaration.name.getText(), document, uri, exportedFunctions, isUseServerFile && isTsxFile);
                    }
                }
            } else if (ts.isExportAssignment(node)) {
                const expression = node.expression;
                this.addExportedFunction(expression, undefined, document, uri, exportedFunctions, isUseServerFile && isTsxFile);
            }
            ts.forEachChild(node, visit);
        };

        visit(sourceFile);

        // For .ts files with 'use server', consider all exports as actions
        if (isUseServerFile && path.extname(uri.fsPath) === '.ts') {
            ts.forEachChild(sourceFile, node => {
                if (ts.isExportDeclaration(node) || (ts.isVariableStatement(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword))) {
                    const range = new vscode.Range(
                        document.positionAt(node.getStart()),
                        document.positionAt(node.getEnd())
                    );
                    exportedFunctions.push(new ExportedFunctionItem('Exported Action', range, uri, false));
                }
            });
        }

        return exportedFunctions;
    }

    private addExportedFunction(
        node: ts.Node,
        functionName: string | undefined,
        document: vscode.TextDocument,
        uri: vscode.Uri,
        exportedFunctions: ExportedFunctionItem[],
        neverUnused: boolean
    ) {
        const range = new vscode.Range(
            document.positionAt(node.getStart()),
            document.positionAt(node.getEnd())
        );
        const name = functionName || 'Anonymous';
        exportedFunctions.push(new ExportedFunctionItem(name, range, uri, false, neverUnused));
    }

    private isUseServerFile(sourceFile: ts.SourceFile): boolean {
        let isUseServer = false;
        ts.forEachChild(sourceFile, node => {
            if (ts.isStringLiteral(node) && node.text === 'use server') {
                isUseServer = true;
            }
        });
        return isUseServer;
    }

    private getFullyQualifiedName(file: vscode.Uri, functionName: string): string {
        const relativePath = path.relative(this.workspaceRoot, file.fsPath);
        return `${relativePath}:${functionName}`;
    }

    public async findReferences(functionItem: {
        label: string,
        range: vscode.Range,
        uri: vscode.Uri,
        isUnused: boolean,
        neverUnused: boolean
    }): Promise<void> {
        const functionName = functionItem.label;
        const functionUri = functionItem.uri;

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Finding references for ${functionName}`,
            cancellable: true
        }, async (progress, token) => {
            try {
                const references = await vscode.commands.executeCommand<vscode.Location[]>(
                    'vscode.executeReferenceProvider',
                    functionUri,
                    functionItem.range.start
                );

                let statusChanged = false;

                if (references && references.length > 0) {
                    const externalReferences = references.filter(ref =>
                        !(ref.uri.fsPath === functionUri.fsPath && ref.range.isEqual(functionItem.range))
                    );

                    if (externalReferences.length === 0 && !functionItem.neverUnused) {
                        vscode.window.showInformationMessage(`No references found for ${functionName} other than its declaration.`);
                        statusChanged = this.markAsUnused(functionItem);
                    } else {
                        await this.showReferencesQuickPeek(functionName, externalReferences);
                        statusChanged = this.markAsUsed(functionItem);
                    }
                } else if (!functionItem.neverUnused) {
                    vscode.window.showInformationMessage(`No references found for ${functionName}`);
                    statusChanged = this.markAsUnused(functionItem);
                }

                if (statusChanged) {
                    this.queueUpdate();
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Error finding references: ${error}`);
            }
        });
    }

    private markAsUnused(functionItem: { label: string, uri: vscode.Uri, isUnused: boolean }) {
        if (!functionItem.isUnused) {
            const fullyQualifiedName = this.getFullyQualifiedName(functionItem.uri, functionItem.label);
            this.unusedFunctions.add(fullyQualifiedName);
            functionItem.isUnused = true;
            return true;
        }
        return false;
    }

    private markAsUsed(functionItem: { label: string, uri: vscode.Uri, isUnused: boolean }) {
        if (functionItem.isUnused) {
            const fullyQualifiedName = this.getFullyQualifiedName(functionItem.uri, functionItem.label);
            this.unusedFunctions.delete(fullyQualifiedName);
            functionItem.isUnused = false;
            return true;
        }
        return false;
    }

    private queueUpdate(): void {
        if (this.updateDebounceTimer) {
            clearTimeout(this.updateDebounceTimer);
        }

        this.updateDebounceTimer = setTimeout(() => {
            if (!this.isUpdating) {
                this.updateUnusedStatus();
            }
        }, 500);
    }

    private async updateUnusedStatus(): Promise<void> {
        if (this.isUpdating) {
            return;
        }

        this.isUpdating = true;
        try {
            this._onDidChangeTreeData.fire(undefined);
            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to allow UI update
        } finally {
            this.isUpdating = false;
        }
    }

    private async showReferencesQuickPeek(functionName: string, references: vscode.Location[]): Promise<void> {
        if (references.length === 0) {
            vscode.window.showInformationMessage(`No external references found for ${functionName}.`);
            return;
        }

        const items: vscode.QuickPickItem[] = await Promise.all(references.map(async (ref) => {
            const document = await vscode.workspace.openTextDocument(ref.uri);
            const range = document.getWordRangeAtPosition(ref.range.start) || ref.range;
            const text = document.getText(range);
            return {
                label: `${path.basename(ref.uri.fsPath)}:${ref.range.start.line + 1}`,
                description: text,
                detail: vscode.workspace.asRelativePath(ref.uri.fsPath)
            };
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Select a reference to '${functionName}' (${references.length} found)`
        });

        if (selected) {
            const selectedRef = references[items.indexOf(selected)];
            const document = await vscode.workspace.openTextDocument(selectedRef.uri);
            await vscode.window.showTextDocument(document, { selection: selectedRef.range });
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    update(newResults: DirectiveResult[]): void {
        this.results = newResults;
        this._onDidChangeTreeData.fire(undefined);
    }
}
