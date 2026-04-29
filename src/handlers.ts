import { Severity, WaterproofEditor } from "@impermeable/waterproof-editor";
import { TextDocument } from "./TextDocument";
import { convertToSimple } from "./lib/convertToSimple";

export function handleDiagnostics(editor: WaterproofEditor, textDocument: TextDocument) {
    return (params: any): void => {
        const diags = params.diagnostics.map((diag) => {
            return {
                message: diag.message,
                severity: diag.severity === 1 ? Severity.Error : diag.severity === 2 ? Severity.Warning : Severity.Information,
                startOffset: textDocument.offsetAt(diag.range.start),
                endOffset: textDocument.offsetAt(diag.range.end)
            }
        });
        editor.setActiveDiagnostics(diags);
    }
}

export function handleFileProgress(editor: WaterproofEditor, textDocument: TextDocument) {
    return  (params: any) => {
        // console.log("File progress:", params);
        const numberOfLines = textDocument.lineCount;
        const progress = params.processing.map(convertToSimple);
        const at = progress[0].range.start.line + 1;
        if (at === numberOfLines) {
            editor.reportProgress(at, numberOfLines, "File verified");
        } else {
            editor.reportProgress(at, numberOfLines, `Verified file up to line: ${at}`);
        }
    }
}

export function handleLogTrace() {
    return (params: any) => {
        console.log("LSP Trace:", params.message);
    }
}
