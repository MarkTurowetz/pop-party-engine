import type { ArtAsset, ArtComposition } from "../../types/game-data";

export interface ArtToolAppProps {
  assets?: ArtAsset[];
  compositions?: ArtComposition[];
  selectedAssetId?: string;
  selectedComponentIds?: string[];
  selectedCompositionId?: string;
  selectedSurface?: string;
  surface?: string;
  visible?: boolean;
}

function flattenComponentCount(composition: ArtComposition | null): number {
  function count(items: NonNullable<ArtComposition["components"]>): number {
    return items.reduce((total, item) => total + 1 + count(item.children || []), 0);
  }
  return composition ? count(composition.components || []) : 0;
}

export function ArtToolApp({
  assets = [],
  compositions = [],
  selectedAssetId = "",
  selectedComponentIds = [],
  selectedCompositionId = "",
  selectedSurface = "stage",
  surface = "art",
  visible = false
}: ArtToolAppProps) {
  const selectedComposition = compositions.find((item) => item.id === selectedCompositionId) || null;
  const selectedAsset = assets.find((item) => item.id === selectedAssetId) || null;

  return (
    <section
      aria-hidden={visible ? "false" : "true"}
      className="layout-react-shell"
      data-art-react-shell="legacy-bridge"
      data-art-asset-count={assets.length}
      data-art-composition-count={compositions.length}
      data-art-selected-component-count={selectedComponentIds.length}
      data-surface={surface}
      hidden={!visible}
    >
      <header className="flow-react-header">
        <div>
          <p>React Preview</p>
          <h2>{selectedComposition?.name || selectedAsset?.name || "Art"}</h2>
        </div>
        <dl>
          <div>
            <dt>Assets</dt>
            <dd>{assets.length}</dd>
          </div>
          <div>
            <dt>Comps</dt>
            <dd>{compositions.length}</dd>
          </div>
        </dl>
      </header>
      <section className="flow-react-panel">
        <h3>Compositions</h3>
        <ol className="flow-react-list" data-art-react-component="composition-list">
          {compositions.map((composition) => (
            <li aria-current={composition.id === selectedCompositionId ? "true" : undefined} data-art-composition-id={composition.id} key={composition.id}>
              <button type="button">
                <span>
                  <strong>{composition.name}</strong>
                  <small>{composition.surface}</small>
                </span>
                <span data-action-count>{flattenComponentCount(composition)}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section className="flow-react-panel flow-react-inspector" data-art-react-component="summary">
        <h3>Summary</h3>
        <h2>{selectedSurface}</h2>
        <dl>
          <dt>Selected Asset</dt>
          <dd>{selectedAsset?.id || "None"}</dd>
          <dt>Composition</dt>
          <dd>{selectedComposition?.id || "None"}</dd>
          <dt>Components</dt>
          <dd>{flattenComponentCount(selectedComposition)}</dd>
          <dt>Selected</dt>
          <dd>{selectedComponentIds.length}</dd>
        </dl>
      </section>
    </section>
  );
}
