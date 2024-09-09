import * as vscode from 'vscode';
import * as path from 'path';
import { DirectiveResult, DirectiveTreeItem } from './types';
import { CategoryTreeItem, FolderTreeItem, FileTreeItem, ExportedFunctionItem } from './tree-items';
import * as ts from 'typescript';
import { UnusedFunctionDetector } from './reference-provider';

export class DirectiveTreeProvider implements vscode.TreeDataProvider<DirectiveTreeItem> {
    private expandedNodes: Set<string> = new Set();
    private _onDidChangeTreeData: vscode.EventEmitter<DirectiveTreeItem | undefined | null | void> = new vscode.EventEmitter<DirectiveTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DirectiveTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private unusedFunctions: Set<string> = new Set();
    private isAnalyzing: boolean = false;

    constructor(
        private results: DirectiveResult[],
        private context: vscode.ExtensionContext,
        private workspaceRoot: string
    ) { }

    getTreeItem(element: DirectiveTreeItem): vscode.TreeItem {
        if (element instanceof CategoryTreeItem || element instanceof FolderTreeItem) {
            const expanded = this.expandedNodes.has(element.id);
            element.collapsibleState = expanded
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed;
            element.contextValue = 'folder';
        }
        return element;
    }

    async getChildren(element?: DirectiveTreeItem): Promise<DirectiveTreeItem[]> {
        if (!element) {
            // Root level - return categories
            return [
                new CategoryTreeItem('use client', 'use-client', vscode.TreeItemCollapsibleState.Collapsed),
                new CategoryTreeItem('use server', 'use-server', vscode.TreeItemCollapsibleState.Collapsed)
            ];
        } else if (element instanceof CategoryTreeItem) {
            const categoryResults = this.results.filter(r => r.directive === element.label);
            return this.buildFolderStructure(categoryResults, element.id);
        } else if (element instanceof FolderTreeItem) {
            return element.children;
        } else if (element instanceof FileTreeItem) {
            return element.children;
        } else {
            return [];
        }
    }

    private async buildFolderStructure(results: DirectiveResult[], parentId: string): Promise<DirectiveTreeItem[]> {
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
                            this.getExpandedState(folderId) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
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
                    const exportedFunctions = await this.parseFileForExportedFunctions(result.uri);
                    const fileItem = new FileTreeItem(`${fileName}:${result.line}`, result, exportedFunctions, this.context);
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

                // Limit the number of files to process
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
                this._onDidChangeTreeData.fire();

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

        const visit = (node: ts.Node) => {
            if (ts.isFunctionDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                const range = new vscode.Range(
                    document.positionAt(node.getStart()),
                    document.positionAt(node.getEnd())
                );
                const functionName = node.name?.text || 'Anonymous';
                const fullyQualifiedName = this.getFullyQualifiedName(uri, functionName);
                const isUnused = this.unusedFunctions.has(fullyQualifiedName);
                exportedFunctions.push(new ExportedFunctionItem(functionName, range, uri, isUnused));
            }
            ts.forEachChild(node, visit);
        };

        visit(sourceFile);
        return exportedFunctions;
    }


    private getFullyQualifiedName(file: vscode.Uri, functionName: string): string {
        const relativePath = path.relative(this.workspaceRoot, file.fsPath);
        return `${relativePath}:${functionName}`;
    }

    private getExpandedState(element: string): boolean {
        return this.expandedNodes.has(element);
    }

    public setExpandedState(element: string, expanded: boolean) {
        if (expanded) {
            this.expandedNodes.add(element);
        } else {
            this.expandedNodes.delete(element);
        }
        this._onDidChangeTreeData.fire();
    }

    public toggleItem(element: DirectiveTreeItem): void {
        if (element instanceof CategoryTreeItem || element instanceof FolderTreeItem) {
            const currentState = this.getExpandedState(element.id);
            this.setExpandedState(element.id, !currentState);
        }
    }

    collapseAll(): void {
        this.expandedNodes.clear();
        this._onDidChangeTreeData.fire();
    }

    expandAll(): void {
        this.expandAllNodes(this.results);
        this._onDidChangeTreeData.fire();
    }

    private expandAllNodes(results: DirectiveResult[]): void {
        const expandAllNode = (nodeId: string) => {
            this.expandedNodes.add(nodeId);
            const parts = nodeId.split('-');
            while (parts.length > 1) {
                parts.pop();
                this.expandedNodes.add(parts.join('-'));
            }
        };

        results.forEach(result => {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(result.uri);
            if (workspaceFolder) {
                const relativePath = path.relative(workspaceFolder.uri.fsPath, path.dirname(result.uri.fsPath));
                const pathParts = relativePath.split(path.sep);

                let currentPath = '';
                let currentParentId = result.directive === 'use client' ? 'use-client' : 'use-server';

                expandAllNode(currentParentId);

                pathParts.forEach(part => {
                    currentPath = path.join(currentPath, part);
                    const folderId = `${currentParentId}-${currentPath}`;
                    expandAllNode(folderId);
                    currentParentId = folderId;
                });
            }
        });
    }

    public async findReferences(functionItem: ExportedFunctionItem): Promise<void> {
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

                if (references && references.length > 0) {
                    this.showReferencesQuickPick(functionName, references);
                    // Update unused status
                    const fullyQualifiedName = this.getFullyQualifiedName(functionUri, functionName);
                    this.unusedFunctions.delete(fullyQualifiedName);
                    this._onDidChangeTreeData.fire();
                } else {
                    vscode.window.showInformationMessage(`No references found for ${functionName}`);
                    // Update unused status
                    const fullyQualifiedName = this.getFullyQualifiedName(functionUri, functionName);
                    this.unusedFunctions.add(fullyQualifiedName);
                    this._onDidChangeTreeData.fire();
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Error finding references: ${error}`);
            }
        });
    }

    private async showReferencesQuickPick(functionName: string, references: vscode.Location[]): Promise<void> {
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
        this._onDidChangeTreeData.fire();
    }

    update(newResults: DirectiveResult[]): void {
        this.results = newResults;
        this._onDidChangeTreeData.fire();
    }
}
