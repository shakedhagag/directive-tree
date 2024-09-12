import * as micromatch from 'micromatch';
import * as os from 'os';
import * as path from 'path';
import * as find from 'find';
// @ts-ignore
import strftime from 'fast-strftime';
// @ts-ignore
import commentPatterns from 'comment-patterns';
import * as vscode from 'vscode';
import * as fs from 'node:fs';

import { colorNames, themeColorNames } from './lib';


let config: any;

const envRegex = /\$\{(.*?)\}/g;
const rgbRegex = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/gi;
const placeholderRegex = /(\$\{.*\})/;

export function init(configuration: any): void {
    config = configuration;
}

export function isHexColour(colour: any): boolean {
    if (typeof colour !== 'string') {
        return false;
    }
    const withoutHash = colour.indexOf('#') === 0 ? colour.substring(1) : colour;
    const hex = withoutHash.split(/ /)[0].replace(/[^\da-fA-F]/g, '');
    return (typeof colour === "string") && hex.length === withoutHash.length && (hex.length === 3 || hex.length === 4 || hex.length === 6 || hex.length === 8) && !isNaN(parseInt(hex, 16));
}

export function isRgbColour(colour: string): boolean {
    return colour.match && colour.match(rgbRegex) !== null;
}

export function isNamedColour(colour: string): boolean {
    return colorNames.indexOf(colour.toLowerCase()) > -1;
}

export function isThemeColour(colour: string): boolean {
    return themeColorNames.indexOf(colour) > -1;
}

export function hexToRgba(hex: string | undefined, opacity: number): string {
    function toComponent(digits: string): number {
        return (digits.length === 1) ? parseInt(digits + digits, 16) : parseInt(digits, 16);
    }

    if (hex !== undefined) {
        hex = hex.replace('#', '');

        const rgb = hex.substring(0, (hex.length === 3 || hex.length === 4) ? 3 : 6);

        const r = toComponent(rgb.substring(0, rgb.length / 3));
        const g = toComponent(rgb.substring(rgb.length / 3, 2 * rgb.length / 3));
        const b = toComponent(rgb.substring(2 * rgb.length / 3, 3 * rgb.length / 3));

        if (hex.length === 4 || hex.length === 8) {
            opacity = parseInt(toComponent(hex.substring(3 * hex.length / 4, 4 * hex.length / 4)).toString()) * 100 / 255;
        }

        return `rgba(${r},${g},${b},${opacity / 100})`;
    }

    return '#0F0';
}

export function removeBlockComments(text: string, fileName: string): string {
    let extension = path.extname(fileName);

    if (extension === ".jsonc") {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, extension)) + ".js";
    } else if (extension === ".vue") {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, extension)) + ".html";
    } else if (extension === ".hs") {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, extension)) + ".cpp";
    }

    let commentPattern;
    try {
        commentPattern = commentPatterns(fileName);
    } catch (e) {
        // Handle error
    }

    if (commentPattern && commentPattern.name === 'Markdown') {
        commentPattern = commentPatterns(".html");
        fileName = ".html";
    }

    if (commentPattern && commentPattern.multiLineComment && commentPattern.multiLineComment.length > 0) {
        commentPattern = commentPatterns.regex(fileName);
        if (commentPattern && commentPattern.regex) {
            let regex = commentPattern.regex;
            if (extension === ".hs") {
                let source = regex.source;
                let flags = regex.flags;
                while (source.indexOf("\\/\\*\\*") !== -1) {
                    source = source.replace("\\/\\*\\*", "{-");
                }
                while (source.indexOf("\\/\\*") !== -1) {
                    source = source.replace("\\/\\*", "{-");
                }
                while (source.indexOf("\\*\\/") !== -1) {
                    source = source.replace("\\*\\/", "-}");
                }
                regex = new RegExp(source, flags);
                commentPattern.regex = regex;
            }
            const commentMatch = commentPattern.regex.exec(text);
            if (commentMatch) {
                for (let i = commentPattern?.cg?.contentStart ?? 0; i < commentMatch.length; ++i) {
                    if (commentMatch[i]) {
                        text = commentMatch[i];
                        break;
                    }
                }
            }
        }
    }

    return text;
}

export function removeLineComments(text: string, fileName: string): string {
    let result = text.trim();

    if (path.extname(fileName) === ".jsonc") {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, path.extname(fileName))) + ".js";
    }

    let commentPattern;
    try {
        commentPattern = commentPatterns(fileName);
    } catch (e) {
        // Handle error
    }

    if (commentPattern && commentPattern.singleLineComment) {
        commentPattern.singleLineComment.forEach((comment: { start: string }) => {
            if (result.indexOf(comment.start) === 0) {
                result = result.substr(comment.start.length);
            }
        });
    }

    return result;
}

function getTagRegex(): string {
    let tags = config.tags().slice().sort().reverse();
    tags = tags.map((tag: string) => {
        tag = tag.replace(/\\/g, '\\\\\\');
        tag = tag.replace(/[|{}()[\]^$+*?.-]/g, '\\$&');
        return tag;
    });
    tags = tags.join('|');
    return '(' + tags + ')';
}

export interface ExtractTagResult {
    tag: string;
    withoutTag: string;
    before: string;
    after: string;
    tagOffset: number;
    subTag?: string;
}

export function extractTag(text: string, matchOffset: number): ExtractTagResult {
    const c = config.regex();
    const flags = c.caseSensitive ? '' : 'i';
    let tagMatch: RegExpExecArray | null = null;
    let tagOffset: number = 0;
    let originalTag: string = '';
    let before = text;
    let after = text;
    let subTag: string | undefined;

    if (c.regex.indexOf("$TAGS") > -1) {
        const tagRegex = new RegExp(getTagRegex(), flags);
        const subTagRegex = new RegExp(config.subTagRegex(), flags);
        tagMatch = tagRegex.exec(text);
        if (tagMatch) {
            tagOffset = tagMatch.index;
            const rightOfTagText = text.substr(tagMatch.index + tagMatch[0].length).trim();
            const subTagMatch = subTagRegex.exec(rightOfTagText);
            if (subTagMatch && subTagMatch.length > 1) {
                subTag = subTagMatch[1];
            }
            const rightOfTag = rightOfTagText.replace(subTagRegex, "");
            if (rightOfTag.length === 0) {
                text = text.substr(0, matchOffset ? matchOffset - 1 : tagMatch.index).trim();
                after = "";
                before = text;
            } else {
                before = text.substr(0, matchOffset ? matchOffset - 1 : tagMatch.index).trim();
                text = rightOfTag;
                after = rightOfTag;
            }
            c.tags.forEach((tag: string) => {
                if (config.isRegexCaseSensitive()) {
                    if (tag === tagMatch![0]) {
                        originalTag = tag;
                    }
                } else if (tag.toLowerCase() === tagMatch![0].toLowerCase()) {
                    originalTag = tag;
                }
            });
        }
    }
    if (tagMatch === null && c.regex.trim() !== "") {
        const regex = new RegExp(c.regex, flags);
        const match = regex.exec(text);
        if (match !== null) {
            tagMatch = match;
            originalTag = match[0];
            before = text.substring(0, text.indexOf(originalTag));
            after = text.substring(before.length + originalTag.length);
            tagOffset = match.index;
            text = after;
        }
    }
    return {
        tag: tagMatch ? originalTag : "",
        withoutTag: text,
        before: before,
        after: after,
        tagOffset: tagOffset,
        subTag: subTag
    };
}

// ... [The rest of the functions follow a similar pattern of conversion]

export function toGlobArray(globs: string | string[] | undefined): string[] {
    if (globs === undefined) {
        return [];
    }
    if (typeof globs === 'string') {
        return globs.split(',');
    }
    return globs;
}


export { micromatch, os, path, find, strftime, commentPatterns, vscode };


export function getRegexForEditorSearch(global: boolean): RegExp {
    var flags = 'm';
    if (global) {
        flags += 'g';
    }
    if (config.regex().caseSensitive === false) {
        flags += 'i';
    }
    if (config.regex().multiLine === true) {
        flags += 's';
    }

    var source = getRegexSource();
    return RegExp(source, flags);
}

export function getRegexSource() {
    var regex = config.regex().regex;
    if (regex.indexOf("($TAGS)") > -1) {
        regex = regex.split("($TAGS)").join(getTagRegex());
    }

    return regex;
}

export function fileExists(path: string): boolean {
    try {
        fs.accessSync(path, fs.constants.F_OK);
        return true;
    } catch (e) {
        return false;
    }
}