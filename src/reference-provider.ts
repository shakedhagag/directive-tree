import * as vscode from 'vscode';
import * as ts from 'typescript';
import { DirectiveResult } from './types';
import * as path from 'path';

export class DirectiveReferenceProvider implements vscode.ReferenceProvider {
    constructor(private results: DirectiveResult[]) { }

    provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Location[]> {
        // Get the word at the current position
        const wordRange = document.getWordRangeAtPosition(position);
        const word = document.getText(wordRange);

        // Find the directive result for the current position
        const currentDirective = this.results.find(result =>
            result.uri.fsPath === document.uri.fsPath &&
            result.line === position.line + 1 &&
            result.match.includes(word)
        );

        if (!currentDirective) {
            return [];
        }

        // Find all references to the function in the workspace
        return vscode.workspace.findFiles('**/*.{js,ts,jsx,tsx}', '**/node_modules/**')
            .then(files => {
                const references: vscode.Location[] = [];

                files.forEach(file => {
                    const fileContent = vscode.workspace.openTextDocument(file).then(doc => {
                        const sourceFile = ts.createSourceFile(
                            file.fsPath,
                            doc.getText(),
                            ts.ScriptTarget.Latest,
                            true
                        );

                        this.findReferences(sourceFile, word, file, references);
                    });
                });

                return references;
            });
    }

    private findReferences(sourceFile: ts.SourceFile, word: string, file: vscode.Uri, references: vscode.Location[]): void {
        const visit = (node: ts.Node) => {
            if (ts.isIdentifier(node) && node.text === word) {
                const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
                references.push(new vscode.Location(file, new vscode.Range(start.line, start.character, end.line, end.character)));
            }

            ts.forEachChild(node, visit);
        };

        visit(sourceFile);
    }
}


export class UnusedFunctionDetector {
    private functionCalls: Set<string> = new Set();
    private exportedFunctions: Map<string, vscode.Uri> = new Map();

    constructor(private workspaceRoot: string) { }

    async analyzeFile(uri: vscode.Uri): Promise<void> {
        const document = await vscode.workspace.openTextDocument(uri);
        const sourceFile = ts.createSourceFile(
            uri.fsPath,
            document.getText(),
            ts.ScriptTarget.Latest,
            true
        );

        this.findExportsAndCalls(sourceFile, uri);
    }

    private findExportsAndCalls(sourceFile: ts.SourceFile, uri: vscode.Uri): void {
        const visit = (node: ts.Node) => {
            if (ts.isFunctionDeclaration(node) && node.name && this.hasExportKeyword(node)) {
                const functionName = node.name.text;
                this.exportedFunctions.set(this.getFullyQualifiedName(uri, functionName), uri);
            } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
                this.functionCalls.add(this.getFullyQualifiedName(uri, node.expression.text));
            }

            ts.forEachChild(node, visit);
        };

        visit(sourceFile);
    }

    private hasExportKeyword(node: ts.FunctionDeclaration): boolean {
        return node.modifiers !== undefined && node.modifiers.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
    }

    private getFullyQualifiedName(file: vscode.Uri, functionName: string): string {
        const relativePath = path.relative(this.workspaceRoot, file.fsPath);
        return `${relativePath}:${functionName}`;
    }

    getUnusedFunctions(): Set<string> {
        return new Set([...this.exportedFunctions.keys()].filter(func => !this.functionCalls.has(func)));
    }
}
