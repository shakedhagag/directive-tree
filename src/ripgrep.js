/* jshint esversion:6, node: true */
/* eslint-env node */

/**
 * This is a modified version of the ripgrep-js module from npm
 * written by alexlafroscia (github.com/alexlafroscia/ripgrep-js)
 * Instead of assuming that ripgrep is in the users path, it uses the
 * ripgrep binary downloaded via vscode-ripgrep.
 */

const child_process = require('node:child_process');
const fs = require('node:fs');
const utils = require('./utils');

function RipgrepError( error, stderr )
{
    this.message = error;
    this.stderr = stderr;
}

function formatResults(stdout, multiline) {
    const trimmedOutput = stdout.trim();

    if (!trimmedOutput) {
        return [];
    }

    if (multiline === true) {
        const results = [];
        const regex = utils.getRegexForEditorSearch(true);
        const lines = trimmedOutput.split('\n');

        let buffer = [];
        let matches = [];
        let text = "";

        for (const line of lines) {
            let resultMatch = new Match(line);
            buffer.push(line);
            matches.push(resultMatch);

            text = (text === "") ? resultMatch.match : `${text}\n${resultMatch.match}`;

            const fullMatch = text.match(regex);
            if (fullMatch) {
                resultMatch = matches[0];
                matches = matches.slice(1);
                resultMatch.extraLines = matches;
                results.push(resultMatch);
                buffer = [];
                matches = [];
                text = "";
            }
        }

        return results;
    }

    return trimmedOutput.split('\n').map((line) => new Match(line));
}

module.exports.search = function ripGrep( cwd, options )
{
    function debug( text )
    {
        if( options.outputChannel )
        {
            const now = new Date();
            options.outputChannel.appendLine( `${now.toLocaleTimeString( 'en', { hour12: false } )}.${String( now.getMilliseconds() ).padStart( 3, '0' )} ${text}` );
        }
    }

    if( !cwd )
    {
        return Promise.reject( { error: 'No `cwd` provided' } );
    }

    if (options.regex === undefined && options.globs.length === 0) {
        return Promise.reject({ error: 'No search term or globs provided' });
    }

    options.regex = options.regex || '';
    options.globs = options.globs || [];

    let rgPath = options.rgPath;
    const isWin = /^win/.test( process.platform );

    if( !fs.existsSync( rgPath ) )
    {
        return Promise.reject( { error: `ripgrep executable not found (${rgPath})` } );
    }
    if( !fs.existsSync( cwd ) )
    {
        return Promise.reject( { error: `root folder not found (${cwd})` } );
    }

    if( isWin )
    {
        rgPath = `"${rgPath}"`;
    }
    else
    {
        rgPath = rgPath.replace( / /g, '\\ ' );
    }

    let execString = `${rgPath} --no-messages --vimgrep -H --column --line-number --color never ${options.additional}`;
    if( options.multiline )
    {
        execString += " -U ";
    }

    if( options.patternFilePath )
    {
        debug( `Writing pattern file:${options.patternFilePath}` );
        fs.writeFileSync( options.patternFilePath, `${options.unquotedRegex}\n` );
    }

    if( !fs.existsSync( options.patternFilePath ) )
    {
        debug( "No pattern file found - passing regex in command" );
        execString = `${execString} -e ${options.regex}`;
    }
    else
    {
        execString = `${execString} -f \"${options.patternFilePath}\"`;
        debug( `Pattern:${options.unquotedRegex}` );
    }

    execString = options.globs.reduce( ( command, glob ) =>
    {
        return `${command} -g \"${glob}\"`;
    }, execString );

    if( options.filename )
    {
        let filename = options.filename;
        if( isWin && filename.slice( -1 ) === "\\" )
        {
            filename = filename.substr( 0, filename.length - 1 );
        }
        execString += ` \"${filename}\"`;
    }
    else
    {
        execString += " .";
    }

    debug( `Command: ${execString}` );

    return new Promise( ( resolve, reject )=> 
    {
        // The default for omitting maxBuffer, according to Node docs, is 200kB.
        // We'll explicitly give that here if a custom value is not provided.
        // Note that our options value is in KB, so we have to convert to bytes.
        const maxBuffer = ( options.maxBuffer || 200 ) * 1024;
        currentProcess = child_process.exec( execString, { cwd, maxBuffer } );
        let results = "";

        currentProcess.stdout.on( 'data', ( data )=> 
        {
            debug( `Search results:\n${data}` );
            results += data;
        } );

        currentProcess.stderr.on( 'data', ( data )=> 
        {
            debug( `Search failed:\n${data}` );
            if( fs.existsSync( options.patternFilePath ) === true )
            {
                fs.unlinkSync( options.patternFilePath );
            }
            reject( new RipgrepError( data, "" ) );
        } );

        currentProcess.on( 'close', ( code )=> 
        {
            if( fs.existsSync( options.patternFilePath ) === true )
            {
                fs.unlinkSync( options.patternFilePath );
            }
            resolve( formatResults( results, options.multiline ) );
        } );

    } );
};

module.exports.kill = ()=> 
{
    if( currentProcess !== undefined )
    {
        currentProcess.kill( 'SIGINT' );
    }
};

class Match {
    constructor(matchText) {
        // Detect file, line number and column which is formatted in the
        // following format: {file}:{line}:{column}:{code match}
        const regex = /^(?<file>.*):(?<line>\d+):(?<column>\d+):(?<todo>.*)/;

        const match = regex.exec(matchText);
        if (match?.groups) {
            this.fsPath = match.groups.file;
            this.line = Number.parseInt(match.groups.line);
            this.column = Number.parseInt(match.groups.column);
            this.match = match.groups.todo;
        } else {
            // Fall back to old method
            let remainingText = matchText;
            this.fsPath = "";

            if (remainingText.length > 1 && remainingText[1] === ':') {
                this.fsPath = remainingText.slice(0, 2);
                remainingText = remainingText.slice(2);
            }

            const parts = remainingText.split(':');
            const hasColumn = (parts.length === 4);
            
            this.fsPath += parts.shift();
            this.line = Number.parseInt(parts.shift());
            this.column = hasColumn ? Number.parseInt(parts.shift()) : 1;
            this.match = parts.join(':');
        }
    }
}

module.exports.Match = Match;