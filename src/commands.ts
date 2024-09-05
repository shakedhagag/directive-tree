import * as vscode from 'vscode';
import { CategoryTreeItem, FolderTreeItem } from './tree-items';
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
            console.log('directive-tree.scanDirectives command triggered');
            scanWorkspace();
        }),
        vscode.commands.registerCommand('directive-tree.refreshDirectives', () => {
            console.log('directive-tree.refreshDirectives command triggered');
            refreshFile(vscode.window.activeTextEditor?.document);
        }),
        vscode.commands.registerCommand('directive-tree.minimizeTree', () => {
            console.log('directive-tree.minimizeTree command triggered');
            treeDataProvider.collapseAll();
        }),
        vscode.commands.registerCommand('directive-tree.expandTree', () => {
            console.log('directive-tree.expandTree command triggered');
            treeDataProvider.expandAll();
        }),
        vscode.workspace.onDidSaveTextDocument(onDocumentSave),
        vscode.workspace.onDidChangeConfiguration(onConfigurationChange),
        vscode.commands.registerCommand('directive-tree.toggleItem', (item: DirectiveTreeItem) => {
            console.log('directive-tree.toggleItem command triggered');
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
