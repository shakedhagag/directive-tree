import * as vscode from 'vscode';
// biome-ignore lint/style/useImportType: <explanation>
import { CategoryTreeItem, FolderTreeItem, ExportedFunctionItem } from './tree-items';
import type { DirectiveTreeProvider } from './directive-tree-provider';
import type { DirectiveTreeItem } from './types';

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

        // vscode.commands.registerCommand('directive-tree.expandAll', () => {
        //     treeDataProvider.expandAll();
        // }),
        vscode.commands.registerCommand('directive-tree.findReferences', (functionItem: ExportedFunctionItem) => {
            treeDataProvider.findReferences(functionItem);
        }),
        vscode.workspace.onDidSaveTextDocument(onDocumentSave),
        vscode.workspace.onDidChangeConfiguration(onConfigurationChange),


        directiveTreeView.onDidChangeVisibility(event => {
            if (event.visible) {
                treeDataProvider.refresh();
            }
        }),

        statusBarItem,
        directiveTreeView
    );
}
