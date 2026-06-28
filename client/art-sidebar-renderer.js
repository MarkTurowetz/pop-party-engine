(function attachPartyGameArtSidebarRenderer(global) {
  "use strict";

  function artCompositeCollapseIds(data, componentTree) {
    const ids = [];
    for (const composite of data.avatarComposites || []) ids.push(composite.id);
    for (const composition of data.artCompositions || []) {
      ids.push(composition.id);
      for (const { component } of componentTree.flattenComponents(composition.components || [])) {
        if (component.children?.length) ids.push(`${composition.id}:${component.id}`);
      }
    }
    return ids;
  }

  function createArtSidebarRenderer(options = {}) {
    const documentRef = options.document || global.document;
    const ui = options.ui || global.PartyGameArtToolUi;
    const componentTree = options.componentTree || global.PartyGameArtComponentTree;
    const affordances = options.affordances || global.PartyGameToolAffordances;
    const createDisclosureButton = options.createDisclosureButton || global.createDisclosureButton;
    const state = () => options.getState?.() || {};

    function createGroupTitle(data, label, collapseId) {
      const title = documentRef.createElement("div");
      title.className = "art-group-title";
      title.appendChild(createDisclosureButton(
        collapseId,
        data.collapsedArtSections,
        options.onCollapseChange,
        () => options.onToggleCollapsedIds?.(data.collapsedArtSections, data.artSectionCollapseIds || [])
      ));
      const text = documentRef.createElement("span");
      text.textContent = label;
      title.appendChild(text);
      return title;
    }

    function findArtAsset(data, assetId) {
      return (data.artAssets || []).find((asset) => asset.id === assetId) || null;
    }

    function createDisclosureSlot(data, id) {
      const slot = documentRef.createElement("span");
      slot.className = "disclosure-slot";
      slot.appendChild(createDisclosureButton(
        id,
        data.collapsedArtComposites,
        options.onCollapseChange,
        () => options.onToggleCollapsedIds?.(data.collapsedArtComposites, artCompositeCollapseIds(data, componentTree))
      ));
      return slot;
    }

    function bindOrganizerRow(row, key) {
      if (!key) return row;
      if (searchQuery(state())) return row;
      affordances?.bindSortableRow(row, {
        itemId: key,
        dragType: "application/x-party-art-organizer",
        ignoreSelector: ".disclosure-button, .art-folder-create, .art-folder-rename, .art-folder-delete, input, textarea, button, select, a",
        getDraggedId: () => options.getDraggedOrganizerKey?.() || "",
        canDrop: (draggedKey, targetKey) => options.canReorderOrganizerItem?.(draggedKey, targetKey) !== false,
        onDragStart: (dragKey) => options.onOrganizerDragStart?.(dragKey),
        onReorder: (draggedKey, targetKey, placeAfter) => options.onReorderOrganizerItem?.(draggedKey, targetKey, placeAfter),
        onDragEnd: () => options.onOrganizerDragEnd?.()
      });
      return row;
    }

    function normalizeSearchText(value) {
      return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    }

    function searchQuery(data) {
      return normalizeSearchText(data.artSearchQuery || "");
    }

    function fuzzyTextMatches(text, query) {
      const cleanText = normalizeSearchText(text);
      const cleanQuery = normalizeSearchText(query);
      if (!cleanQuery) return true;
      if (!cleanText) return false;
      if (cleanText.includes(cleanQuery)) return true;
      let index = 0;
      for (const character of cleanText) {
        if (character === cleanQuery[index]) index += 1;
        if (index >= cleanQuery.length) return true;
      }
      return false;
    }

    function searchableFields(...values) {
      return values.filter((value) => value !== undefined && value !== null).join(" ");
    }

    function componentMatchesSearch(component, query) {
      if (!query) return true;
      return fuzzyTextMatches(searchableFields(
        component?.name,
        component?.id,
        component?.kind,
        component?.defaultText,
        component?.artCompositionId,
        component?.imageName
      ), query);
    }

    function componentTreeMatchesSearch(component, query) {
      if (!query) return true;
      if (componentMatchesSearch(component, query)) return true;
      return (component?.children || []).some((child) => componentTreeMatchesSearch(child, query));
    }

    function compositionMatchesSearch(composition, query) {
      if (!query) return true;
      if (fuzzyTextMatches(searchableFields(composition?.name, composition?.id, composition?.description), query)) return true;
      return (composition?.components || []).some((component) => componentTreeMatchesSearch(component, query));
    }

    function assetMatchesSearch(asset, query) {
      if (!query) return true;
      return fuzzyTextMatches(searchableFields(
        asset?.name,
        asset?.id,
        asset?.use,
        asset?.fileName,
        asset?.parent,
        ...(asset?.sharedBy || [])
      ), query);
    }

    function folderMatchesSearch(folder, query) {
      if (!query) return true;
      return fuzzyTextMatches(searchableFields(folder?.name, folder?.id), query);
    }

    function createCompositionButton(data, composition, organizerKey = "") {
      const isVotingCard = composition.id === "voting-card";
      const row = ui.createSidebarRow({
        className: "art-item is-composite has-disclosure",
        selected: data.selectedArtCompositionId === composition.id && !data.selectedArtComponentId,
        leadingNodes: [
          createDisclosureSlot(data, composition.id),
          ui.createThumb("art-thumb art-composite-thumb", isVotingCard ? '<span class="art-voting-card-thumb"></span>' : "")
        ],
        title: composition.name,
        summary: "Editable art asset",
        onActivate: () => options.onSelectArtComposition?.(composition.id)
      });
      return bindOrganizerRow(row, organizerKey);
    }

    function createComponentButton(data, composition, component) {
      const selectedIds = data.selectedArtComponentIds || new Set();
      const hasChildren = Boolean(component.children?.length);
      const row = ui.createSidebarRow({
        className: `art-item${hasChildren ? " has-disclosure" : ""}`,
        selected: data.selectedArtCompositionId === composition.id && selectedIds.has(component.id),
        leadingNodes: [
          ...(hasChildren ? [createDisclosureSlot(data, `${composition.id}:${component.id}`)] : []),
          ui.createThumb("art-thumb art-component-thumb")
        ],
        title: component.name,
        summary: `${options.artKindLabel?.(component.kind) || "Art"} object / drag to layer`,
        onActivate: (event) => options.onSelectArtComponent?.(composition.id, component.id, {
          additive: event.metaKey || event.ctrlKey || event.shiftKey
        })
      });
      row.title = "Drag to reorder layers. Top of list is frontmost.";
      affordances?.bindSortableRow(row, {
        itemId: component.id,
        dragType: "application/x-party-art-component",
        ignoreSelector: ".disclosure-button, input, textarea, button, select, a",
        getDraggedId: () => options.getDraggedComponentId?.() || "",
        canDrop: (draggedId, targetId) => Boolean(options.canReorderArtComponent?.(draggedId, targetId)),
        onDragStart: (componentId) => options.onComponentDragStart?.(composition.id, componentId, row),
        onReorder: (draggedId, targetId, placeAfter) => options.onReorderArtComponent?.(draggedId, targetId, placeAfter),
        onDragEnd: () => options.onComponentDragEnd?.()
      });
      return row;
    }

    function createComponentBranch(data, composition, component, depth = 0, forceShowAll = false) {
      const query = searchQuery(data);
      if (!forceShowAll && query && !componentTreeMatchesSearch(component, query)) return null;
      const wrapper = documentRef.createElement("div");
      wrapper.className = "art-group";
      wrapper.style.marginLeft = depth ? "12px" : "0";
      wrapper.appendChild(createComponentButton(data, composition, component));
      if (component.children?.length && !data.collapsedArtComposites.has(`${composition.id}:${component.id}`)) {
        const children = documentRef.createElement("div");
        children.className = "art-composite-children";
        for (const child of component.children || []) {
          const childNode = createComponentBranch(data, composition, child, depth + 1, forceShowAll);
          if (childNode) children.appendChild(childNode);
        }
        wrapper.appendChild(children);
      }
      return wrapper;
    }

    function createCompositionBlock(data, composition, organizerKey = "", forceShowAll = false) {
      const query = searchQuery(data);
      const compositionMatches = !query || fuzzyTextMatches(searchableFields(composition?.name, composition?.id, composition?.description), query);
      if (!forceShowAll && query && !compositionMatchesSearch(composition, query)) return null;
      const wrapper = documentRef.createElement("div");
      wrapper.className = "art-group";
      wrapper.appendChild(createCompositionButton(data, composition, organizerKey));
      const children = documentRef.createElement("div");
      children.className = "art-composite-children";
      if (query || forceShowAll || !data.collapsedArtComposites.has(composition.id)) {
        for (const component of composition.components || []) {
          const componentNode = createComponentBranch(data, composition, component, 0, forceShowAll || compositionMatches);
          if (componentNode) children.appendChild(componentNode);
        }
      }
      wrapper.appendChild(children);
      return wrapper;
    }

    function createCompositeButton(data, composite) {
      return ui.createSidebarRow({
        className: "art-item is-composite has-disclosure",
        selected: data.selectedArtComposite?.id === composite.id && !data.selectedArtAsset,
        leadingNodes: [
          createDisclosureSlot(data, composite.id),
          ui.createThumb("art-thumb art-composite-thumb", options.compositePreviewMarkup?.(composite) || "")
        ],
        title: composite.name,
        summary: "Composite preview",
        onActivate: () => options.onSelectArtComposite?.(composite.id)
      });
    }

    function createArtItemButton(data, asset, label = asset.name, organizerKey = "") {
      const image = documentRef.createElement("img");
      image.alt = "";
      image.src = asset.currentUrl;
      const button = ui.createSidebarRow({
        className: "art-item",
        selected: data.selectedArtAsset?.id === asset.id,
        dataset: { assetId: asset.id },
        leadingNodes: [ui.createThumb("art-thumb", image)],
        title: label,
        summary: `${asset.sharedBy?.length ? "Shared / " : ""}${asset.hasCustom ? "Custom" : "Default"}`,
        onActivate: () => options.onSelectArtAsset?.(asset.id)
      });
      button.classList.toggle("is-shared", Boolean(asset.sharedBy?.length));
      return bindOrganizerRow(button, organizerKey);
    }

    function createCompositeBlock(data, composite) {
      const wrapper = documentRef.createElement("div");
      wrapper.className = "art-group";
      wrapper.appendChild(createCompositeButton(data, composite));
      const children = documentRef.createElement("div");
      children.className = "art-composite-children";
      if (!data.collapsedArtComposites.has(composite.id)) {
        const dinoAsset = findArtAsset(data, composite.dinoAssetId);
        const frameAsset = findArtAsset(data, "avatar-frame");
        if (dinoAsset) children.appendChild(createArtItemButton(data, dinoAsset, "Dino Art"));
        if (frameAsset) children.appendChild(createArtItemButton(data, frameAsset, "Rectangle (shared)"));
      }
      wrapper.appendChild(children);
      return wrapper;
    }

    function appendIfNode(target, node) {
      if (node) target.appendChild(node);
    }

    function appendSection(target, data, label, collapseId, fillChildren) {
      const group = documentRef.createElement("section");
      group.className = "art-group";
      group.appendChild(createGroupTitle(data, label, collapseId));
      const children = documentRef.createElement("div");
      children.className = "art-group-children";
      fillChildren(children);
      if (!children.childElementCount) return false;
      if (!searchQuery(data) && data.collapsedArtSections.has(collapseId)) children.replaceChildren();
      group.appendChild(children);
      target.appendChild(group);
      return true;
    }

    function renderStageCompositions(target, data) {
      appendSection(target, data, "Player Avatars", "player-avatars", (children) => {
        for (const composition of data.artCompositions || []) {
          if (String(composition.id || "").startsWith("player-avatar-")) appendIfNode(children, createCompositionBlock(data, composition));
        }
      });
      appendSection(target, data, "Player Objects", "player-objects", (children) => {
        for (const composition of data.artCompositions || []) {
          if (
            composition.id === "player-answer-bubble"
            || composition.id === "player-point-popup"
            || String(composition.id || "").startsWith("player-object-")
          ) appendIfNode(children, createCompositionBlock(data, composition));
        }
      });
      appendSection(target, data, "Presentation Click Prompt", "presentation-click-prompt", (children) => {
        for (const composition of data.artCompositions || []) {
          if (composition.id === "presentation-click-prompt") appendIfNode(children, createCompositionBlock(data, composition));
        }
      });
      for (const composition of data.artCompositions || []) {
        if (String(composition.id || "").startsWith("player-avatar-")) continue;
        if (composition.id === "player-answer-bubble") continue;
        if (composition.id === "player-point-popup") continue;
        if (String(composition.id || "").startsWith("player-object-")) continue;
        if (composition.id === "presentation-click-prompt") continue;
        appendIfNode(target, createCompositionBlock(data, composition));
      }
    }

    function renderFlatCompositions(target, data) {
      for (const composition of data.artCompositions || []) {
        appendIfNode(target, createCompositionBlock(data, composition));
      }
    }

    function organizerSurface(data) {
      return data.selectedArtSurface === "controller" ? "controller" : "stage";
    }

    function organizerState(data) {
      const organization = data.artOrganization?.[organizerSurface(data)] || {};
      return {
        folders: Array.isArray(organization.folders) ? organization.folders : [],
        order: Array.isArray(organization.order) ? organization.order : [],
        folderItems: organization.folderItems && typeof organization.folderItems === "object" ? organization.folderItems : {}
      };
    }

    function hasOrganizerData(data) {
      const organization = organizerState(data);
      return Boolean(organization.folders.length || organization.order.length || Object.values(organization.folderItems).some((items) => Array.isArray(items) && items.length));
    }

    function organizerEntries(data) {
      const entries = new Map();
      for (const composition of data.artCompositions || []) {
        entries.set(`composition:${composition.id}`, { key: `composition:${composition.id}`, type: "composition", value: composition });
      }
      for (const asset of data.artAssets || []) {
        if (asset.parent && ["player-avatar", "presentation-click-prompt"].includes(asset.parent)) continue;
        entries.set(`asset:${asset.id}`, { key: `asset:${asset.id}`, type: "asset", value: asset });
      }
      return entries;
    }

    function renderOrganizerEntry(data, entry, forceShowAll = false) {
      if (!entry) return null;
      if (entry.type === "composition") return createCompositionBlock(data, entry.value, entry.key, forceShowAll);
      if (entry.type === "asset") {
        if (!forceShowAll && !assetMatchesSearch(entry.value, searchQuery(data))) return null;
        const wrapper = documentRef.createElement("section");
        wrapper.className = "art-group";
        wrapper.appendChild(createArtItemButton(data, entry.value, entry.value.name, entry.key));
        return wrapper;
      }
      return null;
    }

    function organizerEntryMatchesSearch(data, entry) {
      if (!entry) return false;
      const query = searchQuery(data);
      if (!query) return true;
      if (entry.type === "composition") return compositionMatchesSearch(entry.value, query);
      if (entry.type === "asset") return assetMatchesSearch(entry.value, query);
      return false;
    }

    function folderHasSearchMatch(data, folder, entries, folderById, organization, visited = new Set()) {
      const query = searchQuery(data);
      if (!query) return true;
      if (!folder || visited.has(folder.id)) return false;
      if (folderMatchesSearch(folder, query)) return true;
      visited.add(folder.id);
      for (const key of folderItemKeys(organization, entries, folderById, folder.id)) {
        if (key.startsWith("folder:")) {
          if (folderHasSearchMatch(data, folderById.get(key.slice(7)), entries, folderById, organization, visited)) return true;
        } else if (organizerEntryMatchesSearch(data, entries.get(key))) {
          return true;
        }
      }
      return false;
    }

    function createFolderBlock(data, folder, entries, folderById, organization, itemKeys = [], path = new Set()) {
      const query = searchQuery(data);
      const folderMatches = folderMatchesSearch(folder, query);
      if (query && !folderHasSearchMatch(data, folder, entries, folderById, organization)) return null;
      const collapseId = `art-folder:${organizerSurface(data)}:${folder.id}`;
      const wrapper = documentRef.createElement("section");
      wrapper.className = "art-group art-folder";
      wrapper.style.setProperty("--art-folder-depth", String(path.size));
      const title = documentRef.createElement("div");
      title.className = "art-group-title art-folder-title";
      title.appendChild(createDisclosureButton(
        collapseId,
        data.collapsedArtSections,
        options.onCollapseChange,
        () => options.onToggleCollapsedIds?.(data.collapsedArtSections, [collapseId])
      ));
      const label = documentRef.createElement("span");
      label.textContent = folder.name || "Folder";
      title.appendChild(label);
      const createNested = documentRef.createElement("button");
      createNested.type = "button";
      createNested.className = "art-folder-create";
      createNested.textContent = "+ Folder";
      createNested.addEventListener("click", (event) => {
        event.stopPropagation();
        options.onCreateFolder?.(folder.id);
      });
      title.appendChild(createNested);
      const rename = documentRef.createElement("button");
      rename.type = "button";
      rename.className = "art-folder-rename";
      rename.textContent = "Rename";
      rename.addEventListener("click", (event) => {
        event.stopPropagation();
        options.onRenameFolder?.(folder.id);
      });
      title.appendChild(rename);
      const deleteButton = documentRef.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "art-folder-delete";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        options.onDeleteFolder?.(folder.id);
      });
      title.appendChild(deleteButton);
      bindOrganizerRow(title, `folder:${folder.id}`);
      title.addEventListener("dragover", (event) => {
        const draggedKey = options.getDraggedOrganizerKey?.() || "";
        if (!draggedKey || options.canMoveOrganizerItemToFolder?.(draggedKey, folder.id) === false) return;
        event.preventDefault();
        title.classList.add("is-folder-drop");
      });
      title.addEventListener("dragleave", () => title.classList.remove("is-folder-drop"));
      title.addEventListener("drop", (event) => {
        const draggedKey = options.getDraggedOrganizerKey?.() || "";
        if (!draggedKey || options.canMoveOrganizerItemToFolder?.(draggedKey, folder.id) === false) return;
        event.preventDefault();
        title.classList.remove("is-folder-drop");
        options.onMoveOrganizerItemToFolder?.(draggedKey, folder.id);
      });
      wrapper.appendChild(title);
      const children = documentRef.createElement("div");
      children.className = "art-group-children art-folder-children";
      if (query || !data.collapsedArtSections.has(collapseId)) {
        for (const key of itemKeys) {
          let node = null;
          if (key.startsWith("folder:")) {
            const nestedFolderId = key.slice(7);
            const nestedFolder = folderById.get(nestedFolderId);
            if (nestedFolder && nestedFolderId !== folder.id && !path.has(nestedFolderId)) {
              if (query && !folderMatches && !folderHasSearchMatch(data, nestedFolder, entries, folderById, organization)) continue;
              node = createFolderBlock(
                data,
                nestedFolder,
                entries,
                folderById,
                organization,
                folderItemKeys(organization, entries, folderById, nestedFolderId),
                new Set([...path, folder.id])
              );
            }
          } else {
            const entry = entries.get(key);
            if (!query || folderMatches || organizerEntryMatchesSearch(data, entry)) node = renderOrganizerEntry(data, entry, folderMatches);
          }
          if (node) children.appendChild(node);
        }
      }
      wrapper.appendChild(children);
      return wrapper;
    }

    function folderItemKeys(organization, entries, folderById, folderId) {
      return (organization.folderItems?.[folderId] || []).filter((itemKey) => {
        if (entries.has(itemKey)) return true;
        return itemKey.startsWith("folder:") && folderById.has(itemKey.slice(7));
      });
    }

    function renderOrganizedSurface(target, data) {
      const organization = organizerState(data);
      const entries = organizerEntries(data);
      const folderById = new Map(organization.folders.map((folder) => [folder.id, folder]));
      const assigned = new Set();
      const topKeys = [];
      for (const folder of organization.folders) {
        for (const key of folderItemKeys(organization, entries, folderById, folder.id)) assigned.add(key);
      }
      for (const key of organization.order || []) {
        if (assigned.has(key)) continue;
        if (key.startsWith("folder:") && folderById.has(key.slice(7))) topKeys.push(key);
        else if (entries.has(key)) topKeys.push(key);
      }
      for (const folder of organization.folders) {
        const key = `folder:${folder.id}`;
        if (!topKeys.includes(key) && !assigned.has(key)) topKeys.push(key);
      }
      for (const key of entries.keys()) {
        if (!topKeys.includes(key) && !assigned.has(key)) topKeys.push(key);
      }
      for (const key of topKeys) {
        if (key.startsWith("folder:")) {
          const folderId = key.slice(7);
          const folder = folderById.get(folderId);
          if (folder) appendIfNode(target, createFolderBlock(data, folder, entries, folderById, organization, folderItemKeys(organization, entries, folderById, folderId)));
          continue;
        }
        const entry = entries.get(key);
        if (searchQuery(data) && !organizerEntryMatchesSearch(data, entry)) continue;
        const node = renderOrganizerEntry(data, entry);
        if (node) target.appendChild(node);
      }
    }

    function appendEmptyState(target, data) {
      if ((data.artCompositions || []).length || (data.artAssets || []).length) return;
      const empty = documentRef.createElement("div");
      empty.className = "art-empty-state";
      empty.textContent = data.selectedArtSurface === "controller"
        ? "Create controller art to use it in controller layouts."
        : "Create stage art to use it in stage layouts.";
      target.appendChild(empty);
    }

    function appendSearchEmptyState(target, data) {
      const query = searchQuery(data);
      if (!query || target.childElementCount) return;
      const empty = documentRef.createElement("div");
      empty.className = "art-empty-state";
      empty.textContent = `No art assets match "${data.artSearchQuery}".`;
      target.appendChild(empty);
    }

    function render(target) {
      if (!target) return;
      const data = state();
      target.replaceChildren();
      const isOrganized = hasOrganizerData(data);
      if (isOrganized) renderOrganizedSurface(target, data);
      else {
        if (data.selectedArtSurface === "controller") renderFlatCompositions(target, data);
        else renderStageCompositions(target, data);
        const looseAssets = (data.artAssets || []).filter((asset) => {
          return !asset.parent || !["player-avatar", "presentation-click-prompt"].includes(asset.parent);
        });
        for (const asset of looseAssets) {
          const wrapper = documentRef.createElement("section");
          wrapper.className = "art-group";
          wrapper.appendChild(createArtItemButton(data, asset));
          target.appendChild(wrapper);
        }
      }
      appendSearchEmptyState(target, data);
      appendEmptyState(target, data);
    }

    return { render };
  }

  const api = { create: createArtSidebarRenderer };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PartyGameArtSidebarRenderer = api;
})(typeof window !== "undefined" ? window : globalThis);
