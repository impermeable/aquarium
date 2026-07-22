import { goalsToString } from "./printGoals";

/**
 * Minimal class that implements a goals panel.
 * 
 * Creates DOM objects for displaying goals, messages and help button output.
 */
export class GoalsPanel {
    private goals: HTMLElement;
    private messages: HTMLElement;
    private helpButton: HTMLButtonElement;
    private helpContainer: HTMLElement;
    private crashNotice: HTMLElement;
    private crashMessage: HTMLElement;
    private crashButton: HTMLButtonElement;

    constructor(private readonly el: HTMLElement, helpCallback: () => void) {
        this.goals = el.querySelector("#goals");
        this.messages = el.querySelector("#messages");
        this.helpButton = el.querySelector("#help-button");
        this.helpContainer = el.querySelector("#help-container");
        // Register the callback for the help button
        this.helpButton.addEventListener("click", helpCallback);

        // Crash notice: hidden by default, shown when the proof checker
        // crashes or appears wedged, offering a restart.
        this.crashNotice = document.createElement("div");
        this.crashNotice.id = "crash-notice";
        this.crashNotice.style.cssText =
            "display: none; margin: 8px 0; padding: 8px 10px; " +
            "border: 1px solid #d9534f; border-radius: 4px; " +
            "background: #fdf2f2; color: #7a1f1f;";
        this.crashMessage = document.createElement("div");
        this.crashButton = document.createElement("button");
        this.crashButton.style.marginTop = "6px";
        this.crashNotice.append(this.crashMessage, this.crashButton);
        this.goals.before(this.crashNotice);
    }

    /**
     * Show a notice that the proof checker crashed or is stuck, with a button
     * to restart it. Calling this again just updates the message.
     * @param message User-facing description of what was detected.
     * @param onRestart Invoked when the user clicks the restart button.
     */
    showCrashNotice(message: string, onRestart: () => Promise<void> | void): void {
        this.crashMessage.textContent =
            `${message} You can restart it; the document and your edits are kept.`;
        this.crashButton.textContent = "Restart proof checker";
        this.crashButton.disabled = false;
        this.crashButton.onclick = async () => {
            this.crashButton.disabled = true;
            this.crashButton.textContent = "Restarting…";
            await onRestart();
        };
        this.crashNotice.style.display = "block";
    }

    /** Hide the crash notice (checker recovered or was restarted). */
    hideCrashNotice(): void {
        this.crashNotice.style.display = "none";
    }

    /**
     * Render the goals object to the panel.
     * @param goalsResponse The goals object to render.
     */
    render(goalsResponse: any): void {
        this.goals.innerHTML = "<h3>We need to show:</h3>\n" + goalsToString(goalsResponse).replaceAll("\n", "<br>");
        this.messages.innerHTML = goalsResponse.messages ? "<h3>Messages:</h3><ul>" + goalsResponse.messages.map((msg: any) => `<li>${msg.text}</li>`).join("") + "</ul>" : "";
    }

    /**
     * Render help messages to the panel.
     * @param msgs Array of string messages to render.
     */
    renderHelpMessages(msgs: string[]): void {
        this.helpContainer.innerHTML = `<ul>${msgs.map(v => `<li>${v}</li>`).join("\n")}</ul>`;
    }
}