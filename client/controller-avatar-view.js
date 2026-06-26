(function () {
  "use strict";

  function createControllerAvatarView({
    avatarClass,
    avatarComposites,
    avatarFrameImage,
    avatarLabel,
    dinoIcon,
    elements,
    getControllerState,
    playerAvatarArt,
    renderState,
    setControllerPlayer,
    setText,
    setMetaText,
    updateAvatar
  }) {
    const avatarArt = typeof playerAvatarArt === "function"
      ? playerAvatarArt
      : (shape) => `${avatarFrameImage()}${dinoIcon(shape)}`;
    const writeText = typeof setText === "function"
      ? setText
      : (target, value) => {
        if (target) target.textContent = String(value ?? "");
      };
    let pendingShape = "";
    let pickerOpen = false;

    function setBanner(player) {
      if (!player || !elements.banner) return;
      writeText(elements.bannerName, player.name || "Player");
      elements.bannerAvatar.className = `player-avatar ${avatarClass(player.avatar?.shape)}`;
      elements.bannerAvatar.style.setProperty("--avatar-color", player.avatar?.color || "#22d3ee");
      elements.bannerAvatar.innerHTML = avatarArt(player.avatar?.shape);
    }

    function setAvatar(player) {
      elements.avatar.className = `controller-avatar ${avatarClass(player.avatar?.shape)}`;
      elements.avatar.style.setProperty("--avatar-color", player.avatar?.color || "#22d3ee");
      elements.avatar.innerHTML = avatarArt(player.avatar?.shape);
      setBanner(player);
    }

    function renderPicker() {
      const state = getControllerState();
      if (!state?.player) return;
      const currentShape = state.player.avatar?.shape || "rex";
      const currentColor = state.player.avatar?.color || "#22d3ee";
      pendingShape = pendingShape || currentShape;
      elements.pickerGrid.replaceChildren();
      for (const composite of avatarComposites) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "avatar-choice";
        button.classList.toggle("is-selected", composite.species === pendingShape);
        button.style.setProperty("--avatar-color", currentColor);
        button.innerHTML = `
          <span class="avatar-choice-icon">${avatarArt(composite.species)}</span>
          <span class="avatar-choice-label"></span>
        `;
        button.querySelector(".avatar-choice-label").textContent = avatarLabel(composite.species);
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          pendingShape = composite.species;
          renderPicker();
        });
        elements.pickerGrid.appendChild(button);
      }
    }

    function open() {
      const state = getControllerState();
      if (!state?.player) return;
      pendingShape = state.player.avatar?.shape || "rex";
      pickerOpen = true;
      renderPicker();
      elements.picker.classList.remove("hidden");
    }

    async function close({ commit = true } = {}) {
      const state = getControllerState();
      if (!pickerOpen) return;
      pickerOpen = false;
      elements.picker.classList.add("hidden");
      if (!commit || !state?.player) return;
      if (!pendingShape || pendingShape === state.player.avatar?.shape) return;
      try {
        const result = await updateAvatar(pendingShape);
        if (result.player) {
          setControllerPlayer(result.player);
          setAvatar(result.player);
        }
        if (result.lobby) renderState(result.lobby);
      } catch (error) {
        setMetaText(error.message);
      }
    }

    function syncPendingShape(player) {
      if (!pickerOpen) pendingShape = player?.avatar?.shape || "";
    }

    return {
      close,
      isOpen: () => pickerOpen,
      open,
      setAvatar,
      setBanner,
      syncPendingShape
    };
  }

  window.createControllerAvatarView = createControllerAvatarView;
})();
