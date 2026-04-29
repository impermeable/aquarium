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

    constructor(private readonly el: HTMLElement, helpCallback: () => void) {
        this.goals = el.querySelector("#goals");
        this.messages = el.querySelector("#messages");
        this.helpButton = el.querySelector("#help-button");
        this.helpContainer = el.querySelector("#help-container");
        // Register the callback for the help button
        this.helpButton.addEventListener("click", helpCallback);
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