import * as vscode from 'vscode';
import * as path from 'path';
import * as icons from './icons';
import type { DirectiveResult } from './types';

export class CategoryTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly id: string,
        public collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.iconPath = new vscode.ThemeIcon(label === 'use client' ? 'browser' : 'server');
    }
}

export class FolderTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly id: string,
        public collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly children: (FolderTreeItem | FileTreeItem)[],
        public readonly relativePath: string,
        private context: vscode.ExtensionContext
    ) {
        super(label, collapsibleState);
        const folderName = path.basename(relativePath);
        this.iconPath = icons.getFolderIcon(folderName, this.collapsibleState === vscode.TreeItemCollapsibleState.Expanded, context);
        this.tooltip = this.relativePath;
    }
}

export class FileTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly result: DirectiveResult,
        public children: ExportedFunctionItem[],
        private context: vscode.ExtensionContext
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);

        const fileName = path.basename(this.result.uri.fsPath);
        const fileExtension = path.extname(fileName).slice(1).toLowerCase();

        this.tooltip = `${this.result.uri.fsPath}\nLine: ${this.result.line}, Column: ${this.result.column}`;
        this.description = this.result.match.trim();

        this.iconPath = icons.getIcon(fileExtension, this.context);

        this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [this.result.uri, { selection: new vscode.Range(this.result.line - 1, this.result.column - 1, this.result.line - 1, this.result.column + this.result.directive.length) }]
        };
    }
}

export class ExportedFunctionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly range: vscode.Range,
        public readonly uri: vscode.Uri,
        public isUnused: boolean,
        public readonly neverUnused: boolean = false
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'exportedFunction';
        this.command = this.createCommand();
        this.updateIconAndTooltip();
    }

    updateIconAndTooltip() {
        if (this.neverUnused) {
            this.iconPath = new vscode.ThemeIcon('check');
            this.tooltip = 'Server Action (always used)';
        } else if (this.isUnused) {
            this.iconPath = new vscode.ThemeIcon('warning');
            this.tooltip = 'Unused function';
        } else {
            this.iconPath = new vscode.ThemeIcon('symbol-function');
            this.tooltip = 'Used function';
        }
    }

    private createCommand(): vscode.Command {
        return {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [
                this.uri,
                {
                    selection: this.range
                }
            ]
        };
    }
}
