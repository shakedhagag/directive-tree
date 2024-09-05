import type { Uri } from "vscode";

import { CategoryTreeItem, FolderTreeItem, FileTreeItem } from "./tree-items";

export type DirectiveTreeItem = CategoryTreeItem | FolderTreeItem | FileTreeItem;

export interface DirectiveResult {
    uri: Uri;
    line: number;
    column: number;
    match: string;
    directive: 'use server' | 'use client';
}
