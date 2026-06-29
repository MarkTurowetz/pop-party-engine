import { useRef } from "react";
import type { HostAudioController } from "./hostAudioController";
import { useHostAudioEditor } from "./useHostAudioEditor";

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

  return (
    <section
      className="layout-react-shell"
      data-host-audio-react-shell="react"
      data-surface={surface}
      data-host-audio-editor-dirty={dirty ? "true" : "false"}
    >
      <div className="flow-editor-controls" data-host-audio-react-component="editor-controls">
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
        <button type="button" data-add-host-audio-set onClick={() => controller.addSet()}>
          Add Host Audio
        </button>
        <span data-host-audio-editor-status>{dirty ? "Unsaved changes" : "Saved"}</span>
      </div>

      <ol className="flow-react-list" data-host-audio-react-component="sets">
        {hostAudios.hostAudios.map((set, setIndex) => (
          <li className="flow-react-panel" data-host-audio-set-id={set.id} key={set.id}>
            <header>
              <label className="flow-react-field" data-host-audio-field="name">
                <span>Name</span>
                <input
                  type="text"
                  key={`${set.id}-name`}
                  defaultValue={set.name}
                  data-host-audio-name-input={setIndex}
                  onBlur={(event) => controller.renameSet(setIndex, event.target.value)}
                />
              </label>
              <button type="button" data-add-host-audio-line={setIndex} onClick={() => controller.addLine(setIndex)}>
                Add Line
              </button>
              <button type="button" data-remove-host-audio-set={setIndex} onClick={() => controller.removeSet(setIndex)}>
                Remove Set
              </button>
            </header>
            <ol className="flow-react-list" data-host-audio-lines>
              {set.lines.map((line, lineIndex) => (
                <li className="flow-react-line" data-host-audio-line-id={line.id} key={line.id}>
                  <label className="flow-react-field" data-host-audio-line-field="text">
                    <span>Text</span>
                    <input
                      type="text"
                      key={`${line.id}-text`}
                      defaultValue={line.text}
                      data-host-audio-line-text={`${setIndex}:${lineIndex}`}
                      onBlur={(event) => controller.updateLine(setIndex, lineIndex, { text: event.target.value })}
                    />
                  </label>
                  <label className="flow-react-field" data-host-audio-line-field="url">
                    <span>Audio URL</span>
                    <input
                      type="text"
                      key={`${line.id}-url`}
                      defaultValue={line.url}
                      data-host-audio-line-url={`${setIndex}:${lineIndex}`}
                      onBlur={(event) => controller.updateLine(setIndex, lineIndex, { url: event.target.value })}
                    />
                  </label>
                  <button type="button" data-play-host-audio-line={`${setIndex}:${lineIndex}`} onClick={() => play(line.url)}>
                    Play
                  </button>
                  <button
                    type="button"
                    data-remove-host-audio-line={`${setIndex}:${lineIndex}`}
                    onClick={() => controller.removeLine(setIndex, lineIndex)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  );
}
