import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { DirectiveTreeProvider } from './directive-tree-provider';
import { registerCommandsAndHandlers } from './commands';
import type { DirectiveResult, DirectiveTreeItem } from './types';
import * as cp from 'node:child_process';

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
        treeDataProvider: treeDataProvider,
        showCollapseAll: true
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
    scanWorkspace().catch(error => {
        console.error('Error during initial workspace scan:', error);
        vscode.window.showErrorMessage(`Error during initial workspace scan: ${error.message}`);
    });
}

export function deactivate() {
    // Clean up resources if needed
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    if (directiveTreeView) {
        directiveTreeView.dispose();
    }
    // Clear the results array
    results = [];
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
        console.error('Error during workspace scan:', error);
        vscode.window.showErrorMessage(`Error scanning workspace: ${error instanceof Error ? error.message : String(error)}`);
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
        console.error(`Error scanning folder ${folderPath}:`, error);
        vscode.window.showWarningMessage(`Error scanning folder ${folderPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function getRipgrepPath(): string {
    const isWin = /^win/.test(process.platform);
    const exeName = isWin ? 'rg.exe' : 'rg';
    const appRootUri = vscode.Uri.parse(vscode.env.appRoot);

    const paths = [
        vscode.Uri.joinPath(appRootUri, 'node_modules/vscode-ripgrep/bin/', exeName),
        vscode.Uri.joinPath(appRootUri, 'node_modules.asar.unpacked/vscode-ripgrep/bin/', exeName),
        vscode.Uri.joinPath(appRootUri, 'node_modules/@vscode/ripgrep/bin/', exeName),
        vscode.Uri.joinPath(appRootUri, 'node_modules.asar.unpacked/@vscode/ripgrep/bin/', exeName)
    ];

    for (const path of paths) {
        if (fs.existsSync(path.fsPath)) {
            return path.fsPath;
        }
    }
    console.warn('Bundled ripgrep not found. Falling back to system rg');
    return 'rg';
}


function search(options: { regex: string, globs?: string[], additional?: string, filename: string }): Promise<void> {
    return new Promise((resolve, reject) => {
        let rgPath: string;
        try {
            rgPath = getRipgrepPath();
            console.log('Using ripgrep from:', rgPath);
        } catch (error) {
            console.error('Error getting ripgrep path:', error);
            vscode.window.showErrorMessage('Ripgrep not found. Please install ripgrep or reinstall the extension.');
            reject(error);
            return;
        }

        // Check if the file exists and is accessible
        if (!fs.existsSync(options.filename)) {
            console.error(`File not found: ${options.filename}`);
            reject(new Error(`File not found: ${options.filename}`));
            return;
        }

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

        console.log('Executing ripgrep with args:', args.join(' '));

        const child = cp.spawn(rgPath, args, { cwd: path.dirname(options.filename) });
        let output = '';
        let errorOutput = '';

        child.stdout.on('data', (data: Buffer) => {
            output += data.toString();
        });

        child.stderr.on('data', (data: Buffer) => {
            errorOutput += data.toString();
            console.error(`Ripgrep error: ${data.toString()}`);
        });

        child.on('error', (error) => {
            console.error('Failed to start ripgrep process:', error);
            reject(new Error(`Failed to start ripgrep process: ${error.message}`));
        });

        child.on('close', (code: number) => {
            if (code !== 0) {
                console.error(`Ripgrep process exited with code ${code}. Error: ${errorOutput}`);
                // Implement a fallback mechanism here if needed
                // For example, you could use a simple regex search on the file contents
                vscode.workspace.openTextDocument(options.filename).then(document => {
                    const text = document.getText();
                    const regex = new RegExp(options.regex, 'g');
                    let match: RegExpExecArray | null;
                    while (true) {
                        match = regex.exec(text);
                        if (match === null) {break;}
                        const position = document.positionAt(match.index);
                        const line = position.line + 1;
                        const column = position.character + 1;
                        output += `${options.filename}:${line}:${column}:${match[0]}\n`;
                    }
                    
                    processSearchResults(output);
                    resolve();
                });
            } else {
                try {
                    processSearchResults(output);
                    resolve();
                } catch (error) {
                    reject(new Error(`Error processing search results: ${error instanceof Error ? error.message : String(error)}`));
                }
            }
        });
    });
}

function processSearchResults(output: string): void {
    const matches = output.trim().split('\n').filter(line => line.length > 0);
    for (const match of matches) {
        try {
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

            const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
            if (!workspaceRoot) {
                throw new Error('No workspace root found');
            }

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
            vscode.window.showWarningMessage('Failed to parse a search result. Some results may be missing.');
        }
    }
}

async function refreshFile(document: vscode.TextDocument | undefined): Promise<void> {
    if (document) {
        results = results.filter(result => result.uri.fsPath !== document.uri.fsPath);

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
            console.error('Error refreshing file:', error);
            
            // Check if the error is related to the Cursor editor's file sync
            if (error instanceof Error && error.message.includes('Client not initialized')) {
                console.log('Cursor file sync error detected. Retrying after a short delay...');
                
                // Retry after a short delay
                setTimeout(async () => {
                    try {
                        await search(options);
                        updateTreeView();
                    } catch (retryError) {
                        console.error('Error on retry:', retryError);
                        vscode.window.showErrorMessage(`Error refreshing file: ${retryError instanceof Error ? retryError.message : String(retryError)}`);
                    }
                }, 1000); // 1 second delay
            } else {
                vscode.window.showErrorMessage(`Error refreshing file: ${error instanceof Error ? error.message : String(error)}`);
            }
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