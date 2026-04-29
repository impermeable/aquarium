import { LspClient } from "../lsp";
import { Position } from "../positionsRanges";
import { TextDocument } from "../TextDocument";

/**
 * Base function for executing tactics/commands in a client.
 */
async function executeCommandBase(client: LspClient, textDocument: TextDocument, command: string, pos: Position) {
    

    const params = {
        // Make sure that the position is **before** the dot, otherwise there is no node at the position.
        position: pos,
        uri: textDocument.uri
    }

    try {
        const stateRes = await client.sendRequest("petanque/get_state_at_pos", params);
        // Create the RunParams object, st is the state to execute in, tac the command
        // to execute.
        const runParams = { st: stateRes.st, tac: command };
        const runRes = await client.sendRequest("petanque/run", runParams);
        // The state on which to query the goals is the state *after* the command has been run.
        const goalParams = { st: runRes.st };
        const goalsRes = await client.sendRequest("petanque/goals", goalParams);

        return {
            goalsRes, runRes, document: textDocument
        };
    } catch (error) {
        throw new Error(`Error when trying to execute command '${command}': ${error}`);
    }
}

/**
 * Execute `command` using client `client` and return the full output, that is, the goal after executing the command (`GoalConfig`, contains only goals information) and the result of 
 * running the command (`RunResult`, this includes messages and whether the proof was finished running `command`)
 * @param client The client to use when executing the command.
 * @param command The command/tactic to execute. It is allowed to execute multiple tactics/commands by seperating them using `.`'s.
 * @returns The full output of running `command` using `client`.
 */
export async function executeCommandFullOutput(client: LspClient, textDocument: TextDocument, command: string, pos: Position): Promise<any> {
    try {
        const { goalsRes, runRes } = await executeCommandBase(client, textDocument, command, pos);
        return { ...goalsRes, ...runRes };
    } catch (error) {
        throw new Error(`Error when trying to execute command '${command}': ${error}`);
    }
}
