import { useState, type DragEvent } from "react";
import type { ArtOrganizationController } from "./artOrganizationController";
import { folderIdFromKey, type OrgItem, type OrgSurface } from "./organizationModel";
import { useArtOrganization } from "./useArtOrganization";

export interface ArtOrganizationPanelProps {
  controller: ArtOrganizationController;
  surface: OrgSurface;
}

const DND_TYPE = "application/x-art-organizer-key";

/**
 * Drag-drop art organizer: per-surface folders + items. Drag items/folders to
 * reorder (drop on a sibling) or move into a folder (drop on its header) or back
 * to the root. Edits route through the typed controller; Save persists the cleaned
 * organization.
 */
export function ArtOrganizationPanel({ controller, surface }: ArtOrganizationPanelProps) {
  const { organization, surfaceItems, dirty, saving, canUndo } = useArtOrganization(controller);
  const [folderName, setFolderName] = useState("");
  const state = organization[surface];
  const items = surfaceItems[surface];
  const nameByKey = new Map(items.map((item: OrgItem) => [item.key, item.name]));
  const folderName_ = (id: string) => state.folders.find((folder) => folder.id === id)?.name || "Folder";

  const placed = new Set<string>(state.order);
  for (const folderId of Object.keys(state.folderItems)) for (const key of state.folderItems[folderId] || []) placed.add(key);
  const unplaced = items.filter((item) => !placed.has(item.key));

  const onDragStart = (event: DragEvent, key: string) => {
    event.stopPropagation();
    event.dataTransfer.setData(DND_TYPE, key);
  };
  const dragKey = (event: DragEvent) => event.dataTransfer.getData(DND_TYPE);
  const onDropBeside = (event: DragEvent, targetKey: string) => {
    event.preventDefault();
    event.stopPropagation();
    const dragged = dragKey(event);
    if (dragged) controller.moveBeside(surface, dragged, targetKey, false);
  };
  const onDropIntoFolder = (event: DragEvent, folderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const dragged = dragKey(event);
    if (dragged) controller.moveIntoFolder(surface, dragged, folderId);
  };
  const onDropRoot = (event: DragEvent) => {
    event.preventDefault();
    const dragged = dragKey(event);
    if (dragged) controller.moveIntoFolder(surface, dragged, "");
  };

  const renderItem = (key: string) => (
    <li
      className="flow-react-org-item"
      data-art-org-item={key}
      key={key}
      draggable
      onDragStart={(event) => onDragStart(event, key)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDropBeside(event, key)}
    >
      {nameByKey.get(key) || key}
    </li>
  );

  const renderFolder = (folderId: string) => (
    <li className="flow-react-org-folder" data-art-org-folder={folderId} key={`folder:${folderId}`}>
      <header
        draggable
        onDragStart={(event) => onDragStart(event, `folder:${folderId}`)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => onDropIntoFolder(event, folderId)}
      >
        <input
          type="text"
          key={`${folderId}-name`}
          defaultValue={folderName_(folderId)}
          data-art-org-folder-name={folderId}
          onBlur={(event) => controller.renameFolder(surface, folderId, event.target.value)}
        />
        <button type="button" data-art-org-folder-delete={folderId} onClick={() => controller.deleteFolder(surface, folderId)}>
          Delete
        </button>
      </header>
      <ol className="flow-react-list">
        {(state.folderItems[folderId] || []).map((key) =>
          key.startsWith("folder:") ? renderFolder(folderIdFromKey(key)) : renderItem(key)
        )}
      </ol>
    </li>
  );

  return (
    <section className="flow-react-panel" data-art-react-component="organization" data-art-org-surface={surface}>
      <div className="flow-editor-controls">
        <h3>Organization — {surface}</h3>
        <input
          type="text"
          placeholder="Folder name"
          value={folderName}
          data-art-org-folder-input
          onChange={(event) => setFolderName(event.target.value)}
        />
        <button
          type="button"
          data-art-org-create-folder
          onClick={() => {
            controller.createFolder(surface, folderName || "New Folder");
            setFolderName("");
          }}
        >
          Add Folder
        </button>
        <button type="button" disabled={!canUndo} onClick={() => controller.undo()}>
          Undo
        </button>
        <button type="button" disabled={!dirty || saving} onClick={() => void controller.save()}>
          {saving ? "Saving…" : "Save Organization"}
        </button>
        <span data-art-org-status>{dirty ? "Unsaved changes" : "Saved"}</span>
      </div>
      <ol
        className="flow-react-list"
        data-art-org-root
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDropRoot}
      >
        {state.order.map((key) =>
          key.startsWith("folder:") ? renderFolder(folderIdFromKey(key)) : renderItem(key)
        )}
        {unplaced.length ? (
          <li className="flow-react-org-unplaced" data-art-org-unplaced>
            <small>Unfiled</small>
            <ol className="flow-react-list">{unplaced.map((item) => renderItem(item.key))}</ol>
          </li>
        ) : null}
      </ol>
    </section>
  );
}
