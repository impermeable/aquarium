/**
 * Detects a crashed or wedged proof checker worker.
 *
 * Two signals feed into this:
 *  - hard: an uncaught error event on the worker (`onWorkerError`), and
 *  - soft: the server reports Busy while the checking frontier has not moved
 *    for `STUCK_THRESHOLD_MS` (e.g. a WASM trap in zarith/GMP that keeps
 *    re-faulting inside the worker, leaving the server Busy forever).
 *
 * The soft signal can also trigger on a legitimately slow proof, so consumers
 * should present it as a non-destructive offer to restart: `onRecovered` fires
 * as soon as checking progresses or finishes, and the offer should then be
 * retracted.
 */

/** How long the frontier may sit still (while Busy) before we suspect a wedge. */
const STUCK_THRESHOLD_MS = 30_000;

export class CrashDetector {
    private busy = false;
    private frontierLine: number | null = null;
    private stuckTimer: number | undefined;

    /**
     * @param onSuspectedCrash Called with a user-facing message when a crash or
     *                         wedge is suspected.
     * @param onRecovered Called whenever checking progresses or completes, so a
     *                    previously shown offer can be retracted.
     */
    constructor(
        private readonly onSuspectedCrash: (message: string) => void,
        private readonly onRecovered: () => void
    ) {}

    /** Feed `$/coq/serverStatus` notifications ("Busy" / "Idle"). */
    onServerStatus(status: string): void {
        const wasBusy = this.busy;
        this.busy = status === "Busy";
        if (this.busy && !wasBusy) {
            this.armStuckTimer();
        } else if (!this.busy) {
            // Check finished (or was interrupted) — nothing is wedged.
            this.disarmStuckTimer();
            this.frontierLine = null;
            this.onRecovered();
        }
    }

    /**
     * Feed `$/coq/fileProgress` notifications with the first line (0-based) of
     * the still-unprocessed region. A moving frontier means checking is alive.
     */
    onFileProgress(frontierLine: number | undefined): void {
        if (frontierLine === undefined || frontierLine === this.frontierLine) return;
        this.frontierLine = frontierLine;
        if (this.busy) {
            this.armStuckTimer();
            this.onRecovered();
        }
    }

    /** Feed uncaught worker error events (hard crash). */
    onWorkerError(message: string): void {
        this.disarmStuckTimer();
        this.onSuspectedCrash(`The proof checker crashed (${message}).`);
    }

    /** Clear all state, e.g. right before the worker is restarted. */
    reset(): void {
        this.busy = false;
        this.frontierLine = null;
        this.disarmStuckTimer();
    }

    private armStuckTimer(): void {
        this.disarmStuckTimer();
        this.stuckTimer = window.setTimeout(() => {
            const at = this.frontierLine !== null ? ` on line ${this.frontierLine + 1}` : "";
            this.onSuspectedCrash(`The proof checker appears to be stuck${at}.`);
        }, STUCK_THRESHOLD_MS);
    }

    private disarmStuckTimer(): void {
        if (this.stuckTimer !== undefined) {
            window.clearTimeout(this.stuckTimer);
            this.stuckTimer = undefined;
        }
    }
}
