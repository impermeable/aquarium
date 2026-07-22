import { Severity, WaterproofEditor } from "@impermeable/waterproof-editor";
import { TextDocument } from "./TextDocument";
import { convertToSimple } from "./lib/convertToSimple";
import { diag } from "./diagnostics";

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
        if (progress.length === 0) return;
        const at = progress[0].range.start.line + 1;

        // H7: track where the checking frontier is and what source line it is
        // sitting on, so slow/stuck sentences can be identified in the console.
        const frontierLine = progress[0].range.start.line;
        diag.recordCheckFrontier(frontierLine, lineTextAt(textDocument, frontierLine));
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

/** Extract the text of a single (0-based) line from the document. */
function lineTextAt(textDocument: TextDocument, line: number): string {
    const start = textDocument.offsetAt({ line, character: 0 });
    const end = textDocument.offsetAt({ line, character: Number.MAX_SAFE_INTEGER });
    return textDocument.getText().slice(start, end);
}

/**
 * H7: handle `$/coq/filePerfData` notifications (sent when `send_perf_data` is
 * enabled in the server config). After a check completes, prints the slowest
 * sentences together with their source text, so the culprit sentence of a
 * long/stuck check can be identified directly from the console.
 */
export function handlePerfData(textDocument: TextDocument) {
    return (params: any): void => {
        const timings: any[] = params?.timings;
        if (!Array.isArray(timings) || timings.length === 0) return;

        const text = textDocument.getText();
        const rows = timings
            .map((t) => {
                const timeS: number = t?.info?.time ?? 0;
                const start = textDocument.offsetAt(t.range.start);
                const end = textDocument.offsetAt(t.range.end);
                return {
                    line: t.range.start.line + 1,
                    ms: timeS * 1000,
                    cached: t?.info?.cache_hit === true,
                    sentence: text.slice(start, end).replace(/\s+/g, " ").trim()
                };
            })
            .sort((a, b) => b.ms - a.ms)
            .slice(0, 10);

        console.log(`[diag perf] slowest sentences of last check (${timings.length} total) (H7):`);
        for (const r of rows) {
            console.log(
                `  ${r.ms.toFixed(0).padStart(7)}ms  line ${r.line}` +
                `${r.cached ? " (cached)" : ""}: ${r.sentence.slice(0, 120)}`
            );
        }
    }
}
