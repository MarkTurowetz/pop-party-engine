import type { ArtAssetsController } from "./artAssetsController";
import { useArtAssets } from "./useArtAssets";

export interface ArtAssetManagerProps {
  controller: ArtAssetsController;
}

function readFileAsDataUrl(file: File): Promise<{ fileName: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      resolve({ fileName: file.name, mimeType: file.type, dataUrl: String(reader.result || "") })
    );
    reader.addEventListener("error", () => reject(reader.error || new Error("Failed to read file")));
    reader.readAsDataURL(file);
  });
}

/**
 * Art asset manager (slice 1): lists replaceable art assets with a preview, lets
 * you stage a new image per asset (file -> data URL) and save all staged
 * replacements through the typed controller. Compositions + organization are
 * separate slices in the same Art tool.
 */
export function ArtAssetManager({ controller }: ArtAssetManagerProps) {
  const { assets, pending, dirty, saving, error } = useArtAssets(controller);

  const onPickFile = async (assetId: string, file: File | undefined) => {
    if (!file) return;
    const replacement = await readFileAsDataUrl(file);
    controller.stageReplacement(assetId, replacement);
  };

  return (
    <section className="flow-react-panel" data-art-react-component="asset-manager" data-art-assets-dirty={dirty ? "true" : "false"}>
      <header className="flow-editor-controls">
        <h3>Art Assets</h3>
        <button type="button" disabled={!dirty || saving} onClick={() => void controller.save()}>
          {saving ? "Saving…" : "Save Replacements"}
        </button>
        <span data-art-assets-status>{dirty ? `${pending.size} staged` : "Saved"}</span>
        {error ? <span data-art-assets-error>{error}</span> : null}
      </header>
      <ol className="flow-react-list" data-art-assets>
        {assets.map((asset) => {
          const staged = pending.get(asset.id);
          const previewUrl = staged?.dataUrl || asset.currentUrl;
          return (
            <li className="flow-react-asset" data-art-asset-id={asset.id} key={asset.id}>
              <img className="art-asset-preview" src={previewUrl} alt={asset.name} data-art-asset-preview width={64} height={64} />
              <div>
                <strong>{asset.name}</strong>
                <small data-art-asset-category>{asset.category || "Uncategorized"}</small>
                <small data-art-asset-state>
                  {staged ? `Staged: ${staged.fileName}` : asset.hasCustom ? "Custom" : "Default"}
                </small>
              </div>
              <label className="flow-react-field" data-art-asset-field="replace">
                <span>Replace</span>
                <input
                  type="file"
                  accept="image/*"
                  data-art-asset-file={asset.id}
                  onChange={(event) => void onPickFile(asset.id, event.target.files?.[0])}
                />
              </label>
              {staged ? (
                <button type="button" data-art-asset-clear={asset.id} onClick={() => controller.clearReplacement(asset.id)}>
                  Cancel
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
