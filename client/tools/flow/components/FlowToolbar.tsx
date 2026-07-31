export interface FlowToolbarProps {
  canAddAction?: boolean;
  canAddState?: boolean;
  canDelete?: boolean;
  canRedo?: boolean;
  canRevert?: boolean;
  canSave?: boolean;
  canUndo?: boolean;
  flowNodeDepth?: string;
  saving?: boolean;
  onAddAction?: () => void;
  onAddState?: () => void;
  onDeleteSelection?: () => void;
  onRedo?: () => void;
  onRevert?: () => void;
  onSave?: () => void;
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
  saving = false,
  onAddAction,
  onAddState,
  onDeleteSelection,
  onRedo,
  onRevert,
  onSave,
  onUndo
}: FlowToolbarProps) {
  const atRoot = flowNodeDepth === "subroutines";
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
    >
      <button type="button" disabled={!canUndo} onClick={onUndo}>Undo</button>
      <button type="button" disabled={!canRedo} onClick={onRedo}>Redo</button>
      <button type="button" disabled={!canSave || saving} onClick={onSave}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button type="button" disabled={!canAddState} onClick={onAddState}>
        {atRoot ? "Add Game State" : "Add Subroutine"}
      </button>
      <button type="button" disabled={!canAddAction} onClick={onAddAction}>Add Action</button>
      <button type="button" disabled={!canDelete} onClick={onDeleteSelection}>Delete</button>
      <button type="button" disabled={!canRevert} onClick={onRevert}>Revert</button>
      <span>{atRoot ? "Game States" : "Subroutine"}</span>
    </div>
  );
}
