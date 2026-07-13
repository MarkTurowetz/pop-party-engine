import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  clampColorChannel,
  colorAlphaPercent,
  colorValueFromRgba,
  colorWithAlphaPercent,
  hsvToRgba,
  parseColorValue,
  rgbaToHsv,
  type RgbaColor
} from "./colorPickerModel";

export interface ColorPickerFieldProps {
  dataField?: string;
  label: string;
  onCommit: (value: string) => void;
  value: unknown;
}

const DEFAULT_COLOR: RgbaColor = { r: 255, g: 255, b: 255, a: 255 };

function parsedOrDefault(value: unknown): RgbaColor {
  return parseColorValue(value) || DEFAULT_COLOR;
}

function sliderCommitKey(event: ReactKeyboardEvent<HTMLInputElement>): boolean {
  return ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key);
}

export function ColorPickerField({ dataField, label, onCommit, value }: ColorPickerFieldProps) {
  const normalizedValue = colorValueFromRgba(parsedOrDefault(value));
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraftState] = useState<RgbaColor>(() => parsedOrDefault(value));
  const [hexDraft, setHexDraft] = useState(normalizedValue);
  const [lastExternalValue, setLastExternalValue] = useState(normalizedValue);
  const activeSpectrumPointerRef = useRef<number | null>(null);

  if (normalizedValue !== lastExternalValue) {
    const next = parsedOrDefault(value);
    setDraftState(next);
    setHexDraft(colorValueFromRgba(next));
    setLastExternalValue(normalizedValue);
  }

  const setDraft = (next: RgbaColor): void => {
    const normalized = {
      r: clampColorChannel(next.r),
      g: clampColorChannel(next.g),
      b: clampColorChannel(next.b),
      a: clampColorChannel(next.a)
    };
    setDraftState(normalized);
    setHexDraft(colorValueFromRgba(normalized));
  };

  const commit = (next = draft): void => {
    const valueToCommit = colorValueFromRgba(next);
    setHexDraft(valueToCommit);
    onCommit(valueToCommit);
  };

  const commitHex = (rawValue: string): void => {
    const parsed = parseColorValue(rawValue);
    if (!parsed) {
      setHexDraft(colorValueFromRgba(draft));
      return;
    }
    setDraft(parsed);
    commit(parsed);
  };

  const updateSpectrum = (event: ReactPointerEvent<HTMLDivElement>, shouldCommit = false): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const saturation = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    const brightness = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)));
    const next = hsvToRgba({ ...rgbaToHsv(draft), s: saturation, v: brightness }, draft.a);
    setDraft(next);
    if (shouldCommit) commit(next);
  };

  const updateChannel = (channel: "r" | "g" | "b", rawValue: string): void => {
    setDraft({ ...draft, [channel]: clampColorChannel(rawValue) });
  };

  const hsv = rgbaToHsv(draft);
  const colorValue = colorValueFromRgba(draft);
  const opaqueColor = colorValueFromRgba({ ...draft, a: 255 });
  const style = {
    "--tool-color-value": colorValue,
    "--tool-color-hue": `hsl(${hsv.h} 100% 50%)`,
    "--tool-color-opaque": opaqueColor,
    "--tool-color-saturation": `${hsv.s * 100}%`,
    "--tool-color-brightness": `${(1 - hsv.v) * 100}%`
  } as CSSProperties;

  return (
    <div
      className={`tool-color-picker${expanded ? " is-expanded" : ""}`}
      data-tool-color-picker={dataField || label}
      style={style}
    >
      <span className="tool-color-picker-label">{label}</span>
      <div className="tool-color-picker-summary">
        <span className="tool-color-picker-swatch" aria-hidden="true" />
        <input
          type="text"
          value={hexDraft}
          aria-label={`${label} hex`}
          data-art-component-field={dataField}
          spellCheck={false}
          onChange={(event) => setHexDraft(event.target.value)}
          onBlur={(event) => commitHex(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitHex(event.currentTarget.value);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setHexDraft(colorValueFromRgba(draft));
            }
          }}
        />
        <button
          type="button"
          className="tool-color-picker-toggle"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Close" : "Open"} ${label} color picker`}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Close" : "Picker"}
        </button>
      </div>
      {expanded ? (
        <div className="tool-color-picker-details">
          <div
            className="tool-color-picker-spectrum"
            role="slider"
            tabIndex={0}
            aria-label={`${label} saturation and brightness`}
            aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
            onPointerDown={(event) => {
              event.preventDefault();
              activeSpectrumPointerRef.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              updateSpectrum(event);
            }}
            onPointerMove={(event) => {
              if (activeSpectrumPointerRef.current !== event.pointerId) return;
              updateSpectrum(event);
            }}
            onPointerUp={(event) => {
              if (activeSpectrumPointerRef.current !== event.pointerId) return;
              updateSpectrum(event, true);
              activeSpectrumPointerRef.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              activeSpectrumPointerRef.current = null;
            }}
            onKeyDown={(event) => {
              const increment = event.shiftKey ? 0.1 : 0.01;
              const current = rgbaToHsv(draft);
              let next: typeof current;
              if (event.key === "ArrowLeft") next = { ...current, s: Math.max(0, current.s - increment) };
              else if (event.key === "ArrowRight") next = { ...current, s: Math.min(1, current.s + increment) };
              else if (event.key === "ArrowUp") next = { ...current, v: Math.min(1, current.v + increment) };
              else if (event.key === "ArrowDown") next = { ...current, v: Math.max(0, current.v - increment) };
              else return;
              event.preventDefault();
              const nextColor = hsvToRgba(next, draft.a);
              setDraft(nextColor);
              commit(nextColor);
            }}
          >
            <span className="tool-color-picker-spectrum-cursor" />
          </div>
          <label className="tool-color-picker-range">
            <span>Hue</span>
            <input
              type="range"
              min="0"
              max="359"
              value={Math.round(hsv.h)}
              aria-label={`${label} hue`}
              onChange={(event) => setDraft(hsvToRgba({ ...rgbaToHsv(draft), h: Number(event.target.value) }, draft.a))}
              onPointerUp={() => commit()}
              onBlur={() => commit()}
              onKeyUp={(event) => {
                if (sliderCommitKey(event)) commit();
              }}
            />
          </label>
          <label className="tool-color-picker-range tool-color-picker-alpha">
            <span>Alpha</span>
            <input
              type="range"
              min="0"
              max="100"
              value={colorAlphaPercent(draft)}
              aria-label={`${label} alpha`}
              onChange={(event) => setDraft(colorWithAlphaPercent(draft, event.target.value))}
              onPointerUp={() => commit()}
              onBlur={() => commit()}
              onKeyUp={(event) => {
                if (sliderCommitKey(event)) commit();
              }}
            />
          </label>
          <div className="tool-color-picker-channels" aria-label={`${label} RGBA channels`}>
            {(["r", "g", "b"] as const).map((channel) => (
              <label key={channel}>
                <span>{channel.toUpperCase()}</span>
                <input
                  type="number"
                  min="0"
                  max="255"
                  value={draft[channel]}
                  aria-label={`${label} ${channel.toUpperCase()}`}
                  onChange={(event) => updateChannel(channel, event.target.value)}
                  onBlur={() => commit()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              </label>
            ))}
            <label>
              <span>A%</span>
              <input
                type="number"
                min="0"
                max="100"
                value={colorAlphaPercent(draft)}
                aria-label={`${label} alpha percent`}
                onChange={(event) => setDraft(colorWithAlphaPercent(draft, event.target.value))}
                onBlur={() => commit()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
