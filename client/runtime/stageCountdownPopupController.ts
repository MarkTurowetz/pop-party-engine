type Dict = Record<string, unknown>;

interface CountdownPopupEntity {
  playAnimation?: (animation: string, options?: Dict) => number;
  playVisibility?: (isShown: boolean, options?: Dict) => number;
}

interface CountdownPopupControllerOptions {
  resolveEntity?: () => CountdownPopupEntity | null;
}

function countdownDisplayValue(seconds: unknown): string {
  const remaining = Math.max(0, Math.ceil(Number(seconds) || 0));
  return remaining > 0 ? String(remaining) : "go";
}

function shouldPlayCountdownUpdate(previousValue: string, nextValue: string): boolean {
  return (
    (previousValue === "3" && nextValue === "2") ||
    (previousValue === "2" && nextValue === "1") ||
    (previousValue === "1" && nextValue === "go")
  );
}

class StageCountdownPopupController {
  options: CountdownPopupControllerOptions;
  phase = "";
  displayedValue = "";

  constructor(options: CountdownPopupControllerOptions = {}) {
    this.options = options;
  }

  entity(): CountdownPopupEntity | null {
    return this.options.resolveEntity?.() || null;
  }

  beforePhase(nextPhase: unknown): void {
    const cleanPhase = String(nextPhase || "lobby");
    if (this.phase !== "starting" || cleanPhase === "starting") return;
    this.entity()?.playVisibility?.(false, {});
    this.displayedValue = "";
  }

  afterPhase(nextPhase: unknown): void {
    const cleanPhase = String(nextPhase || "lobby");
    const isEnteringStarting = this.phase !== "starting" && cleanPhase === "starting";
    this.phase = cleanPhase;
    if (!isEnteringStarting) return;
    this.displayedValue = "";
    this.entity()?.playVisibility?.(true, {});
  }

  update(seconds: unknown): void {
    if (this.phase !== "starting") return;
    const nextValue = countdownDisplayValue(seconds);
    const previousValue = this.displayedValue;
    this.displayedValue = nextValue;
    if (!shouldPlayCountdownUpdate(previousValue, nextValue)) return;
    this.entity()?.playAnimation?.("Update", {});
  }
}

export {
  StageCountdownPopupController,
  countdownDisplayValue,
  shouldPlayCountdownUpdate
};

