type SubmissionDictionary = Record<string, unknown>;
export interface ControllerSubmissionConfirmation { actionId: string; kind: "choice" | "writing"; message: string; }
export function resolveControllerSubmissionConfirmation(lobby: SubmissionDictionary, player: SubmissionDictionary): ControllerSubmissionConfirmation | null;
