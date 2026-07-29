type Dict = Record<string, unknown>;

export interface StageManagedTextSource {
  target: string;
  value: unknown;
}

interface ReconcileOptions {
  force?: boolean;
}

function momentIdentity(lobby: Dict = {}): string {
  const gameSessionId = Number(lobby.gameSessionId || 0);
  const flowStateId = String(lobby.flowStateId || lobby.phase || "lobby");
  const momentVisitId = Number(lobby.momentVisitId || 0);
  return `${gameSessionId}:${flowStateId}:${momentVisitId}`;
}

export class StageManagedTextSources {
  private currentMomentIdentity = "";
  private readonly sourceValues = new Map<string, string>();

  reset(): void {
    this.currentMomentIdentity = "";
    this.sourceValues.clear();
  }

  reconcile(
    lobby: Dict,
    sources: StageManagedTextSource[],
    options: ReconcileOptions = {}
  ): StageManagedTextSource[] {
    const nextMomentIdentity = momentIdentity(lobby);
    if (this.currentMomentIdentity !== nextMomentIdentity) {
      this.currentMomentIdentity = nextMomentIdentity;
      this.sourceValues.clear();
    }

    const updates: StageManagedTextSource[] = [];
    for (const source of sources) {
      const target = String(source.target || "");
      if (!target) continue;
      const value = String(source.value ?? "");
      if (options.force !== true && this.sourceValues.get(target) === value) continue;
      this.sourceValues.set(target, value);
      updates.push({ target, value });
    }
    return updates;
  }
}
