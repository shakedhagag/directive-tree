// custom-types.d.ts

declare module 'comment-patterns' {
    interface CommentPattern {
        name?: string;
        multiLineComment?: Array<{ start: string, end: string }>;
        singleLineComment?: Array<{ start: string }>;
        regex?: RegExp;
        cg?: {
            contentStart: number;
        };
    }

    function commentPatterns(fileName: string): CommentPattern;

    namespace commentPatterns {
        function regex(fileName: string): CommentPattern;
    }

    export = commentPatterns;
}

declare module 'fast-strftime' {
    function strftime(format: string, date?: Date): string;

    export = strftime;
}
