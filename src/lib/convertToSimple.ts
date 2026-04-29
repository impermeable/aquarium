
export function convertToSimple(info: any) {
    const r = info.range;
    return {
        range: {
            start: { line: r.start.line, character: r.start.character },
            end:   { line: r.end.line,   character: r.end.character   }
        },
        kind: info.kind
    }
}

