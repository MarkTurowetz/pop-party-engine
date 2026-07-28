type Dict = Record<string, unknown>;
type TimerId = ReturnType<typeof globalThis.setTimeout>;

interface StageSubActionSchedulerOptions {
  clearTimeout?: (timerId: TimerId) => void;
  currentGameSessionId: () => number;
  run: (action: Dict, actionKey: string) => void;
  setTimeout?: (callback: () => void, delayMs: number) => TimerId;
}

function normalizedSessionId(value: unknown): number {
  const sessionId = Number(value);
  return Number.isFinite(sessionId) ? sessionId : 0;
}

export class StageSubActionScheduler {
  private activeGameSessionId: number | null = null;
  private readonly clearTimeoutImpl: (timerId: TimerId) => void;
  private readonly currentGameSessionId: () => number;
  private readonly run: (action: Dict, actionKey: string) => void;
  private readonly setTimeoutImpl: (callback: () => void, delayMs: number) => TimerId;
  private readonly timers = new Set<TimerId>();

  constructor(options: StageSubActionSchedulerOptions) {
    this.clearTimeoutImpl = options.clearTimeout || ((timerId) => globalThis.clearTimeout(timerId));
    this.currentGameSessionId = options.currentGameSessionId;
    this.run = options.run;
    this.setTimeoutImpl = options.setTimeout || ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
  }

  enterGameSession(gameSessionId: unknown): void {
    const nextSessionId = normalizedSessionId(gameSessionId);
    if (this.activeGameSessionId !== null && this.activeGameSessionId !== nextSessionId) this.clear();
    this.activeGameSessionId = nextSessionId;
  }

  schedule(action: Dict, actionKey: string, gameSessionId: unknown): void {
    const scheduledSessionId = normalizedSessionId(gameSessionId);
    this.enterGameSession(scheduledSessionId);
    for (const subAction of (action?.subActions as Dict[]) || []) {
      const delayMs = Math.max(0, Number((subAction.timing as Dict)?.seconds || 0) * 1000);
      const runIfCurrentSession = () => {
        if (normalizedSessionId(this.currentGameSessionId()) !== scheduledSessionId) return;
        this.run(subAction, actionKey);
      };
      if (delayMs === 0) {
        runIfCurrentSession();
        continue;
      }
      const timerId = this.setTimeoutImpl(() => {
        this.timers.delete(timerId);
        runIfCurrentSession();
      }, delayMs);
      this.timers.add(timerId);
    }
  }

  clear(): void {
    for (const timerId of this.timers) this.clearTimeoutImpl(timerId);
    this.timers.clear();
  }

  pendingCount(): number {
    return this.timers.size;
  }
}
