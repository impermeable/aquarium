/**
 * Runtime diagnostics for investigating the "app slows down after ~15 min" report.
 *
 * Everything funnels through the exported `diag` singleton. It prints a compact
 * snapshot line every `SNAPSHOT_INTERVAL_MS` to the console, tagged `[diag ...]`,
 * so a student can just leave the console open, use the app for 15+ minutes, and
 * send back the log. Each field maps to one hypothesis (see README block below).
 *
 * To disable entirely (ship without instrumentation): set DIAGNOSTICS_ENABLED = false.
 *
 * ---------------------------------------------------------------------------
 * Hypotheses this instruments (confirm/debunk by watching the snapshot deltas):
 *
 *  H1  WASM/Coq state-cache growth in the worker.
 *      -> Watch `uaMem` (whole-context incl. worker) climb monotonically while
 *         `latAvg/p95` also climb, even when `main()`/`workers` stay at 1.
 *
 *  H2  Worker + listener leak on every main() re-entry (dropdown / Ctrl+O / URL).
 *      -> `workers` and `main` climb above 1. Old workers are never terminated,
 *         so `uaMem` jumps by a full Coq instance on each switch.
 *
 *  H3  Unbounded, uncancelled request backlog (cursorChange + idle recompute).
 *      -> `inFlight`/`peakInFlight` grow over time; `reqΔ` outpaces completions;
 *         `latAvg` rises as the single worker thread falls behind.
 *
 *  H4  O(n) TextDocument scans / document growth.
 *      -> `docLen` grows; correlate with rising latency of position conversions.
 *
 *  H6  Console/notification log flood (debug:true + per-notification logging).
 *      -> `notifsΔ` shows how many notifications/logs are produced per interval.
 * ---------------------------------------------------------------------------
 */

export const DIAGNOSTICS_ENABLED = true;

const SNAPSHOT_INTERVAL_MS = 30_000;

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
}

class Diagnostics {
    private startTime = performance.now();
    private started = false;

    // H2: lifecycle leak
    private mainCalls = 0;
    private workersCreated = 0;

    // H3 / H1: request pressure and latency
    private inFlight = 0;
    private peakInFlight = 0;
    private totalRequests = 0;
    private requestsSinceSnapshot = 0;
    private latenciesSinceSnapshot: number[] = [];

    // H4: document growth / edit rate
    private didChangesSinceSnapshot = 0;
    private lastDocLength = 0;

    // H6: notification / log volume
    private notifsSinceSnapshot: Record<string, number> = {};

    /** Call once per initApp() invocation (should stay at 1). Also (idempotently) starts the snapshot timer. */
    recordMainCall(): void {
        if (!DIAGNOSTICS_ENABLED) return;
        this.mainCalls++;
        this.start();
        if (this.mainCalls > 1) {
            console.warn(
                `[diag] initApp() called ${this.mainCalls} times — it should only ever run once (H2). ` +
                `A second run leaks the previous worker/editor/listeners.`
            );
        }
    }

    /** Call in the LspClient constructor, right after `new Worker(...)`. */
    recordWorkerCreated(): void {
        if (!DIAGNOSTICS_ENABLED) return;
        this.workersCreated++;
    }

    /** Call from documentChange with the new full document length. */
    recordDidChange(docLength: number): void {
        if (!DIAGNOSTICS_ENABLED) return;
        this.didChangesSinceSnapshot++;
        this.lastDocLength = docLength;
    }

    /** Call from every onNotification handler with the LSP method name. */
    recordNotification(method: string): void {
        if (!DIAGNOSTICS_ENABLED) return;
        this.notifsSinceSnapshot[method] = (this.notifsSinceSnapshot[method] ?? 0) + 1;
    }

    /** Wrap any request-returning promise to time it and track in-flight depth. */
    trackRequest<T>(_label: string, p: Promise<T>): Promise<T> {
        if (!DIAGNOSTICS_ENABLED) return p;
        const t0 = performance.now();
        this.inFlight++;
        this.totalRequests++;
        this.requestsSinceSnapshot++;
        if (this.inFlight > this.peakInFlight) this.peakInFlight = this.inFlight;
        const done = () => {
            this.inFlight--;
            this.latenciesSinceSnapshot.push(performance.now() - t0);
        };
        p.then(done, done);
        return p;
    }

    private start(): void {
        if (this.started || !DIAGNOSTICS_ENABLED) return;
        this.started = true;
        console.log(
            `[diag] instrumentation active. Snapshot every ${SNAPSHOT_INTERVAL_MS / 1000}s. ` +
            `Leave the console open and use the app for 15+ minutes.`
        );
        setInterval(() => { void this.snapshot(); }, SNAPSHOT_INTERVAL_MS);
    }

    private async snapshot(): Promise<void> {
        const elapsedMin = ((performance.now() - this.startTime) / 60_000).toFixed(1);

        const lat = [...this.latenciesSinceSnapshot].sort((a, b) => a - b);
        const avg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
        const p50 = percentile(lat, 50);
        const p95 = percentile(lat, 95);
        const max = lat.length ? lat[lat.length - 1] : 0;

        // Main-thread JS heap (Chromium-only, no special flags needed).
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        const heapMB = mem ? (mem.usedJSHeapSize / 1_048_576).toFixed(1) : "n/a";

        // Whole-context memory including the worker (needs cross-origin isolation,
        // which the wacoq worker already requires for SharedArrayBuffer). This is
        // the key number for H1/H2 because the Coq heap lives in the worker.
        let uaMemMB = "n/a";
        const measure = (performance as unknown as {
            measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
        }).measureUserAgentSpecificMemory;
        if (measure) {
            try {
                const r = await measure.call(performance);
                uaMemMB = (r.bytes / 1_048_576).toFixed(1);
            } catch { /* not available in this context */ }
        }

        console.log(
            `[diag t=${elapsedMin}m] ` +
            `heapJS=${heapMB}MB uaMem=${uaMemMB}MB | ` +
            `main=${this.mainCalls} workers=${this.workersCreated} | ` +
            `reqTotal=${this.totalRequests} reqΔ=${this.requestsSinceSnapshot} ` +
            `inFlight=${this.inFlight} peakInFlight=${this.peakInFlight} | ` +
            `latAvg=${avg.toFixed(0)} p50=${p50.toFixed(0)} p95=${p95.toFixed(0)} max=${max.toFixed(0)}ms | ` +
            `didChangeΔ=${this.didChangesSinceSnapshot} docLen=${this.lastDocLength} | ` +
            `notifsΔ=${JSON.stringify(this.notifsSinceSnapshot)}`
        );

        // Reset per-interval counters (peakInFlight is intentionally NOT reset so it
        // reflects the worst backlog seen across the whole session).
        this.requestsSinceSnapshot = 0;
        this.latenciesSinceSnapshot = [];
        this.didChangesSinceSnapshot = 0;
        this.notifsSinceSnapshot = {};
    }
}

export const diag = new Diagnostics();
