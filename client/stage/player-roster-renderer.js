(function attachPartyGamePlayerRoster(global) {
  "use strict";

  function createGameObject(gameObjectApi, options = {}) {
    return typeof gameObjectApi?.create === "function" ? gameObjectApi.create(options) : null;
  }

  function renderStageTextBox(target, text, spec = {}) {
    return global.PartyGameStageTextRenderer?.renderStageTextBox?.(target, text, spec, spec.options || {}) || null;
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
      this.getComposition = typeof options.getComposition === "function" ? options.getComposition : global.artComposition;
      this.pointPopupIds = new Set();
      this.gameObject = null;
      this.tileGameObjects = new Map();
      this.pointPopupGameObjects = new Map();
      this.pointPopupRenderers = new WeakMap();
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
      tile.append(
        this.createAvatarNode(player),
        this.createNameNode(player)
      );
      if (player.isVip) tile.appendChild(this.createVipNode());
      this.syncTileGameObject(tile, player);
      this.syncTileText(tile, player);
      this.syncAnswerBubble(tile, player, { instant: true });
      return tile;
    }

    createAvatarNode(player) {
      const avatar = this.document.createElement("div");
      avatar.className = `player-avatar ${this.avatarClass(player.avatar?.shape)}`.trim();
      avatar.style.setProperty("--avatar-color", player.avatar?.color || "#22d3ee");
      avatar.dataset.playerPart = "avatar";
      avatar.innerHTML = this.playerAvatarArt(player.avatar?.shape);
      return avatar;
    }

    createNameNode(player) {
      const name = this.document.createElement("div");
      name.className = "player-name";
      name.dataset.playerPart = "name";
      renderStageTextBox(name, player.name, {
        width: 118,
        height: 34,
        fontSize: 17,
        fontColor: "#17131f"
      });
      return name;
    }

    createVipNode() {
      const badge = this.document.createElement("div");
      badge.className = "vip-badge";
      badge.dataset.playerPart = "vip-badge";
      renderStageTextBox(badge, "VIP", {
        width: 44,
        height: 22,
        fontSize: 11,
        fontColor: "#17131f"
      });
      return badge;
    }

    syncTileText(tile, player) {
      renderStageTextBox(tile?.querySelector(":scope > .player-name"), player.name, {
        width: 118,
        height: 34,
        fontSize: 17,
        fontColor: "#17131f"
      });
      const vipBadge = tile?.querySelector(":scope > .vip-badge");
      if (vipBadge) {
        renderStageTextBox(vipBadge, player.isVip ? "VIP" : "", {
          width: 44,
          height: 22,
          fontSize: 11,
          fontColor: "#17131f"
        });
      }
    }

    syncTileGameObject(tile, player) {
      if (!tile || typeof this.gameObjectApi?.create !== "function") return null;
      const playerId = String(player?.id || tile.dataset.playerId || "");
      if (!playerId) return null;
      const options = {
        id: `player-tile-${playerId}`,
        target: tile,
        visibilityKey: `player:${playerId}`,
        visualOptions: {
          hiddenClasses: ["player-tile-hidden"],
          motionHiddenClasses: ["player-tile-hidden"],
          instantClass: "players-instant",
          layoutHiddenClasses: ["player-tile-hidden"],
          transformOrigin: "center center"
        },
        getVisible: () => !tile.classList.contains("player-tile-hidden"),
        setVisible: (isVisible) => {
          tile.dataset.visualVisible = isVisible ? "true" : "false";
        },
        timerSink: this.timerSink
      };
      const existing = this.tileGameObjects.get(playerId);
      const gameObject = existing?.target === tile ? existing.update(options) : createGameObject(this.gameObjectApi, options);
      if (gameObject) this.tileGameObjects.set(playerId, gameObject);
      return gameObject;
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
        this.syncTileGameObject(tile, player);
        if (existing && existing !== tile) {
          if (existing === cursor) cursor = existing.nextElementSibling;
          this.tileGameObjects.delete(String(player.id || ""));
          existing.remove();
        }
        const isNewTile = tile !== existing;
        if (tile === cursor) {
          cursor = cursor.nextElementSibling;
        } else {
          this.host.insertBefore(tile, cursor);
        }
        if (!isNewTile) {
          this.syncTileText(tile, player);
          this.syncAnswerBubble(tile, player);
        }
      });
      Array.from(this.host.querySelectorAll(".player-tile[data-player-id]")).forEach((tile) => {
        if (!desiredIds.has(tile.dataset.playerId)) {
          this.tileGameObjects.delete(String(tile.dataset.playerId || ""));
          tile.remove();
        }
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
      if (alreadyShown === targetShown) {
        this.host.dataset.visualVisible = targetShown ? "true" : "false";
        return 0;
      }
      const instant = options.instant === true;
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
        node.className = "point-popup point-popup-hidden";
        node.dataset.pointPopupId = popup.id;
        this.renderPointPopupPrefab(node, popup);
        tile.appendChild(node);
        this.playPointPopup(node, popup);
      }
    }

    clonePrefabComponent(component, overrides = {}) {
      const clone = {
        ...component,
        children: (component.children || []).map((child) => this.clonePrefabComponent(child, overrides))
      };
      const text = overrides.text?.[clone.id];
      if (text !== undefined && (clone.kind === "text" || clone.kind === "badge")) clone.defaultText = String(text ?? "");
      if (overrides.props?.[clone.id]) Object.assign(clone, overrides.props[clone.id]);
      return clone;
    }

    renderPointPopupPrefab(node, popup) {
      const text = `+${Math.max(0, Math.floor(Number(popup?.points || 0)))}`;
      const composition = this.getComposition?.("player-point-popup");
      const artRuntime = global.PartyGameArtObject;
      if (!node || !composition || !artRuntime?.ArtObjectTreeRenderer) {
        renderStageTextBox(node, text, {
          width: 120,
          height: 46,
          fontSize: 34,
          fontColor: "var(--yellow)"
        });
        return false;
      }
      node.classList.add("has-prefab-art");
      const canvas = composition.canvas || { width: 150, height: 60 };
      node.style.width = `${Math.max(1, Number(canvas.width || 1))}px`;
      node.style.height = `${Math.max(1, Number(canvas.height || 1))}px`;
      const components = (composition.components || []).map((component) => this.clonePrefabComponent(component, {
        text: {
          "point-text": text,
          "point-shadow": text
        }
      }));
      let renderer = this.pointPopupRenderers.get(node);
      if (!renderer) {
        renderer = new artRuntime.ArtObjectTreeRenderer({
          host: node,
          document: this.document,
          instanceId: `point-popup:${popup?.id || Math.random().toString(36).slice(2)}`,
          gameObjectApi: this.gameObjectApi,
          visualAnimation: global.PartyGameVisualObject,
          getComposition: this.getComposition
        });
        this.pointPopupRenderers.set(node, renderer);
      }
      renderer.render(components, canvas, {
        defaultAnimation: "on",
        instant: true,
        respectDefaultAnimationState: false
      });
      return true;
    }

    playPointPopup(node, popup) {
      if (!node || !popup?.id) return 0;
      const id = String(popup.id);
      const gameObject = createGameObject(this.gameObjectApi, {
        id: `point-popup-${id}`,
        target: node,
        visibilityKey: `point-popup:${id}`,
        visualOptions: {
          hiddenClasses: ["point-popup-hidden"],
          motionHiddenClasses: ["point-popup-hidden"],
          instantClass: "point-popup-instant",
          layoutHiddenClasses: ["point-popup-hidden"],
          durations: {
            appear: 1500,
            disappear: 0
          },
          animationHandlers: {
            appear: (api) => {
              api.applyShownState();
              api.removeClasses(["is-floating"]);
              void api.element.offsetWidth;
              api.addClasses(["is-floating"]);
              api.schedule(1500, () => {
                if (!api.tokenMatches()) return;
                this.pointPopupGameObjects.delete(id);
                api.element.remove();
              });
              return 1500;
            }
          },
          transformOrigin: "center center"
        },
        getVisible: () => !node.classList.contains("point-popup-hidden"),
        setVisible: (isVisible) => {
          node.dataset.visualVisible = isVisible ? "true" : "false";
        },
        timerSink: this.timerSink
      });
      if (!gameObject) {
        node.classList.remove("point-popup-hidden");
        node.classList.add("is-floating");
        global.setTimeout(() => node.remove(), 1600);
        return 1500;
      }
      this.pointPopupGameObjects.set(id, gameObject);
      return gameObject.playVisibility(true);
    }

    clearPointPopupIds() {
      this.pointPopupIds.clear();
    }

    clearPointPopups() {
      this.clearPointPopupIds();
      this.pointPopupGameObjects.clear();
      this.host?.querySelectorAll(".point-popup").forEach((node) => node.remove());
    }
  }

  global.PartyGamePlayerRoster = {
    PlayerRosterRenderer,
    createRenderer: (options) => new PlayerRosterRenderer(options)
  };
})(window);
