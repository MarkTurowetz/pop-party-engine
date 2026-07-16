import { useMemo, useRef, useState } from "react";
import {
  canonicalLayoutTag,
  fuzzyLayoutTags,
  normalizeLayoutTag,
  normalizeLayoutTags
} from "./layoutTags";

export function ControllerConfigurationPicker({
  tags,
  value,
  onChange
}: {
  tags: string[];
  value: string;
  onChange: (tag: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const filteredTags = useMemo(() => fuzzyLayoutTags(tags, query), [query, tags]);
  const showAllOption = !normalizeLayoutTag(query) || fuzzyLayoutTags(["All Elements"], query).length > 0;

  const choose = (tag: string) => {
    onChange(tag);
    setQuery(tag);
    setOpen(false);
  };

  return (
    <div
      className="layout-configuration-picker"
      data-controller-preview-tag={value || "all"}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor="controller-layout-configuration">View Configuration</label>
      <div className="layout-tag-combobox">
        <input
          ref={inputRef}
          id="controller-layout-configuration"
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls="controller-layout-configuration-options"
          aria-expanded={open}
          value={open ? query : value || "All Elements"}
          data-controller-preview-tag-input
          onFocus={() => {
            setQuery(value);
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              event.currentTarget.blur();
              return;
            }
            if (event.key !== "Enter") return;
            event.preventDefault();
            const normalizedQuery = normalizeLayoutTag(query);
            if (!normalizedQuery || ["all", "all elements"].includes(normalizedQuery.toLowerCase())) {
              choose("");
              return;
            }
            const exact = canonicalLayoutTag(tags, normalizedQuery);
            if (exact || filteredTags[0]) choose(exact || filteredTags[0]);
          }}
        />
        <button
          type="button"
          className="layout-tag-combobox-toggle"
          aria-label="Choose a controller configuration"
          aria-expanded={open}
          onClick={() => {
            const nextOpen = !open;
            setOpen(nextOpen);
            if (nextOpen) {
              setQuery(value);
              inputRef.current?.focus();
            }
          }}
        >
          ▾
        </button>
      </div>
      {open ? (
        <div id="controller-layout-configuration-options" className="layout-tag-options" role="listbox">
          {showAllOption ? (
            <button
              type="button"
              role="option"
              aria-selected={!value}
              data-controller-preview-tag-option="all"
              onClick={() => choose("")}
            >
              All Elements
            </button>
          ) : null}
          {filteredTags.map((tag) => (
            <button
              type="button"
              role="option"
              aria-selected={tag === value}
              data-controller-preview-tag-option={tag}
              key={tag}
              onClick={() => choose(tag)}
            >
              {tag}
            </button>
          ))}
          {!showAllOption && filteredTags.length === 0 ? <p>No matching tags in this view.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function LayoutElementTagEditor({
  availableTags,
  tags,
  onChange
}: {
  availableTags: string[];
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const normalizedTags = normalizeLayoutTags(tags);
  const remainingTags = availableTags.filter((tag) => !canonicalLayoutTag(normalizedTags, tag));
  const suggestions = fuzzyLayoutTags(remainingTags, query);

  const add = (value: string) => {
    const normalized = normalizeLayoutTag(value);
    if (!normalized) return;
    const tag = canonicalLayoutTag(availableTags, normalized) || normalized;
    onChange(normalizeLayoutTags([...normalizedTags, tag]));
    setQuery("");
    setOpen(false);
  };

  return (
    <div
      className="flow-react-field layout-element-tag-editor"
      data-layout-field="tags"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <span>Configuration Tags</span>
      <div className="layout-element-tag-editor-body">
        <div className="layout-tag-chip-list" data-layout-element-tags={normalizedTags.join("|")}>
          {normalizedTags.length ? (
            normalizedTags.map((tag) => (
              <button
                type="button"
                className="layout-tag-chip"
                aria-label={`Remove ${tag}`}
                data-layout-element-tag={tag}
                key={tag}
                onClick={() => onChange(normalizedTags.filter((candidate) => candidate !== tag))}
              >
                <span>{tag}</span>
                <b aria-hidden="true">×</b>
              </button>
            ))
          ) : (
            <small>No configuration tags</small>
          )}
        </div>
        <div className="layout-tag-entry">
          <input
            type="text"
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={open}
            placeholder="Add or find a tag"
            value={query}
            data-layout-element-field="tags"
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                return;
              }
              if (event.key !== "Enter") return;
              event.preventDefault();
              add(canonicalLayoutTag(availableTags, query) || suggestions[0] || query);
            }}
          />
          <button type="button" disabled={!normalizeLayoutTag(query)} onClick={() => add(query)}>
            Add
          </button>
          {open && suggestions.length ? (
            <div className="layout-tag-options layout-tag-suggestions" role="listbox">
              {suggestions.map((tag) => (
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  data-layout-tag-suggestion={tag}
                  key={tag}
                  onClick={() => add(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <small>Tags are local to this controller view.</small>
      </div>
    </div>
  );
}
