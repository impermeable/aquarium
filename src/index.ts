
import tutorialContents from "./data/tutorial.md";
import { WaterproofEditor, WaterproofEditorConfig, DocChange, ThemeStyle, WrappingDocChange, InputAreaStatus} from "@impermeable/waterproof-editor";
import { markdown } from "@impermeable/waterproof-editor";
import { continuousChecking, LspClient, serverConfig } from "./lsp";
import { TextDocument } from "./TextDocument";
import { determineProofStatus, getInputAreas } from "./inputAreas";
import symbols from "./data/symbols.json";
import tactics from "./data/tactics.json";
import { Position, Range } from "./positionsRanges";
import { GoalsPanel } from "./GoalsPanel";
import { executeCommandFullOutput } from "./lib/commandExecutor";

import "@impermeable/waterproof-editor/styles.css";
import "@impermeable/waterproof-editor/waterproof-defaults.css";
import { highlight_dark, highlight_light, waterproof } from "@impermeable/codemirror-lang-waterproof";
import { handleDiagnostics, handleFileProgress, handleLogTrace } from "./handlers";

// Entry point of the web application, calls the main function.
window.onload = async () => { 
    // Check if there's a file parameter in the URL.
    // If there is, fetch that file and load it into the editor
    const queryString = window.location.search;
    
    if (queryString !== "") {
        const urlParams = new URLSearchParams(queryString);
        // "?file=", "?sheet=" and "?exercise=" all work
        const fileParam = urlParams.get("file") || urlParams.get("sheet") || urlParams.get("exercise");
        
        if (fileParam) {
            console.log("Custom file parameter found in URL:", fileParam);
            
            const fileUrl = new URL(fileParam, window.location.origin).href;
            // For GitHub URLs, we allow users to input the regular GitHub URL, which we convert to
            // an URL that points to the raw text file.
            const rawUrl = fileUrl.includes("github.com") && !fileUrl.includes("raw.githubusercontent.com")
                ? fileUrl.replace("github.com", "raw.githubusercontent.com").replace("/blob/", '/')
                : fileUrl;
            try {
                const response = await fetch(rawUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${rawUrl}`);
                }
                const content = await response.text();
                await main(content);
            } catch (error) {
                console.error("Error fetching file:", error);
                alert(`Failed to load file from URL parameter. Loading default file instead.`);
                await main();
            }
        } else {
            await main();
        }
    } else {
        // no file parameter, load custom tutorial
        await main();
    }
}

let viewPortRange: Range | null = null;
let currentPos: Position | null = null;

let teacherMode = false;

async function main(text?: string) {
    // Create the editor
    const editorElem = document.getElementById("editor");
    if (!editorElem) return;

    // Start with the adapted tutorial file if no other text is provided
    const documentText = text ?? tutorialContents;
    
    

    // Display loading indicator (we are setting up the language server)
    editorElem.innerHTML = `
        <div id="loading-spinner-container" style="display: flex; justify-content: center; align-items: center; height: 100%;">
            <div class="lsp-spinner"></div>
        </div>
    `;

    // Initialize the TextDocument
    const textDocument = new TextDocument(documentText);

    // Create the LSP client object with the document and configuration
    // this will also start the language server in a web worker
    const lspClient = new LspClient(documentText, textDocument.uri, serverConfig);
    // Initialize the server
    await lspClient.initializeServer();

    // Create the goals panel
    const goalsPanel = new GoalsPanel(document.getElementById("goals-panel")!, executeHelp);

    // Define a waterproof editor config object
    const config: WaterproofEditorConfig = {
        completions: tactics,
        symbols,
        api: {
            executeCommand: function (): void {
                // we don't support commands other than "Help." so this is a no-op.
            },
            executeHelp: function (): void {
                executeHelp();
            },
            editorReady: function (): void {
                console.log("Editor is ready.");
            },
            documentChange: function (change: DocChange | WrappingDocChange): void {
                textDocument.applyChange(change);
                const documentText = textDocument.text;

                const didChangeParams = {
                    textDocument: textDocument.versionedIdentifier,
                    contentChanges: [{
                        text: documentText
                    }]
                };
                lspClient.sendNotification("textDocument/didChange", didChangeParams);
            },
            applyStepError: function (errorMessage: string): void {
                console.error("Received an error when applying a ProseMirror step: \n", errorMessage);
            },
            cursorChange: function (cursorPosition: number): void {
                currentPos = textDocument.positionAt(cursorPosition);
                lspClient.requestGoals(currentPos, textDocument).then((goals) => {
                    goalsPanel.render(goals);
                }).catch((error) => {
                    if (!wasCanceledByServer(error)) {
                        console.error("Error requesting goals:", error);
                    }
                });
            },
            viewportHint: handleViewportHint
        },
        documentConstructor: (doc: string) => markdown.parse(doc, {language: "coq"}),
        tagConfiguration: markdown.configuration("coq"),
        languageConfig: {
            highlightDark: highlight_dark,
            highlightLight: highlight_light,
            languageSupport: waterproof()
        }
    }
    editorElem.innerHTML = ""; // Clear loading messages
    const editor = new WaterproofEditor(editorElem, config, ThemeStyle.Light);
    editor.init(documentText);

    // Enable the line numbers
    editor.setShowLineNumbers(true);
    
    editor.reportProgress(0, textDocument.lineCount, "File loaded");
    // TODO: There seems to be some race condition between handle scroll and the editor not being initialized yet (?)
    // We add this call to handleScroll that hopefully fires in a properly instantiated editor
    editor.handleScroll(window.innerHeight);

    // Add confirm leave notification
    window.addEventListener("beforeunload", (event) => {
        event.preventDefault();
    });


    let timeoutHandle: number | undefined;
	editorElem.addEventListener("scroll", (_event) => {
		if (timeoutHandle === undefined) {
			timeoutHandle = window.setTimeout(() => {
				editor.handleScroll(window.innerHeight);
				timeoutHandle = undefined;
			}, 100);
		}
	});

    window.addEventListener("keydown", (event) => {
        const {key, ctrlKey, metaKey, altKey} = event;
        const ctrlOrMeta = ctrlKey || metaKey;

        if (ctrlOrMeta) {
            if (key === 's') {
                event.preventDefault();
                const content = editor.serializeDocument();
                if (content) {
                    const blob = new Blob([content], { type: "text/markdown" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = "Waterproof_playground_document.mv";
                    a.click();
                    URL.revokeObjectURL(url);
                }
            } else if (key === 'o') {
                event.preventDefault();
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".mv,.md,.txt";
                input.onchange = (e: Event) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = async (e) => {
                            const content = e.target?.result as string;
                            if (content) {
                                await main(content);
                            }
                        };
                        reader.readAsText(file);
                    }
                };
                input.click();
            } else if (altKey && key === 't') {
                event.preventDefault();
                // toggle teacher mode variable
                teacherMode = !teacherMode;
                editor.updateLockingState(teacherMode);
                if (teacherMode) {
                    document.getElementById("title")!.innerText = "Goals - Teacher Mode Enabled";
                } else {
                    document.getElementById("title")!.innerText = "Goals";
                }
            }
        }

    });

    function executeHelp(): void {
        executeCommandFullOutput(lspClient, textDocument, "Help.",currentPos!).then((output) => {
            const msgs  = output.feedback.filter(([level, _]) => level === 4).map(([_, msg]) => msg);
            goalsPanel.renderHelpMessages(msgs);
        }).catch((error) => {
            console.error("Error executing Help command:", error);
        });
    }

    // Logic to handle downloading and loading other documents using the dropdown
    const dropdown = document.getElementById("exercise-dropdown") as HTMLSelectElement;
    if (dropdown) {
        dropdown.addEventListener("change", async (event) => {
            const fileUrl = (event.target as HTMLSelectElement).value;
            if (fileUrl) {
                try {
                    const response = await fetch(fileUrl);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch ${fileUrl}`);
                    }
                    const content = await response.text();
                    main(content);
                } catch (error) {
                    console.error("Error fetching exercise sheet:", error);
                    alert(`Failed to load exercise sheet.`);
                }
            }
        });
    }

    function handleViewportHint(start: number, end: number): void {
        sendViewportHint(lspClient, textDocument, start, end).then(range => {
            viewPortRange = range;
        }).catch((error) => {
            console.error("Error sending viewport hint:", error);
        });
    }

    lspClient.onNotification("$/logTrace", handleLogTrace());
    lspClient.onNotification("textDocument/publishDiagnostics", handleDiagnostics(editor, textDocument));
    lspClient.onNotification("$/coq/fileProgress", handleFileProgress(editor, textDocument));
    lspClient.onNotification("$/coq/serverStatus", async params => {
        // On Idle, we recompute input area statuses
        const {status} = params;
        if (status === "Idle") {
            await computeInputAreaStatus(lspClient, textDocument, editor);
        }

        if (status === "Busy") {
            editor.startSpinner();
        } else {
            editor.stopSpinner();
        }
    });

    // Handle window/logMessage notifications
    lspClient.onNotification("window/logMessage", (params) => {
        console.log("LSP Log:", params.message);
    });

    // Handle performance data notifications
    lspClient.onNotification("$/coq/filePerfData", (params: any) => {
        console.log("Performance data:", params);
    });
}

let computeInputAreaStatusTimer: number;

async function computeInputAreaStatus(client: LspClient, document: TextDocument, editor: WaterproofEditor) {
    if (computeInputAreaStatusTimer) {
        clearTimeout(computeInputAreaStatusTimer);
    }

    // Computing where all the input areas are requires a fair bit of work,
    // so we add a debounce delay to this function to avoid recomputing on every keystroke.
    computeInputAreaStatusTimer = setTimeout(async () => {
        // console.log("[computeInputAreaStatus] Computing input area statuses...");
        // get input areas based on tags
        const inputAreas = getInputAreas(document);
        if (!inputAreas) {
            throw new Error("Cannot check proof status; illegal input areas.");
        }

        // for each input area, check the proof status
        try {
            const statuses = await Promise.all(inputAreas.map(a => {
                    if (!continuousChecking && viewPortRange && a.intersection(viewPortRange) === undefined) {
                        // This input area is outside of the range that has been checked and thus we can't determine its status
                        return Promise.resolve(InputAreaStatus.OutOfView);
                    } else {
                        return determineProofStatus(client, document, a);
                    }
                }));
            editor.setInputAreaStatus(statuses);
        } catch (reason) {
            if (wasCanceledByServer(reason)) return;  // we've likely already sent new requests
        }
    }, 250);
}


function wasCanceledByServer(reason: unknown): boolean {
    return !!reason
        && typeof reason === "object"
        && "message" in reason
        && reason.message === "Request got old in server";  // or: code == -32802
}

async function sendViewportHint(client: LspClient, textDocument: TextDocument, start: number, end: number): Promise<Range> {
    const startPos = textDocument.positionAt(start);
    let endPos = textDocument.positionAt(end);
    // Compute end of document position, use that if we're close
    const endOfDocument = textDocument.positionAt(textDocument.getText().length);
    if (endOfDocument.line - endPos.line < 20) {
        endPos = endOfDocument;
    }

    const requestBody = {
        textDocument: textDocument.versionedIdentifier,
        range: {
            start: {
                line: startPos.line,
                character: startPos.character
            },
            end: {
                line: endPos.line,
                character: endPos.character
            }
        } 
    };
    
    // Save the range for which the document has been checked
    await client.sendNotification("coq/viewRange", requestBody);
    return Promise.resolve(new Range(startPos, endPos));
}