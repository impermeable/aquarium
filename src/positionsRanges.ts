
/** 
 * Mimics VSCode's Position class.
 */
export class Position {
    constructor(readonly line: number, readonly character: number) {}

    translate(lineDelta: number, charDelta: number): Position {
        return new Position(this.line + lineDelta, this.character + charDelta);
    }
}

/**
 * Mimics VSCode's Range class.
 */
export class Range {
    constructor(readonly start: Position, readonly end: Position) {}

    intersection(other: Range): Range | undefined {
        const startLine = Math.max(this.start.line, other.start.line);
        const startChar = (this.start.line === startLine) ? this.start.character : other.start.character;
        const endLine = Math.min(this.end.line, other.end.line);
        const endChar = (this.end.line === endLine) ? this.end.character : other.end.character;

        if (startLine > endLine || (startLine === endLine && startChar >= endChar)) {
            return undefined; // No intersection
        }

        return new Range(new Position(startLine, startChar), new Position(endLine, endChar));
    }
}