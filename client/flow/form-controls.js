(function () {
  "use strict";

  function createFormControls(context) {
    function captureHistory() {
      context.pushFlowHistory?.();
    }

    function flowField(label, value, onChange) {
      const field = document.createElement("label");
      field.className = "field-label flow-form-grid";
      field.textContent = label;
      const input = document.createElement("input");
      input.className = "text-input";
      input.value = value || "";
      input.addEventListener("change", () => {
        captureHistory();
        onChange(input.value.trim());
      });
      field.appendChild(input);
      return field;
    }

    function flowActionNameField(state, action, onChange, onRefresh) {
      const field = document.createElement("label");
      field.className = "field-label flow-form-grid action-name-field";
      const labelText = document.createElement("span");
      labelText.textContent = "Action Name";
      const input = document.createElement("input");
      input.className = "text-input";
      input.value = action?.name || "";
      input.addEventListener("change", () => {
        captureHistory();
        onChange(input.value.trim());
      });
      const refreshButton = document.createElement("button");
      refreshButton.type = "button";
      refreshButton.className = "secondary-button action-name-refresh";
      refreshButton.textContent = "↻";
      refreshButton.title = "Rename to action type";
      refreshButton.setAttribute("aria-label", "Rename action to action type");
      refreshButton.addEventListener("click", (event) => {
        event.preventDefault();
        captureHistory();
        context.refreshActionNameFromType?.(state, action);
        onRefresh?.();
      });
      field.append(labelText, input, refreshButton);
      return field;
    }

    function flowTextarea(label, value, onChange) {
      const field = document.createElement("label");
      field.className = "field-label flow-form-grid";
      field.textContent = label;
      const input = document.createElement("textarea");
      input.className = "text-input flow-textarea";
      input.value = value || "";
      let historyCaptured = false;
      input.addEventListener("focus", () => {
        historyCaptured = false;
      });
      input.addEventListener("input", () => {
        if (!historyCaptured) {
          captureHistory();
          historyCaptured = true;
        }
        onChange(input.value);
      });
      field.appendChild(input);
      return field;
    }

    function flowSelect(label, value, options, onChange) {
      const field = document.createElement("label");
      field.className = "field-label flow-form-grid";
      field.textContent = label;
      const select = document.createElement("select");
      select.className = "text-input";
      for (const option of options) {
        const optionEl = document.createElement("option");
        optionEl.value = option.id;
        optionEl.textContent = option.name;
        select.appendChild(optionEl);
      }
      select.value = value;
      select.addEventListener("change", () => {
        captureHistory();
        onChange(select.value);
      });
      field.appendChild(select);
      return field;
    }

    function createSearchField({
      label,
      value,
      options,
      optionsForSearch,
      currentOption,
      emptyText,
      detailText,
      searchText,
      allowCustomValue = false,
      onChange
    }) {
      const field = document.createElement("label");
      field.className = "field-label flow-form-grid flow-search-field";
      field.textContent = label;
      const input = document.createElement("input");
      input.className = "text-input";
      input.autocomplete = "off";
      input.spellcheck = false;
      const menu = document.createElement("div");
      menu.className = "flow-search-options hidden";

      const staticOptions = Array.isArray(options) ? options : [];
      const optionSource = typeof optionsForSearch === "function" ? optionsForSearch : () => staticOptions;
      const current = currentOption || staticOptions.find((option) => option.id === value) || null;
      input.value = current?.name || (allowCustomValue ? String(value || "") : "");
      let committedValue = String(value || "");

      const hideMenu = () => window.setTimeout(() => menu.classList.add("hidden"), 120);
      const chooseOption = (option) => {
        input.value = option.name;
        menu.classList.add("hidden");
        if (option.id !== value) {
          captureHistory();
          onChange(option.id);
        }
      };
      const exactOptionForValue = (rawValue) => {
        const normalized = String(rawValue || "").trim().toLowerCase();
        if (!normalized) return null;
        return optionSource().find((option) => (
          String(option.id || "").toLowerCase() === normalized
          || String(option.name || "").toLowerCase() === normalized
        )) || null;
      };
      const commitCustomValue = () => {
        if (!allowCustomValue) return;
        const rawValue = input.value.trim();
        const exact = exactOptionForValue(rawValue);
        const nextValue = exact?.id || rawValue;
        if (exact) input.value = exact.name;
        if (nextValue !== committedValue) {
          committedValue = nextValue;
          captureHistory();
          onChange(nextValue);
        }
      };
      const renderOptions = () => {
        const activeOptions = optionSource();
        const query = input.value.trim().toLowerCase();
        const matches = fuzzyOptionMatches(activeOptions, query, searchText).slice(0, 8);
        menu.replaceChildren();
        if (matches.length === 0) {
          const empty = document.createElement("div");
          empty.className = "flow-search-option";
          empty.textContent = emptyText;
          menu.appendChild(empty);
        }
        for (const option of matches) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "flow-search-option";
          button.classList.toggle("is-active", option.id === value);
          button.innerHTML = `<strong></strong><span></span>`;
          button.querySelector("strong").textContent = option.name;
          button.querySelector("span").textContent = detailText(option);
          button.addEventListener("mousedown", (event) => event.preventDefault());
          button.addEventListener("click", () => chooseOption(option));
          menu.appendChild(button);
        }
        menu.classList.remove("hidden");
      };

      input.addEventListener("focus", renderOptions);
      input.addEventListener("input", renderOptions);
      input.addEventListener("change", commitCustomValue);
      input.addEventListener("blur", () => {
        commitCustomValue();
        hideMenu();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          menu.classList.add("hidden");
          input.value = current?.name || "";
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const first = fuzzyOptionMatches(optionSource(), input.value.trim().toLowerCase(), searchText)[0];
          if (first) chooseOption(first);
          else commitCustomValue();
        }
      });

      field.appendChild(input);
      field.appendChild(menu);
      return field;
    }

    function flowVariableSearch(label, value, options, onChange) {
      return createSearchField({
        label,
        value,
        options,
        currentOption: options.find((option) => option.id === value) || { id: value, name: value },
        emptyText: "No matching variables",
        detailText: (option) => option.id,
        searchText: (option) => `${option.name} ${option.id}`,
        allowCustomValue: true,
        onChange
      });
    }

    function flowHostAudioSearch(label, value, onChange) {
      const optionsForSearch = () => context.hostAudioFlowOptions?.() || [];
      return createSearchField({
        label,
        value,
        optionsForSearch,
        currentOption: optionsForSearch().find((option) => option.id === value) || null,
        emptyText: "No matching host audios",
        detailText: (option) => option.detail || option.id,
        searchText: (option) => `${option.name} ${option.id}`,
        onChange
      });
    }

    function flowActionTypeSearch(label, value, options, onChange) {
      return createSearchField({
        label,
        value,
        options,
        currentOption: options.find((option) => option.id === value) || options[0],
        emptyText: "No matching actions",
        detailText: (option) => option.category === "input" ? "Input" : "Standard",
        searchText: (option) => `${option.name} ${option.id} ${option.category || ""}`,
        onChange
      });
    }

    function fuzzyOptionMatches(options, query, searchText) {
      if (!query) return [...options];
      return options
        .map((option) => ({ option, score: fuzzyScore(searchText(option), query) }))
        .filter((item) => item.score >= 0)
        .sort((a, b) => a.score - b.score || a.option.name.localeCompare(b.option.name))
        .map((item) => item.option);
    }

    function fuzzyScore(text, query) {
      let score = 0;
      let textIndex = 0;
      const haystack = String(text || "").toLowerCase();
      for (const character of query) {
        const foundIndex = haystack.indexOf(character, textIndex);
        if (foundIndex < 0) return -1;
        score += foundIndex - textIndex;
        textIndex = foundIndex + 1;
      }
      return score + Math.abs(haystack.length - query.length) * 0.01;
    }

    function flowNumber(label, value, onChange) {
      const field = document.createElement("label");
      field.className = "field-label flow-form-grid";
      field.textContent = label;
      const input = document.createElement("input");
      input.className = "text-input";
      input.type = "number";
      input.min = "0";
      input.step = "0.1";
      input.value = Number(value || 0).toFixed(1);
      input.addEventListener("change", () => {
        const nextValue = Number(input.value || 0);
        captureHistory();
        onChange(Math.max(0, Number.isFinite(nextValue) ? nextValue : 0));
      });
      field.appendChild(input);
      return field;
    }

    function flowInteger(label, value, onChange) {
      const field = document.createElement("label");
      field.className = "field-label flow-form-grid";
      field.textContent = label;
      const input = document.createElement("input");
      input.className = "text-input";
      input.type = "number";
      input.min = "0";
      input.step = "1";
      input.value = String(Math.max(0, Math.floor(Number(value || 0))));
      input.addEventListener("change", () => {
        const nextValue = Number(input.value || 0);
        captureHistory();
        onChange(Math.max(0, Number.isFinite(nextValue) ? Math.floor(nextValue) : 0));
      });
      field.appendChild(input);
      return field;
    }

    function flowActionButton(label, onClick) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button";
      button.textContent = label;
      button.addEventListener("click", onClick);
      return button;
    }

    function readOnlyFlowNote(text) {
      const note = document.createElement("p");
      note.className = "art-shared-note";
      note.textContent = text;
      return note;
    }

    return {
      flowActionButton,
      flowActionNameField,
      flowActionTypeSearch,
      flowField,
      flowHostAudioSearch,
      flowInteger,
      flowNumber,
      flowSelect,
      flowTextarea,
      flowVariableSearch,
      readOnlyFlowNote
    };
  }

  window.PartyGameFlowFormControls = { createFormControls };
})();
