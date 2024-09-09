import * as vscode from 'vscode';
import * as path from 'path';
import { DirectiveResult, DirectiveTreeItem } from './types';
import { CategoryTreeItem, FolderTreeItem, FileTreeItem, ExportedFunctionItem } from './tree-items';
import * as ts from 'typescript';

export class DirectiveTreeProvider implements vscode.TreeDataProvider<DirectiveTreeItem> {
    private expandedNodes: Set<string> = new Set();
    private _onDidChangeTreeData: vscode.EventEmitter<DirectiveTreeItem | undefined | null | void> = new vscode.EventEmitter<DirectiveTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DirectiveTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(
        private results: DirectiveResult[],
        private context: vscode.ExtensionContext
    ) { }

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
                exportedFunctions.push(new ExportedFunctionItem(node.name?.text || 'Anonymous', range, uri));
            }
            ts.forEachChild(node, visit);
        };

        visit(sourceFile);
        return exportedFunctions;
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
                            if (part === 'app') {
                                rootItems.push(newFolder);
                            } else {
                                // For non-app root folders, add them directly to rootItems
                                rootItems.push(newFolder);
                            }
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

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    update(newResults: DirectiveResult[]): void {
        this.results = newResults;
        this._onDidChangeTreeData.fire();
    }
}
