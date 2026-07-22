import * as rpc from 'vscode-jsonrpc/browser';
import { Position } from './positionsRanges';
import { TextDocument } from './TextDocument';
import { diag } from './diagnostics';

// Server configuration object
// See https://github.com/ejgallego/rocq-lsp/blob/main/etc/doc/PROTOCOL.md#did-change-configuration-and-server-configuration-parameters
// and https://github.com/ejgallego/rocq-lsp/blob/bd6fb39fc0ac51330c3543ef727d7fa3c81d7b96/editor/code/package.json#L202-L437
export type RocqLspServerConfig = {
    client_version: string;
    eager_diagnostics: boolean;
    goal_after_tactic: boolean;
    show_coq_info_messages: boolean;
    show_notices_as_diagnostics: boolean;
    admit_on_bad_qed: boolean;
    debug: boolean;
    unicode_completion: "off" | "normal" | "extended";
    max_errors: number;
    pp_type: 0 | 1 | 2;
    send_diags_extra_data: boolean;
    check_only_on_request: boolean;
    "trace.server"?: "off" | "messages" | "verbose";
    send_perf_data: boolean;
};

// Enable or disable continuous checking.
// Disabling yields better responsiveness.
export const continuousChecking = false;

// Server configuration object
export const serverConfig: RocqLspServerConfig = {
    client_version: "0.2.5-dev",
    eager_diagnostics: true,
    goal_after_tactic: false,
    show_coq_info_messages: false,
    show_notices_as_diagnostics: true,
    admit_on_bad_qed: true,
    debug: true,
    unicode_completion: "off",
    max_errors: 150,
    pp_type: 0, // 0 = print to string, 1 = print to pp object
    // "trace.server": "verbose",
    send_diags_extra_data: true,
    check_only_on_request: !continuousChecking,
    // H7 instrumentation: per-sentence timings via $/coq/filePerfData,
    // rendered by handlePerfData as "[diag perf]" console lines.
    send_perf_data: true,
};

/**
 * Implements a minimal LspClient that interfaces with the language server running as a WebWorker instance.
 */
export class LspClient {
    
    public connection: rpc.MessageConnection;

    constructor(private readonly initializationOptions?: RocqLspServerConfig) {
        this.initializationOptions = initializationOptions;

        // Create the web worker (path is relative to the compiled file)
        const worker = new Worker('wacoq_worker.js');  // "wacoq_worker.js" -- for deployment
        // const worker = new Worker('/wacoq_worker.js'); // "/wacoq_worker.js" -- local
        diag.recordWorkerCreated(); // H2: track worker creation (never terminated anywhere)

        // H7: surface uncaught worker errors (e.g. WASM "index out of bounds"
        // traps in zarith/GMP). After such a trap the checking fiber dies but
        // the server keeps reporting Busy, so without this the app just hangs.
        worker.onerror = (event) => {
            diag.recordWorkerError(event.message ?? String(event));
        };
        worker.onmessageerror = () => {
            diag.recordWorkerError("messageerror: worker message could not be deserialized");
        };

        // The worker expects the first message to be a base path string
        // Send that before any JSON-RPC messages so the worker can initialize correctly.
        worker.postMessage('/aquarium'); // "/aquarium" -- for deployment
        // worker.postMessage('');                    // "" -- local

        // Create message reader and writer for the worker
        const reader = new rpc.BrowserMessageReader(worker);
        const writer = new rpc.BrowserMessageWriter(worker);

        // Create the JSON-RPC connection
        this.connection = rpc.createMessageConnection(reader, writer);

        // Listen for incoming messages
        this.connection.listen();

    }

    /**
     * Wrapper around the connection `onNotification` handler.
     * @param method The method name of the notification.
     * @param handler The callback to execute when this notification is received from the server.
     */
    public onNotification(method: string, handler: (params: any) => void): void {
        this.connection.onNotification(method, (params) => {
            handler(params);
        });
    }

    /**
     * Initializes the server by sending the `initialize` lsp request.
     * @returns 
     */
    public async initializeServer(): Promise<void> {
        // Send initialize request to the language server
        const initializeParams = {
            processId: null,
            capabilities: {},
            initializationOptions: this.initializationOptions,
            workspaceFolders: [
                {
                    uri: 'file:///',
                    name: 'workspace'
                }
            ]
        };

        try {
            const result = await this.connection.sendRequest('initialize', initializeParams);
            console.log('Language server initialized:', result);

            // Set trace level to verbose
            // await this.connection.sendNotification('$/setTrace', { value: 'verbose' });
            return;
        } catch (error) {
            console.error('Failed to initialize language server:', error);
            return;
        }
    }

    /**
     * Open a document on the server via `textDocument/didOpen`.
     * The server keeps running; documents can be opened and closed freely.
     */
    async openDocument(document: TextDocument): Promise<void> {
        const didOpenParams = {
            textDocument: {
                uri: document.uri,
                languageId: 'markdown', // or 'coq' if applicable
                version: document.version,
                text: document.text
            }
        };
        await this.connection.sendNotification('textDocument/didOpen', didOpenParams);
    }

    /**
     * Close a document on the server via `textDocument/didClose`, releasing
     * the server-side state associated with it.
     */
    async closeDocument(uri: string): Promise<void> {
        await this.connection.sendNotification('textDocument/didClose', { textDocument: { uri } });
    }

    /**
     * Wrapper around the connection sendRequest function.
     * @param method The method name for the request
     * @param params The parameters for the request
     * @returns 
     */
    async sendRequest(method: string, params: any): Promise<any> {
        return diag.trackRequest(method, this.connection.sendRequest(method, params));
    }

    /**
     * Wrapper around the connection sendNotification function.
     * @param arg0 The method name for the notification
     * @param params The parameters for the notification
     */
    async sendNotification(arg0: string, params: any): Promise<void>{
        await this.connection.sendNotification(arg0, params);
    }

    /**
     * Request the goals at position `pos` in `document`
     */
    async requestGoals(pos: Position, document: TextDocument): Promise<any> {
    
        const textDocument = document.versionedIdentifier;
    
        const position = {
            line:      pos.line,
            character: pos.character
        };

        // The paramaters for the `proof/goals` request.
        // See https://github.com/ejgallego/rocq-lsp/blob/main/etc/doc/PROTOCOL.md#goal-display
        const params = {
            textDocument,
            position
        };

        // console.log('Requesting goals with params:', params);
        // Send the request to the language server
        return diag.trackRequest('proof/goals', this.connection.sendRequest('proof/goals', params));
    }
}