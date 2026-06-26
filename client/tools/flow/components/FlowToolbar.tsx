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
      data-can-add-action={canAddAction ? "true" : "false"}
      data-can-delete={canDelete ? "true" : "false"}
      data-can-revert={canRevert ? "true" : "false"}
      data-flow-node-depth={flowNodeDepth}
      data-flow-react-component="toolbar"
      data-flow-view-mode={flowViewMode}
    />
  );
}
