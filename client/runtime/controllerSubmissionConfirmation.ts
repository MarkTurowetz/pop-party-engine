type Dict = Record<string, unknown>;

export interface ControllerSubmissionConfirmation {
  actionId: string;
  kind: "choice" | "writing";
  message: string;
}

function submittedText(me: Dict): string {
  const answer = me.answer as Dict | null | undefined;
  if (answer?.done !== true) return "";
  return String(answer.text || "").trim();
}

export function resolveControllerSubmissionConfirmation(
  lobby: Dict,
  me: Dict
): ControllerSubmissionConfirmation | null {
  const text = submittedText(me);
  if (!text) return null;

  const choiceInput = ((me.input || lobby.input) as Dict | null) || null;
  if (
    choiceInput?.actionId &&
    String(choiceInput.type || "").trim().toLowerCase() !== "vote" &&
    String(choiceInput.mode || "").trim().toLowerCase() === "submitonce"
  ) {
    return {
      actionId: String(choiceInput.actionId),
      kind: "choice",
      message: `You answered: ${text}`
    };
  }

  const textInput = (lobby.textInput as Dict | null) || null;
  const textInputType = String(textInput?.type || "").trim().toLowerCase();
  const textInputMode = String(textInput?.mode || "").trim().toLowerCase();
  if (
    textInput?.actionId &&
    textInputType !== "voice" &&
    textInputMode !== "voicevip"
  ) {
    return {
      actionId: String(textInput.actionId),
      kind: "writing",
      message: `You wrote: ${text}`
    };
  }

  return null;
}
