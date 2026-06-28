import type { GameConstants } from "../../types/game-data";

export interface ConstantsToolAppProps {
  constants?: GameConstants | null;
  selectedConstantId?: string;
  surface?: string;
  visible?: boolean;
}

export function ConstantsToolApp({
  constants = null,
  selectedConstantId = "gameTitle",
  surface = "constants",
  visible = false
}: ConstantsToolAppProps) {
  const customConstants = Array.isArray(constants?.customConstants) ? constants.customConstants : [];
  const playerColors = Array.isArray(constants?.playerColors) ? constants.playerColors : [];

  return (
    <section
      aria-hidden={visible ? "false" : "true"}
      className="layout-react-shell"
      data-constants-react-shell="legacy-bridge"
      data-custom-constant-count={customConstants.length}
      data-player-color-count={playerColors.length}
      data-selected-constant-id={selectedConstantId}
      data-surface={surface}
      hidden={!visible}
    >
      <header className="flow-react-header">
        <div>
          <p>React Preview</p>
          <h2>{String(constants?.gameTitle || "Constants")}</h2>
        </div>
        <dl>
          <div>
            <dt>Colors</dt>
            <dd>{playerColors.length}</dd>
          </div>
          <div>
            <dt>Custom</dt>
            <dd>{customConstants.length}</dd>
          </div>
        </dl>
      </header>
      <section className="flow-react-panel">
        <h3>Custom Constants</h3>
        <ol className="flow-react-list" data-constants-react-component="custom-list">
          {customConstants.map((constant) => (
            <li aria-current={`constant:${constant.id}` === selectedConstantId ? "true" : undefined} data-constant-id={constant.id} key={String(constant.id)}>
              <button type="button">
                <span>
                  <strong>{String(constant.name || constant.id)}</strong>
                  <small>{String(constant.type || "value")}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section className="flow-react-panel flow-react-inspector" data-constants-react-component="summary">
        <h3>Summary</h3>
        <h2>{selectedConstantId}</h2>
        <dl>
          <dt>Rounds</dt>
          <dd>{String(constants?.numberOfRounds || "")}</dd>
          <dt>Craft Timer</dt>
          <dd>{String(constants?.craftingTimerDuration || "")}</dd>
          <dt>Points</dt>
          <dd>{String(constants?.pointsForCorrectAnswer || "")}</dd>
        </dl>
      </section>
    </section>
  );
}
