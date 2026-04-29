import { InputAreaStatus } from "@impermeable/waterproof-editor";
import { TextDocument } from "./TextDocument";
import { Range } from "./positionsRanges";
import { LspClient } from "./lsp";

function findOccurrences(substr: string, str: string): number[] {
    const indices: number[] = [];
    const substrLen = substr.length;
    for (let i = 0; (i = str.indexOf(substr, i)) >= 0; i += substrLen) indices.push(i);
    return indices;  // sorted
}

/** Returns whether input areas are not interleaved. */
function isValid(open: number[], close: number[]): boolean {
    if (open.length !== close.length) return false;
    if (open.length && open[0] > close[0]) return false;  // "base" case of loop below
    for (let i = 1; i < open.length; i++)
        if (close[i-1] > open[i] || open[i] > close[i])
            return false;
    return true;
}

export function getInputAreas(textDocument: TextDocument): Range[] | undefined {
    const content = textDocument.getText();

    // find (positions of) opening and closings tags for input areas, and check that they're valid
    const openOffsets = findOccurrences("<input-area>", content);
    const closeOffsets = findOccurrences("</input-area>", content);
    if (!isValid(openOffsets, closeOffsets)) return undefined;

    // We know the length of this array in advance
    const inputAreas: Range[] = new Array(openOffsets.length);
    for (let i = 0; i < openOffsets.length; i++) {
        // Convert the open and close positions to ranges
        inputAreas[i] = new Range(
            textDocument.positionAt(openOffsets[i]),
            textDocument.positionAt(closeOffsets[i]),
        );
    }
    return inputAreas;
}

function isComplete(response): boolean {
    return !("error" in response);
}

// Works on the assumption that there is a `Qed.` right after the input area
// (i.e. should look like `<input-area>...</input-area>\n```coq\nQed.`)
export async function determineProofStatus(client: LspClient, textDocument: TextDocument, inputArea: Range): Promise<InputAreaStatus> {
    const pt = textDocument.offsetAt(inputArea.end) + "</input-area>\n```coq\nQe".length; // Some position inside the `Qed.` command
    const position = textDocument.positionAt(pt);
    const response = await client.requestGoals(position, textDocument);
    return isComplete(response) ? InputAreaStatus.Correct : InputAreaStatus.Incorrect;
}
