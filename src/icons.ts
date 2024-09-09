import * as vscode from 'vscode';
import * as path from 'path';

const iconMap: { [key: string]: string } = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'react',
    tsx: 'react_ts',
    html: 'html',
    css: 'css',
    json: 'json',
};

export function getIcon(fileExtension: string, context: vscode.ExtensionContext) {
    try {
        const iconName = iconMap[fileExtension] || 'file';
        // Check if we have a custom icon for this file type
        if (iconName !== 'file') {
            const iconPath = context.asAbsolutePath(path.join('resources', `${iconName}.svg`));
            return iconPath;
        }

        // Fallback to VSCode's built-in file icon
        return new vscode.ThemeIcon('file');
    } catch (error) {
        console.error('Error in getIcon function:', error);
        return new vscode.ThemeIcon('file');
    }
}


export function getFolderIcon(folderName: string, isExpanded: boolean, context: vscode.ExtensionContext) {

    try {
        if (folderName === 'app') {
            const iconName = isExpanded ? 'folder_app_open' : 'folder_app';
            const iconPath = context.asAbsolutePath(path.join('resources', `${iconName}.svg`));

            return iconPath;
        }

        return new vscode.ThemeIcon(isExpanded ? 'folder-opened' : 'folder');
    } catch (error) {
        console.error('Error in getFolderIcon function:', error);
        return new vscode.ThemeIcon(isExpanded ? 'folder-opened' : 'folder');
    }
}
