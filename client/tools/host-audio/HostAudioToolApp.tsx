import type { HostAudios } from "../../types/game-data";

export interface HostAudioToolAppProps {
  hostAudios?: HostAudios | null;
  selectedHostAudioId?: string;
  selectedLineId?: string;
  surface?: string;
  visible?: boolean;
}

export function HostAudioToolApp({
  hostAudios = null,
  selectedHostAudioId = "",
  selectedLineId = "",
  surface = "host-audio",
  visible = false
}: HostAudioToolAppProps) {
  const items = hostAudios?.hostAudios || [];
  const selected = items.find((item) => item.id === selectedHostAudioId) || items[0] || null;
  const selectedLine = (selected?.lines || []).find((line) => line.id === selectedLineId) || null;

  return (
    <section
      aria-hidden={visible ? "false" : "true"}
      className="layout-react-shell"
      data-host-audio-react-shell="legacy-bridge"
      data-host-audio-count={items.length}
      data-line-count={selected?.lines?.length || 0}
      data-surface={surface}
      hidden={!visible}
    >
      <header className="flow-react-header">
        <div>
          <p>React Preview</p>
          <h2>{selected?.name || "Host Audio"}</h2>
        </div>
        <dl>
          <div>
            <dt>Sets</dt>
            <dd>{items.length}</dd>
          </div>
          <div>
            <dt>Lines</dt>
            <dd>{selected?.lines?.length || 0}</dd>
          </div>
        </dl>
      </header>
      <section className="flow-react-panel">
        <h3>Sets</h3>
        <ol className="flow-react-list" data-host-audio-react-component="set-list">
          {items.map((item) => (
            <li aria-current={item.id === selected?.id ? "true" : undefined} data-host-audio-id={item.id} key={item.id}>
              <button type="button">
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.id}</small>
                </span>
                <span data-action-count>{item.lines?.length || 0}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section className="flow-react-panel">
        <h3>Lines</h3>
        <ol className="flow-react-list" data-host-audio-react-component="line-list">
          {(selected?.lines || []).map((line) => (
            <li aria-current={line.id === selectedLineId ? "true" : undefined} data-host-audio-line-id={line.id} key={line.id}>
              <button type="button">
                <span>
                  <strong>{line.text || line.id}</strong>
                  <small>{line.url ? "audio url" : "missing url"}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section className="flow-react-panel flow-react-inspector" data-host-audio-react-component="summary">
        <h3>Inspector</h3>
        <h2>{selectedLine?.text || selected?.name || "Selection"}</h2>
        <dl>
          <dt>Set</dt>
          <dd>{selected?.id || ""}</dd>
          <dt>Line</dt>
          <dd>{selectedLine?.id || "None"}</dd>
          <dt>URL</dt>
          <dd>{selectedLine?.url || "None"}</dd>
        </dl>
      </section>
    </section>
  );
}
