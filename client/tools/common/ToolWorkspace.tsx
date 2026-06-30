import { useMemo, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";

export interface ToolWorkspaceProps {
  children: ReactNode;
  className?: string;
  dataAttributes?: Record<string, string | number | boolean | undefined>;
  header?: ReactNode;
  hidden?: boolean;
  maxSidebarWidth?: number;
  minSidebarWidth?: number;
  sidebar: ReactNode;
  sidebarLabel: string;
  storageKey?: string;
  title: string;
  toolbar?: ReactNode;
  toolId: string;
}

const DEFAULT_SIDEBAR_WIDTH = 320;
const DEFAULT_MIN_WIDTH = 220;
const DEFAULT_MAX_WIDTH = 620;

function readStoredWidth(storageKey: string | undefined, min: number, max: number): number {
  if (!storageKey || typeof window === "undefined") return DEFAULT_SIDEBAR_WIDTH;
  const stored = window.localStorage.getItem(storageKey);
  if (stored === null || stored === "") return DEFAULT_SIDEBAR_WIDTH;
  const value = Number(stored);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : DEFAULT_SIDEBAR_WIDTH;
}

export function ToolWorkspace({
  children,
  className = "",
  dataAttributes = {},
  header,
  hidden = false,
  maxSidebarWidth = DEFAULT_MAX_WIDTH,
  minSidebarWidth = DEFAULT_MIN_WIDTH,
  sidebar,
  sidebarLabel,
  storageKey,
  title,
  toolbar,
  toolId
}: ToolWorkspaceProps) {
  const [sidebarWidth, setSidebarWidth] = useState(() => readStoredWidth(storageKey, minSidebarWidth, maxSidebarWidth));

  const attributes = useMemo(() => {
    const output: Record<string, string> = {};
    for (const [key, value] of Object.entries(dataAttributes)) {
      if (value === undefined) continue;
      output[`data-${key}`] = String(value);
    }
    return output;
  }, [dataAttributes]);

  const beginResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    let finalWidth = startWidth;
    document.body.classList.add("is-resizing-tool-panel");

    const move = (moveEvent: globalThis.PointerEvent) => {
      const nextWidth = Math.max(minSidebarWidth, Math.min(maxSidebarWidth, startWidth + moveEvent.clientX - startX));
      finalWidth = nextWidth;
      setSidebarWidth(nextWidth);
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.body.classList.remove("is-resizing-tool-panel");
      if (storageKey) window.localStorage.setItem(storageKey, String(Math.round(finalWidth)));
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  return (
    <section
      className={`tool-workspace ${className}`.trim()}
      aria-hidden={hidden ? "true" : "false"}
      data-tool-workspace={toolId}
      hidden={hidden}
      style={{ "--tool-sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      {...attributes}
    >
      <header className="tool-workspace-header">
        <div>
          <p>{title}</p>
          {header}
        </div>
        {toolbar ? <div className="tool-workspace-toolbar">{toolbar}</div> : null}
      </header>
      <aside className="tool-workspace-sidebar" aria-label={sidebarLabel}>
        {sidebar}
      </aside>
      <button
        className="tool-panel-resizer tool-workspace-resizer"
        type="button"
        aria-label={`Resize ${sidebarLabel}`}
        onPointerDown={beginResize}
      />
      <main className="tool-workspace-main">{children}</main>
    </section>
  );
}
