export interface ToolSaveErrorProps {
  error: string | null | undefined;
  source: string;
}

export function ToolSaveError({ error, source }: ToolSaveErrorProps) {
  if (!error) return null;

  return (
    <p
      className="tool-save-error"
      data-tool-save-error={source}
      role="alert"
      aria-live="assertive"
    >
      {error}
    </p>
  );
}
