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

    function createCompositionButton(data, composition) {
      const isVotingCard = composition.id === "voting-card";
      return ui.createSidebarRow({
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

    function createComponentBranch(data, composition, component, depth = 0) {
      const wrapper = documentRef.createElement("div");
      wrapper.className = "art-group";
      wrapper.style.marginLeft = depth ? "12px" : "0";
      wrapper.appendChild(createComponentButton(data, composition, component));
      if (component.children?.length && !data.collapsedArtComposites.has(`${composition.id}:${component.id}`)) {
        const children = documentRef.createElement("div");
        children.className = "art-composite-children";
        for (const child of component.children || []) {
          children.appendChild(createComponentBranch(data, composition, child, depth + 1));
        }
        wrapper.appendChild(children);
      }
      return wrapper;
    }

    function createCompositionBlock(data, composition) {
      const wrapper = documentRef.createElement("div");
      wrapper.className = "art-group";
      wrapper.appendChild(createCompositionButton(data, composition));
      const children = documentRef.createElement("div");
      children.className = "art-composite-children";
      if (!data.collapsedArtComposites.has(composition.id)) {
        for (const component of composition.components || []) {
          children.appendChild(createComponentBranch(data, composition, component, 0));
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

    function createArtItemButton(data, asset, label = asset.name) {
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
      return button;
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

    function appendSection(target, data, label, collapseId, fillChildren) {
      const group = documentRef.createElement("section");
      group.className = "art-group";
      group.appendChild(createGroupTitle(data, label, collapseId));
      const children = documentRef.createElement("div");
      children.className = "art-group-children";
      if (!data.collapsedArtSections.has(collapseId)) fillChildren(children);
      group.appendChild(children);
      target.appendChild(group);
    }

    function render(target) {
      if (!target) return;
      const data = state();
      target.replaceChildren();
      appendSection(target, data, "Player Avatars", "player-avatars", (children) => {
        for (const composition of data.artCompositions || []) {
          if (String(composition.id || "").startsWith("player-avatar-")) children.appendChild(createCompositionBlock(data, composition));
        }
      });
      appendSection(target, data, "Presentation Click Prompt", "presentation-click-prompt", (children) => {
        for (const composition of data.artCompositions || []) {
          if (composition.id === "presentation-click-prompt") children.appendChild(createCompositionBlock(data, composition));
        }
      });
      for (const composition of data.artCompositions || []) {
        if (String(composition.id || "").startsWith("player-avatar-")) continue;
        if (composition.id === "presentation-click-prompt") continue;
        target.appendChild(createCompositionBlock(data, composition));
      }
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

    return { render };
  }

  const api = { create: createArtSidebarRenderer };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PartyGameArtSidebarRenderer = api;
})(typeof window !== "undefined" ? window : globalThis);
