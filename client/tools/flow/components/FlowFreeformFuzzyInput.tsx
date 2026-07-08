import { useCallback, useEffect, useRef, useState } from "react";

export interface FlowFuzzyOption {
  id: string;
  label: string;
}

export function fuzzyScoreFlowOption(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  const candidate = text.trim().toLowerCase();
  if (!q) return 1;
  const sub = candidate.indexOf(q);
  if (sub >= 0) return 10000 - sub * 10 + (candidate.startsWith(q) ? 50 : 0);
  let textIndex = 0;
  let score = 0;
  let previous = -2;
  for (let index = 0; index < q.length; index += 1) {
    const found = candidate.indexOf(q[index], textIndex);
    if (found < 0) return null;
    if (found === previous + 1) score += 5;
    if (found === 0 || candidate[found - 1] === " " || candidate[found - 1] === "-") score += 3;
    score += 1;
    previous = found;
    textIndex = found + 1;
  }
  return score;
}

export function fuzzyFilterFlowOptions(query: string, options: FlowFuzzyOption[]): FlowFuzzyOption[] {
  const q = query.trim();
  if (!q) return options;
  const scored: { option: FlowFuzzyOption; score: number }[] = [];
  for (const option of options) {
    const score = Math.max(
      fuzzyScoreFlowOption(q, option.label) ?? -1,
      fuzzyScoreFlowOption(q, option.id) ?? -1
    );
    if (score >= 0) scored.push({ option, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.option);
}

export interface FlowFreeformFuzzyInputProps {
  value: string;
  options: FlowFuzzyOption[];
  placeholder?: string;
  inputDataAttribute?: string;
  onCommit: (value: string) => void;
}

export function FlowFreeformFuzzyInput({
  value,
  options,
  placeholder,
  inputDataAttribute,
  onCommit
}: FlowFreeformFuzzyInputProps) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const committedRef = useRef(value);
  const filtered = open ? fuzzyFilterFlowOptions(draft, options) : options;

  const commit = useCallback((nextValue: string) => {
    const clean = nextValue.trim();
    if (clean !== committedRef.current) {
      committedRef.current = clean;
      onCommit(clean);
    }
    setDraft(clean);
    setOpen(false);
  }, [onCommit]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) commit(draft);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [commit, draft, open]);

  const choose = (option: FlowFuzzyOption) => commit(option.id);

  return (
    <div className="flow-fuzzy-select" ref={containerRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        data-flow-react-field-input={inputDataAttribute}
        aria-expanded={open}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => {
          setOpen(true);
          setActiveIndex(0);
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onBlur={(event) => {
          if (!containerRef.current?.contains(event.relatedTarget as Node | null)) commit(event.currentTarget.value);
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
            if (option) choose(option);
            else commit(draft);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(value);
            setOpen(false);
            event.currentTarget.blur();
          }
        }}
      />
      {open && filtered.length ? (
        <ul className="flow-fuzzy-options" role="listbox">
          {filtered.map((option, index) => {
            const isActive = index === activeIndex;
            const isCurrent = option.id === value;
            return (
              <li
                key={option.id}
                role="option"
                aria-selected={isCurrent}
                data-flow-fuzzy-option={option.id}
                tabIndex={-1}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                data-active={isActive ? "true" : "false"}
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
