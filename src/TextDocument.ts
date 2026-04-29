import { DocChange, WrappingDocChange } from "@impermeable/waterproof-editor";
import { Position } from "./positionsRanges";

const enum EditType {
    Insert, Replace, Delete
}

function typeFromDocChange(change: DocChange): EditType {
    if (change.startInFile === change.endInFile) {
        return EditType.Insert;
    } else if (change.finalText.length !== 0) {
        return EditType.Replace;
    } else {
        return EditType.Delete;
    }
}

function isWrappingDocChange(change: DocChange | WrappingDocChange): change is WrappingDocChange {
    return "firstEdit" in change;
}

function isDocChange(change: DocChange | WrappingDocChange): change is DocChange {
    return !isWrappingDocChange(change);
}

/**
 * A simple in-memory representation of a text document.
 * 
 * Supports applying changes and tracking version.
 * 
 * Aims to mimic VSCode's TextDocument API.
 */
export class TextDocument {
    private _version: number = 1;
    constructor (private document: string, readonly uri: string = 'file:///tutorial.md') {
        console.log('TextDocument created, initial version:', this._version, 'length:', this.document.length);
    }

    /**
     * Apply a change to the document, updating its content and version.
     * @param change A Waterproof DocChange or WrappingDocChange to apply.
     * @returns the new version number after applying the change.
     */
    applyChange(change: DocChange | WrappingDocChange): number {
        if (isDocChange(change)) {
            this.document = this.document.substring(0, change.startInFile) + change.finalText + this.document.substring(change.endInFile);
        } else {
            // first edit
            const {firstEdit, secondEdit} = change;
            this.document = this.document.substring(0, firstEdit.startInFile) + firstEdit.finalText + this.document.substring(firstEdit.endInFile);
            const type = typeFromDocChange(firstEdit);
            const offset = (() => {
                switch (type) {
                    case EditType.Insert:
                    case EditType.Replace:
                        return firstEdit.finalText.length;
                    case EditType.Delete:
                        return firstEdit.endInFile - firstEdit.startInFile; 
                }
            })();

            this.document = this.document.substring(0, secondEdit.startInFile + offset) + secondEdit.finalText + this.document.substring(secondEdit.endInFile + offset);
        }

        return this._version++;
    }

    setText(text: string): number {
        this.document = text;
        return this._version++;
    }

    /**
     * Get the versioned document identifier for this document.
     * @returns An object containing the document URI and its current version.
     */
    get versionedIdentifier(): {uri: string, version: number} {
        return {
            uri: this.uri, version: this._version
        }
    }

    /**
     * Get the offset in the document for a given position.
     * @param position 
     * @returns 
     */
    offsetAt(position: { line: number, character: number }): number {
        const textDoc = this.document;
        const lineNum = position.line;
        const charNum = position.character;

        let i = 0;
        let line = 0;
        const len = textDoc.length;

        // Advance to start of requested line, handling \n
        while (i < len && line < lineNum) {
            const ch = textDoc[i];
            if (ch === '\n') {
                i += 1;
                line++;
            } else {
                i += 1;
            }
        }

        // This would mean that the position is beyond the end of the document.
        // TODO: For now we just return the document length in this case, should we error instead?
        if (line < lineNum) return len;

        // Compute length of the target line (up to the next line break)
        let j = i;
        while (j < len) {
            const ch = textDoc[j];
            if (ch === '\n') break;
            j++;
        }
        const remaining = j - i;

        // Return offset clamped to the line length
        return i + Math.min(charNum, remaining);
    }
    
    positionAt(offset: number): Position {
        const textDoc = this.document;
        const len = textDoc.length;
        let i = 0;
        let line = 0;
        let char = 0;
        
        // Clamp offset to document length
        if (offset > len) offset = len;
        
        while (i < offset) {
            const ch = textDoc[i];
            if (ch === '\n') {
                i += 1;
                line++;
                char = 0;
            } else {
                i += 1;
                char++;
            }
        }
        
        return new Position(line, char);
    }

    /**
     * Get the full text of the document.
     */
    get text() {
        return this.document;
    }

    get lineCount(): number {
        let lineCount = 0;
        const textDoc = this.document;
        const len = textDoc.length;
        let i = 0;

        while (i < len) {
            const ch = textDoc[i];
            if (ch === '\n') {
                i += 1;
                lineCount++;
            } else {
                i += 1;
            }
        }

        // Count the last line if the document does not end with a newline
        if (len > 0 && textDoc[len - 1] !== '\n') {
            lineCount++;
        }

        return lineCount;
    }

    getText(): string {
        return this.document;
    }

    get version(): number {
        return this._version;
    }
}