import { exec, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { getRegexForEditorSearch } from './utils';

let currentProcess: ChildProcess | undefined;

export interface SearchOptions {
    regex: string;
    globs: string[];
    rgPath: string;
    additional: string;
    multiline: boolean;
    patternFilePath?: string;
    unquotedRegex: string;
    filename?: string;
    maxBuffer?: number;
    outputChannel?: vscode.OutputChannel;
}


class RipgrepError extends Error {
    constructor(message: string, public stderr: string) {
        super(message);
        this.name = 'RipgrepError';
    }
}

class Match {
    fsPath: string;
    line: number;
    column: number;
    match: string;
    extraLines?: Match[];

    constructor(matchText: string) {
        const regex = /^(?<file>.*):(?<line>\d+):(?<column>\d+):(?<todo>.*)/;
        const match = regex.exec(matchText);

        if (match && match.groups) {
            this.fsPath = match.groups.file;
            this.line = parseInt(match.groups.line, 10);
            this.column = parseInt(match.groups.column, 10);
            this.match = match.groups.todo;
        } else {
            // Fall back to old method
            this.fsPath = "";
            if (matchText.length > 1 && matchText[1] === ':') {
                this.fsPath = matchText.substr(0, 2);
                matchText = matchText.substr(2);
            }
            const parts = matchText.split(':');
            const hasColumn = (parts.length === 4);
            this.fsPath += parts.shift() || "";
            this.line = parseInt(parts.shift() || "0", 10);
            this.column = hasColumn ? parseInt(parts.shift() || "1", 10) : 1;
            this.match = parts.join(':');
        }
    }
}

function formatResults(stdout: string, multiline: boolean): Match[] {
    stdout = stdout.trim();

    if (!stdout) {
        return [];
    }

    if (multiline) {
        const results: Match[] = [];
        const regex = getRegexForEditorSearch(true);
        const lines = stdout.split('\n');

        let buffer: string[] = [];
        let matches: Match[] = [];
        let text = "";

        lines.forEach((line) => {
            const resultMatch = new Match(line);
            buffer.push(line);
            matches.push(resultMatch);

            text = (text === "") ? resultMatch.match : text + '\n' + resultMatch.match;

            const fullMatch = text.match(regex);
            if (fullMatch) {
                const mainMatch = matches.shift();
                if (mainMatch) {
                    mainMatch.extraLines = matches;
                    results.push(mainMatch);
                }
                buffer = [];
                matches = [];
                text = "";
            }
        });

        return results;
    }

    return stdout.split('\n').map((line) => new Match(line));
}

function debug(text: string, options: SearchOptions): void {
    if (options.outputChannel) {
        const now = new Date();
        options.outputChannel.appendLine(`${now.toLocaleTimeString('en', { hour12: false })}.${String(now.getMilliseconds()).padStart(3, '0')} ${text}`);
    }
}

export function search(cwd: string, options: SearchOptions): Promise<Match[]> {
    if (!cwd) {
        return Promise.reject(new Error('No `cwd` provided'));
    }

    options.regex = options.regex || '';
    options.globs = options.globs || [];

    const rgPath = options.rgPath;
    const isWin = /^win/.test(process.platform);

    if (!fs.existsSync(rgPath)) {
        return Promise.reject(new Error(`ripgrep executable not found (${rgPath})`));
    }
    if (!fs.existsSync(cwd)) {
        return Promise.reject(new Error(`root folder not found (${cwd})`));
    }

    const escapedRgPath = isWin ? `"${rgPath}"` : rgPath.replace(/ /g, '\\ ');

    let execString = `${escapedRgPath} --no-messages --vimgrep -H --column --line-number --color never ${options.additional}`;
    if (options.multiline) {
        execString += " -U ";
    }

    if (options.patternFilePath) {
        debug(`Writing pattern file: ${options.patternFilePath}`, options);
        fs.writeFileSync(options.patternFilePath, options.unquotedRegex + '\n');
    }

    if (!fs.existsSync(options.patternFilePath || '')) {
        debug("No pattern file found - passing regex in command", options);
        execString = `${execString} -e ${options.regex}`;
    } else {
        execString = `${execString} -f "${options.patternFilePath}"`;
        debug(`Pattern: ${options.unquotedRegex}`, options);
    }

    execString = options.globs.reduce((command, glob) => {
        return `${command} -g "${glob}"`;
    }, execString);

    if (options.filename) {
        let filename = options.filename;
        if (isWin && filename.slice(-1) === "\\") {
            filename = filename.substr(0, filename.length - 1);
        }
        execString += ` "${filename}"`;
    } else {
        execString += " .";
    }

    debug(`Command: ${execString}`, options);

    return new Promise((resolve, reject) => {
        const maxBuffer = (options.maxBuffer || 200) * 1024;
        currentProcess = exec(execString, { cwd, maxBuffer });
        let results = "";

        currentProcess.stdout?.on('data', (data) => {
            debug(`Search results:\n${data}`, options);
            results += data;
        });

        currentProcess.stderr?.on('data', (data) => {
            debug(`Search failed:\n${data}`, options);
            if (options.patternFilePath && fs.existsSync(options.patternFilePath)) {
                fs.unlinkSync(options.patternFilePath);
            }
            reject(new RipgrepError(data, ""));
        });

        currentProcess.on('close', (code) => {
            if (options.patternFilePath && fs.existsSync(options.patternFilePath)) {
                fs.unlinkSync(options.patternFilePath);
            }
            resolve(formatResults(results, options.multiline));
        });
    });
}

export function kill(): void {
    if (currentProcess) {
        currentProcess.kill('SIGINT');
    }
}

export { Match, RipgrepError };
