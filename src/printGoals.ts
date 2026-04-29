
/**
 * Translate a goalsResponse object into a string
 * @param goalsResponse 
 * @returns 
 */
export function goalsToString(goalsResponse: any): string {
    if (!goalsResponse.goals || goalsResponse.goals.goals.length === 0) {
        return "No goals at this point";
    }

    // For now, just return the first goal
    return goalsResponse.goals.goals[0].ty;
}

export function goalsToWaterproofString(goalsResponse: any): string {
    if (!goalsResponse.goals || goalsResponse.goals.goals.length === 0) {
        return "No goals.";
    }
    
    let result = "";

    goalsResponse.goals.goals.forEach((goal: any, index: number) => {
        result += `Goal ${index + 1}:\n`;
        goal.hyps.forEach((hyp: any) => {
            result += `  - ${hyp.names[0]}: ${hyp.ty}\n`;
        });
        result += `--------------------\n  ${goal.ty}\n\n`;
    });

    // Add messages
    if (goalsResponse.messages && goalsResponse.messages.length > 0) {
        result += "Messages:\n";
        goalsResponse.messages.forEach((msg: any) => {
            result += `  - [Level ${msg.level}] ${msg.text}\n`;
        });
    }

    return result;
}