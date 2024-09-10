import * as vscode from 'vscode';
import * as ts from 'typescript';
import * as path from 'node:path';

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
