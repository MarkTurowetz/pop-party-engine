export interface FlowToolbarProps {
  canAddAction?: boolean;
  canDelete?: boolean;
  canRevert?: boolean;
  flowNodeDepth?: string;
  flowViewMode?: string;
}

export function FlowToolbar({
  canAddAction = false,
  canDelete = false,
  canRevert = false,
  flowNodeDepth = "actions",
  flowViewMode = "list"
}: FlowToolbarProps) {
  return (
    <div
      className="flow-react-toolbar"
      data-can-add-action={canAddAction ? "true" : "false"}
      data-can-delete={canDelete ? "true" : "false"}
      data-can-revert={canRevert ? "true" : "false"}
      data-flow-node-depth={flowNodeDepth}
      data-flow-react-component="toolbar"
      data-flow-view-mode={flowViewMode}
    >
      <span data-enabled={canAddAction ? "true" : "false"}>Add</span>
      <span data-enabled={canDelete ? "true" : "false"}>Delete</span>
      <span data-enabled={canRevert ? "true" : "false"}>Revert</span>
      <span>{flowViewMode}</span>
      <span>{flowNodeDepth}</span>
    </div>
  );
}
