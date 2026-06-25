(function attachPartyGamePlayerRoster(global) {
  "use strict";

  function createGameObject(gameObjectApi, options = {}) {
    return typeof gameObjectApi?.create === "function" ? gameObjectApi.create(options) : null;
  }

  class PlayerRosterRenderer {
    constructor(options = {}) {
      this.host = options.host;
      this.document = options.document || global.document;
      this.gameObjectApi = options.gameObjectApi || global.PartyGameGameObject || global.PartyGameStageGameObject;
      this.timerSink = typeof options.timerSink === "function" ? options.timerSink : null;
      this.avatarClass = typeof options.avatarClass === "function" ? options.avatarClass : () => "";
      this.avatarFrameImage = typeof options.avatarFrameImage === "function" ? options.avatarFrameImage : () => "";
      this.dinoIcon = typeof options.dinoIcon === "function" ? options.dinoIcon : () => "";
      this.playerAvatarArt = typeof options.playerAvatarArt === "function" ? options.playerAvatarArt : (shape) => `${this.avatarFrameImage()}${this.dinoIcon(shape)}`;
      this.syncAnswerBubble = typeof options.syncAnswerBubble === "function" ? options.syncAnswerBubble : () => 0;
      this.pointPopupIds = new Set();
      this.gameObject = null;
    }

    playerSignature(player) {
      return JSON.stringify({
        name: player.name,
        avatar: player.avatar || {},
        isVip: player.isVip === true
      });
    }

    createTile(player, playerIndex, signature) {
      const tile = this.document.createElement("article");
      tile.className = "player-tile";
      tile.classList.toggle("needs-input", player.needsInput === true);
      tile.dataset.playerId = player.id;
      tile.dataset.signature = signature;
      tile.style.setProperty("--player-index", playerIndex);
      tile.innerHTML = `
        <div class="player-avatar ${this.avatarClass(player.avatar?.shape)}" style="--avatar-color:${player.avatar?.color || "#22d3ee"}">${this.playerAvatarArt(player.avatar?.shape)}</div>
        <div class="player-name"></div>
        ${player.isVip ? '<div class="vip-badge">VIP</div>' : ""}
      `;
      tile.querySelector(".player-name").textContent = player.name;
      this.syncAnswerBubble(tile, player, { instant: true });
      return tile;
    }

    existingTilesByPlayerId() {
      return new Map(Array.from(this.host?.querySelectorAll(".player-tile[data-player-id]") || []).map((tile) => [tile.dataset.playerId, tile]));
    }

    render(players = []) {
      if (!this.host) return;
      const existingTiles = this.existingTilesByPlayerId();
      const desiredIds = new Set(players.map((player) => player.id));
      let cursor = this.host.firstElementChild;
      players.forEach((player, playerIndex) => {
        const signature = this.playerSignature(player);
        const existing = existingTiles.get(player.id);
        const tile = existing?.dataset.signature === signature
          ? existing
          : this.createTile(player, playerIndex, signature);
        tile.classList.toggle("needs-input", player.needsInput === true);
        tile.style.setProperty("--player-index", playerIndex);
        if (existing && existing !== tile) {
          if (existing === cursor) cursor = existing.nextElementSibling;
          existing.remove();
        }
        const isNewTile = tile !== existing;
        if (tile === cursor) {
          cursor = cursor.nextElementSibling;
        } else {
          this.host.insertBefore(tile, cursor);
        }
        if (!isNewTile) this.syncAnswerBubble(tile, player);
      });
      Array.from(this.host.querySelectorAll(".player-tile[data-player-id]")).forEach((tile) => {
        if (!desiredIds.has(tile.dataset.playerId)) tile.remove();
      });
    }

    visibilityDuration(options = {}) {
      if (options.instant === true) return 0;
      const playerCount = this.host?.querySelectorAll(".player-tile").length || 0;
      return 1000 + Math.max(0, playerCount - 1) * 45;
    }

    gameObjectForRoster(options = {}) {
      if (!this.host) return null;
      const duration = this.visibilityDuration(options);
      const gameObjectOptions = {
        id: this.host.id || "playerLobby",
        target: this.host,
        visibilityKey: `widget:${this.host.id || "playerLobby"}`,
        visualOptions: {
          hiddenClasses: ["players-hidden"],
          motionHiddenClasses: ["players-hidden"],
          instantClass: "players-instant",
          layoutHiddenClasses: ["players-hidden"],
          durations: {
            appear: duration,
            disappear: duration
          }
        },
        getVisible: () => !this.host.classList.contains("players-hidden"),
        setVisible: (isVisible) => {
          this.host.dataset.visualVisible = isVisible ? "true" : "false";
        },
        timerSink: this.timerSink
      };
      if (!this.gameObject || this.gameObject.target !== this.host) {
        this.gameObject = createGameObject(this.gameObjectApi, gameObjectOptions);
      } else {
        this.gameObject.update(gameObjectOptions);
      }
      return this.gameObject;
    }

    setShown(isShown, options = {}) {
      if (!this.host) return 0;
      const targetShown = isShown !== false;
      const alreadyShown = !this.host.classList.contains("players-hidden");
      const instant = options.instant === true || alreadyShown === targetShown;
      const gameObject = this.gameObjectForRoster(options);
      if (gameObject) return gameObject.playVisibility(targetShown, { instant });
      this.host.classList.toggle("players-hidden", !targetShown);
      this.host.classList.toggle("players-instant", instant);
      return this.visibilityDuration({ ...options, instant });
    }

    tileForPlayerId(playerId) {
      if (!this.host || !playerId) return null;
      return this.host.querySelector(`.player-tile[data-player-id="${global.CSS.escape(String(playerId))}"]`);
    }

    renderPointPopups(popups = []) {
      for (const popup of popups || []) {
        if (!popup?.id || this.pointPopupIds.has(popup.id)) continue;
        const tile = this.tileForPlayerId(popup.playerId);
        if (!tile) continue;
        this.pointPopupIds.add(popup.id);
        const node = this.document.createElement("div");
        node.className = "point-popup";
        node.textContent = `+${Math.max(0, Math.floor(Number(popup.points || 0)))}`;
        tile.appendChild(node);
        global.setTimeout(() => node.remove(), 1600);
      }
    }

    clearPointPopupIds() {
      this.pointPopupIds.clear();
    }

    clearPointPopups() {
      this.clearPointPopupIds();
      this.host?.querySelectorAll(".point-popup").forEach((node) => node.remove());
    }
  }

  global.PartyGamePlayerRoster = {
    PlayerRosterRenderer,
    createRenderer: (options) => new PlayerRosterRenderer(options)
  };
})(window);
