export interface FlowToolbarProps {
  canAddAction?: boolean;
  canAddState?: boolean;
  canDelete?: boolean;
  canRedo?: boolean;
  canRevert?: boolean;
  canSave?: boolean;
  canUndo?: boolean;
  flowNodeDepth?: string;
  flowViewMode?: string;
  saving?: boolean;
  onAddAction?: () => void;
  onAddState?: () => void;
  onDeleteSelection?: () => void;
  onRedo?: () => void;
  onRevert?: () => void;
  onSave?: () => void;
  onSetViewMode?: (mode: "list" | "node") => void;
  onUndo?: () => void;
}

export function FlowToolbar({
  canAddAction = false,
  canAddState = true,
  canDelete = false,
  canRedo = false,
  canRevert = false,
  canSave = false,
  canUndo = false,
  flowNodeDepth = "subroutine",
  flowViewMode = "list",
  saving = false,
  onAddAction,
  onAddState,
  onDeleteSelection,
  onRedo,
  onRevert,
  onSave,
  onSetViewMode,
  onUndo
}: FlowToolbarProps) {
  return (
    <div
      className="flow-react-toolbar"
      data-can-add-action={canAddAction ? "true" : "false"}
      data-can-add-state={canAddState ? "true" : "false"}
      data-can-delete={canDelete ? "true" : "false"}
      data-can-redo={canRedo ? "true" : "false"}
      data-can-revert={canRevert ? "true" : "false"}
      data-can-save={canSave ? "true" : "false"}
      data-can-undo={canUndo ? "true" : "false"}
      data-flow-node-depth={flowNodeDepth}
      data-flow-react-component="toolbar"
      data-flow-view-mode={flowViewMode}
    >
      <button type="button" disabled={!canUndo} onClick={onUndo}>Undo</button>
      <button type="button" disabled={!canRedo} onClick={onRedo}>Redo</button>
      <button type="button" disabled={!canSave || saving} onClick={onSave}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button type="button" disabled={!canAddState} onClick={onAddState}>Add Subroutine</button>
      <button type="button" disabled={!canAddAction} onClick={onAddAction}>Add Action</button>
      <button type="button" disabled={!canDelete} onClick={onDeleteSelection}>Delete</button>
      <button type="button" disabled={!canRevert} onClick={onRevert}>Revert</button>
      <button
        aria-pressed={flowViewMode !== "node"}
        type="button"
        onClick={() => onSetViewMode?.("list")}
      >
        List
      </button>
      <button
        aria-pressed={flowViewMode === "node"}
        type="button"
        onClick={() => onSetViewMode?.("node")}
      >
        Node
      </button>
      <span>{flowNodeDepth}</span>
    </div>
  );
}
