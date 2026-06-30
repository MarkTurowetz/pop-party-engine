import { useEffect, useRef, useState } from "react";

export interface ActionTypeOption {
  id: string;
  label: string;
}

/**
 * Fuzzy score for matching `query` against `text` (both lower-cased by the caller).
 * Returns null for no match. A contiguous substring scores highest; otherwise a
 * subsequence match with bonuses for contiguous runs and word-start hits.
 */
function fuzzyScore(query: string, text: string): number | null {
  const sub = text.indexOf(query);
  if (sub >= 0) return 10000 - sub * 10 + (text.startsWith(query) ? 50 : 0);
  let textIndex = 0;
  let score = 0;
  let prev = -2;
  for (let i = 0; i < query.length; i++) {
    const found = text.indexOf(query[i], textIndex);
    if (found < 0) return null;
    if (found === prev + 1) score += 5;
    if (found === 0 || text[found - 1] === " ") score += 3;
    score += 1;
    prev = found;
    textIndex = found + 1;
  }
  return score;
}

export function fuzzyFilterActionTypes(query: string, options: ActionTypeOption[]): ActionTypeOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  const scored: { option: ActionTypeOption; score: number }[] = [];
  for (const option of options) {
    const score = fuzzyScore(q, option.label.toLowerCase());
    if (score !== null) scored.push({ option, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.option);
}

interface ActionTypeSelectProps {
  value: string;
  options: ActionTypeOption[];
  onChange: (id: string) => void;
}

/**
 * Type-to-filter combobox for the action type. Replaces the old <select> so the action
 * type stays searchable as the list of action types grows.
 */
export function ActionTypeSelect({ value, options, onChange }: ActionTypeSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLabel = options.find((option) => option.id === value)?.label || value;
  const filtered = open ? fuzzyFilterActionTypes(query, options) : options;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div
      className="flow-fuzzy-select"
      data-flow-react-action-type-select
      ref={containerRef}
      style={{ position: "relative" }}
    >
      <input
        type="text"
        value={open ? query : currentLabel}
        placeholder={open ? currentLabel : "Search action type…"}
        data-flow-react-action-type-input
        aria-expanded={open}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActiveIndex(0);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const option = filtered[activeIndex];
            if (option) choose(option.id);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            setQuery("");
            event.currentTarget.blur();
          }
        }}
      />
      {open && filtered.length ? (
        <ul
          className="flow-fuzzy-options"
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 20,
            left: 0,
            right: 0,
            top: "calc(100% + 2px)",
            margin: 0,
            padding: 4,
            listStyle: "none",
            maxHeight: 260,
            overflowY: "auto",
            background: "#1b1430",
            border: "2px solid #38bdf8",
            borderRadius: 8,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.45)"
          }}
        >
          {filtered.map((option, index) => {
            const isActive = index === activeIndex;
            const isCurrent = option.id === value;
            return (
              <li
                key={option.id}
                role="option"
                aria-selected={isCurrent}
                data-action-type-option={option.id}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option.id);
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  color: "#f5f3ff",
                  fontWeight: isCurrent ? 700 : 400,
                  background: isActive ? "#38bdf8" : "transparent"
                }}
              >
                {option.label}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
