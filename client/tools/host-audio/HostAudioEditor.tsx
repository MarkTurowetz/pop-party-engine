import { useRef, useState } from "react";
import type { HostAudioController } from "./hostAudioController";
import { useHostAudioEditor } from "./useHostAudioEditor";
import { ToolWorkspace } from "../common/ToolWorkspace";

export interface HostAudioEditorProps {
  controller: HostAudioController;
  surface?: string;
}

/**
 * Writable, React-only host-audio editor: sets of audio lines (text + URL) with
 * client-side preview playback. Routes every edit through the typed controller.
 */
export function HostAudioEditor({ controller, surface = "host-audio" }: HostAudioEditorProps) {
  const { hostAudios, dirty, saving, canUndo, canRedo } = useHostAudioEditor(controller);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [selectedSetId, setSelectedSetId] = useState(() => hostAudios.hostAudios[0]?.id || "");
  const selectedSet =
    hostAudios.hostAudios.find((set) => set.id === selectedSetId) ||
    hostAudios.hostAudios[0] ||
    null;
  const selectedSetIndex = selectedSet
    ? hostAudios.hostAudios.findIndex((set) => set.id === selectedSet.id)
    : -1;

  const play = (url: string) => {
    if (!url) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    void audio.play().catch(() => {
      /* preview is best-effort (bad URL / autoplay blocked) */
    });
  };

  const addSet = () => {
    controller.addSet();
    const next = controller.getState().hostAudios.hostAudios.at(-1);
    setSelectedSetId(next?.id || "");
  };

  const sidebar = (
    <>
      <h3>Host Audios</h3>
      <ol className="tool-sidebar-list" data-host-audio-react-component="set-list">
        {hostAudios.hostAudios.map((set) => (
          <li data-host-audio-set-id={set.id} key={set.id}>
            <button
              type="button"
              aria-current={set.id === selectedSet?.id ? "true" : undefined}
              onClick={() => setSelectedSetId(set.id)}
            >
              <span>
                <strong>{set.name}</strong>
                <small>{set.lines.length} lines</small>
              </span>
              <span data-host-audio-line-count>{set.lines.length}</span>
            </button>
          </li>
        ))}
      </ol>
      <button type="button" data-add-host-audio-set onClick={addSet}>
        Add Host Audio
      </button>
    </>
  );

  const toolbar = (
    <>
      <button type="button" disabled={!canUndo} onClick={() => controller.undo()}>
        Undo
      </button>
      <button type="button" disabled={!canRedo} onClick={() => controller.redo()}>
        Redo
      </button>
      <button type="button" disabled={!dirty || saving} onClick={() => void controller.save()}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button type="button" disabled={!dirty} onClick={() => controller.revert()}>
        Revert
      </button>
      <span data-host-audio-editor-status>{dirty ? "Unsaved changes" : "Saved"}</span>
    </>
  );

  return (
    <ToolWorkspace
      className="host-audio-workspace"
      dataAttributes={{
        "host-audio-react-shell": "react",
        surface: surface,
        "host-audio-editor-dirty": dirty ? "true" : "false"
      }}
      header={<h2>{selectedSet?.name || "Host Audios"}</h2>}
      sidebar={sidebar}
      sidebarLabel="Host audio sets"
      storageKey="partyTemplate.hostAudioSidebarWidth"
      title="Host Audios"
      toolbar={toolbar}
      toolId="host-audio"
    >
      {selectedSet ? (
        <section
          className="tool-detail-grid"
          data-host-audio-react-component="selected-set"
          data-host-audio-set-id={selectedSet.id}
        >
          <header className="tool-detail-header">
            <label className="flow-react-field" data-host-audio-field="name">
              <span>Name</span>
              <input
                type="text"
                key={`${selectedSet.id}-name`}
                defaultValue={selectedSet.name}
                data-host-audio-name-input={selectedSetIndex}
                onBlur={(event) => controller.renameSet(selectedSetIndex, event.target.value)}
              />
            </label>
            <div className="tool-editor-actions">
              <button
                type="button"
                data-add-host-audio-line={selectedSetIndex}
                onClick={() => controller.addLine(selectedSetIndex)}
              >
                Add Line
              </button>
              <button
                type="button"
                data-remove-host-audio-set={selectedSetIndex}
                onClick={() => controller.removeSet(selectedSetIndex)}
              >
                Remove Set
              </button>
            </div>
          </header>
          <ol className="tool-main-list" data-host-audio-lines>
            {selectedSet.lines.map((line, lineIndex) => (
              <li className="flow-react-line" data-host-audio-line-id={line.id} key={line.id}>
                <div className="flow-react-panel">
                  <label className="flow-react-field" data-host-audio-line-field="text">
                    <span>Text</span>
                    <input
                      type="text"
                      key={`${line.id}-text`}
                      defaultValue={line.text}
                      data-host-audio-line-text={`${selectedSetIndex}:${lineIndex}`}
                      onBlur={(event) =>
                        controller.updateLine(selectedSetIndex, lineIndex, {
                          text: event.target.value
                        })
                      }
                    />
                  </label>
                  <label className="flow-react-field" data-host-audio-line-field="url">
                    <span>Audio URL</span>
                    <input
                      type="text"
                      key={`${line.id}-url`}
                      defaultValue={line.url}
                      data-host-audio-line-url={`${selectedSetIndex}:${lineIndex}`}
                      onBlur={(event) =>
                        controller.updateLine(selectedSetIndex, lineIndex, {
                          url: event.target.value
                        })
                      }
                    />
                  </label>
                  <div className="host-audio-line-controls">
                    <button
                      className="host-audio-play-button"
                      type="button"
                      disabled={!line.url}
                      data-play-host-audio-line={`${selectedSetIndex}:${lineIndex}`}
                      onClick={() => play(line.url)}
                    >
                      Play
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <section className="flow-react-panel" data-host-audio-empty="true">
          <h3>No Host Audio</h3>
          <button type="button" data-add-host-audio-set onClick={addSet}>
            Add Host Audio
          </button>
        </section>
      )}
    </ToolWorkspace>
  );
}
