export interface FlowToolbarProps {
  canAddAction?: boolean;
  canAddState?: boolean;
  canDelete?: boolean;
  canRevert?: boolean;
  flowNodeDepth?: string;
  flowViewMode?: string;
  onAddAction?: () => void;
  onAddState?: () => void;
  onDeleteSelection?: () => void;
  onRevert?: () => void;
  onSetViewMode?: (mode: "list" | "node") => void;
}

export function FlowToolbar({
  canAddAction = false,
  canAddState = true,
  canDelete = false,
  canRevert = false,
  flowNodeDepth = "actions",
  flowViewMode = "list",
  onAddAction,
  onAddState,
  onDeleteSelection,
  onRevert,
  onSetViewMode
}: FlowToolbarProps) {
  return (
    <div
      className="flow-react-toolbar"
      data-can-add-action={canAddAction ? "true" : "false"}
      data-can-add-state={canAddState ? "true" : "false"}
      data-can-delete={canDelete ? "true" : "false"}
      data-can-revert={canRevert ? "true" : "false"}
      data-flow-node-depth={flowNodeDepth}
      data-flow-react-component="toolbar"
      data-flow-view-mode={flowViewMode}
    >
      <button type="button" disabled={!canAddState} onClick={onAddState}>Add State</button>
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
