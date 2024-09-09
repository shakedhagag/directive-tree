import * as vscode from 'vscode';
import { CategoryTreeItem, FolderTreeItem, ExportedFunctionItem } from './tree-items';
import { DirectiveTreeProvider } from './directive-tree-provider';
import { DirectiveTreeItem } from './types';

export function registerCommandsAndHandlers(
    context: vscode.ExtensionContext,
    treeDataProvider: DirectiveTreeProvider,
    directiveTreeView: vscode.TreeView<DirectiveTreeItem>,
    statusBarItem: vscode.StatusBarItem,
    scanWorkspace: () => Promise<void>,
    refreshFile: (document: vscode.TextDocument | undefined) => Promise<void>,
    onDocumentSave: (document: vscode.TextDocument) => void,
    onConfigurationChange: (event: vscode.ConfigurationChangeEvent) => void
) {
    context.subscriptions.push(
        vscode.commands.registerCommand('directive-tree.scanDirectives', () => {
            scanWorkspace();
        }),
        vscode.commands.registerCommand('directive-tree.refreshDirectives', () => {
            refreshFile(vscode.window.activeTextEditor?.document);
        }),
        vscode.commands.registerCommand('directive-tree.minimizeTree', () => {
            treeDataProvider.collapseAll();
        }),
        vscode.commands.registerCommand('directive-tree.expandTree', () => {
            treeDataProvider.expandAll();
        }),
        vscode.commands.registerCommand('directive-tree.findReferences', (functionItem: ExportedFunctionItem) => {
            treeDataProvider.findReferences(functionItem);
        }),
        vscode.workspace.onDidSaveTextDocument(onDocumentSave),
        vscode.workspace.onDidChangeConfiguration(onConfigurationChange),
        vscode.commands.registerCommand('directive-tree.toggleItem', (item: DirectiveTreeItem) => {
            treeDataProvider.toggleItem(item);
        }),
        directiveTreeView.onDidChangeSelection(selection => {
            if (selection.selection.length > 0) {
                const item = selection.selection[0];
                if (item instanceof CategoryTreeItem || item instanceof FolderTreeItem) {
                    treeDataProvider.toggleItem(item);
                }
            }
        }),
        vscode.commands.registerCommand('directive-tree.expandFolder', (item: DirectiveTreeItem) => {
            if (item instanceof CategoryTreeItem || item instanceof FolderTreeItem) {
                treeDataProvider.setExpandedState(item.id, true);
            }
        }),
        vscode.commands.registerCommand('directive-tree.collapseFolder', (item: DirectiveTreeItem) => {
            if (item instanceof CategoryTreeItem || item instanceof FolderTreeItem) {
                treeDataProvider.setExpandedState(item.id, false);
            }
        }),
        directiveTreeView.onDidChangeVisibility(event => {
            if (event.visible) {
                treeDataProvider.refresh();
            }
        }),
        directiveTreeView.onDidCollapseElement(element => {
            if (element.element instanceof CategoryTreeItem || element.element instanceof FolderTreeItem) {
                treeDataProvider.setExpandedState(element.element.id, false);
            }
        }),
        directiveTreeView.onDidExpandElement(element => {
            if (element.element instanceof CategoryTreeItem || element.element instanceof FolderTreeItem) {
                treeDataProvider.setExpandedState(element.element.id, true);
            }
        }),
        statusBarItem,
        directiveTreeView
    );
}
