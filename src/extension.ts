import * as vscode from 'vscode';
import * as path from 'node:path';
import * as cp from 'node:child_process';
import { DirectiveTreeProvider } from './directive-tree-provider';
import { registerCommandsAndHandlers } from './commands';
import type { DirectiveResult, DirectiveTreeItem } from './types';

let directiveTreeView: vscode.TreeView<DirectiveTreeItem>;
let treeDataProvider: DirectiveTreeProvider;
let statusBarItem: vscode.StatusBarItem;
let results: DirectiveResult[] = [];

export function activate(context: vscode.ExtensionContext) {
    const workspaceRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : undefined;

    if (!workspaceRoot) {
        vscode.window.showErrorMessage("No workspace folder open. The Directive Tree extension requires a workspace folder to function.");
        return;
    }

    treeDataProvider = new DirectiveTreeProvider(results, context, workspaceRoot);
    directiveTreeView = vscode.window.createTreeView('directiveTreeView', {
        treeDataProvider: treeDataProvider
    });
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    statusBarItem.show();

    registerCommandsAndHandlers(
        context,
        treeDataProvider,
        directiveTreeView,
        statusBarItem,
        scanWorkspace,
        refreshFile,
        onDocumentSave,
        onConfigurationChange
    );
    scanWorkspace().then(() => {
        treeDataProvider.expandAll();
    }).catch(error => {
        console.error('Error during initial workspace scan:', error);
        vscode.window.showErrorMessage(`Error during initial workspace scan: ${error}`);
    });
}

export function deactivate() {
    // Clean up resources if needed
}

async function scanWorkspace(): Promise<void> {
    results = [];
    statusBarItem.text = "$(search) Scanning for 'use server' and 'use client'...";

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    try {
        for (const folder of workspaceFolders) {
            await scanFolder(folder.uri.fsPath);
        }

        updateTreeView();
        statusBarItem.text = `$(check) Found ${results.length} directive occurrences`;
        vscode.window.showInformationMessage(`Found ${results.length} directive occurrences`);
    } catch (error) {
        vscode.window.showErrorMessage(`Error scanning workspace: ${error}`);
        statusBarItem.text = "$(error) Scan failed";
    }
}

async function scanFolder(folderPath: string): Promise<void> {
    const options = {
        regex: '"use server"|"use client"',
        globs: ['!**/node_modules/**', '*.{js,ts,jsx,tsx}'],
        additional: '--hidden',
        filename: folderPath
    };

    try {
        await search(options);
    } catch (error) {
        vscode.window.showErrorMessage(`Error scanning folder: ${error}`);
    }
}

function search(options: { regex: string, globs?: string[], additional?: string, filename: string }): Promise<void> {
    return new Promise((resolve, reject) => {
        const rgPath = 'rg';
        const args = [
            '--no-messages',
            '--vimgrep',
            '-H',
            '--column',
            '--line-number',
            '--color', 'never',
            '-e', options.regex
        ];

        if (options.globs) {
            for (const glob of options.globs) {
                args.push('-g', glob);
            }
        }

        if (options.additional) {
            args.push(...options.additional.split(' '));
        }

        args.push(options.filename);

        const child = cp.spawn(rgPath, args, { cwd: path.dirname(options.filename) });
        let output = '';

        child.stdout.on('data', (data: Buffer) => {
            output += data.toString();
        });

        child.stderr.on('data', (data: Buffer) => {
            console.error(`Ripgrep error:  ${data.toString()}`);
        });

        child.on('close', (code: number) => {
            if (code !== 0) {
                reject(new Error(`Ripgrep process exited with code ${code}`));
            } else {
                const matches = output.trim().split('\n').filter(line => line.length > 0);
                for (const match of matches) {
                    try {
                        // Find the last occurrence of .ts, .tsx, .js, or .jsx
                        const extensionMatch = match.match(/\.(ts|tsx|js|jsx)(?=:)/);
                        if (!extensionMatch) {
                            continue;
                        }

                        const extensionIndex = match.lastIndexOf(extensionMatch[0]);
                        const filePath = match.slice(0, extensionIndex + extensionMatch[0].length);
                        const remainingParts = match.slice(extensionIndex + extensionMatch[0].length + 1).split(':');

                        if (remainingParts.length < 3) {
                            throw new Error('Invalid match format');
                        }

                        const [line, col, ...restParts] = remainingParts;
                        const matchText = restParts.join(':').trim();

                        // Get the workspace root
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
                        if (!workspaceRoot) {
                            throw new Error('No workspace root found');
                        }

                        // Create a relative path
                        const relativePath = path.relative(workspaceRoot, filePath);

                        const result: DirectiveResult = {
                            uri: vscode.Uri.file(path.join(workspaceRoot, relativePath)),
                            line: Number.parseInt(line, 10),
                            column: Number.parseInt(col, 10),
                            match: matchText,
                            directive: matchText.includes('use server') ? 'use server' : 'use client'
                        };
                        results.push(result);
                    } catch (error) {
                        console.error("Failed to parse match:", match, error);
                    }
                }
                resolve();
            }
        });
    });
}

async function refreshFile(document: vscode.TextDocument | undefined): Promise<void> {
    if (document) {
        // Remove all results for the current file
        results = results.filter(result => result.uri.fsPath !== document.uri.fsPath);

        const folderPath = path.dirname(document.uri.fsPath);

        // Scan only the current file, not the entire folder
        const options = {
            regex: '"use server"|"use client"',
            globs: ['*.{js,ts,jsx,tsx}'],
            additional: '--hidden',
            filename: document.uri.fsPath
        };

        try {
            await search(options);
            updateTreeView();
        } catch (error) {
            vscode.window.showErrorMessage(`Error refreshing file: ${error}`);
        }
    }
}

function updateTreeView(): void {
    treeDataProvider.update(results);
}

function onDocumentSave(document: vscode.TextDocument): void {
    refreshFile(document);
}

function onConfigurationChange(event: vscode.ConfigurationChangeEvent): void {
    if (event.affectsConfiguration('directive-tree')) {
        // Handle configuration changes
    }
}
