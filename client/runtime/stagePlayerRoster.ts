// Typed port of the legacy client/stage/player-roster-renderer.js IIFE — the stage
// player tile roster + point popups. Installs window.PartyGamePlayerRoster for the
// legacy stage runtime. PartyGame* + artComposition deps are read lazily via
// globalThis at call time.

type Dict = Record<string, unknown>;
type El = HTMLElement;
interface GameObjectLike {
  target?: unknown;
  update: (options: Dict) => GameObjectLike;
  playVisibility: (isShown: boolean, options?: Dict) => number;
}
interface GameObjectApi {
  create?: (options: Dict) => GameObjectLike;
}
interface TreeRenderer {
  render: (components: Dict[], canvas: Dict, options: Dict) => void;
}

declare global {
  interface Window {
    PartyGamePlayerRoster?: typeof PartyGamePlayerRoster;
  }
}

const w = () => globalThis as typeof globalThis & Window;

function createGameObject(gameObjectApi: GameObjectApi | undefined, options: Dict = {}): GameObjectLike | null {
  return typeof gameObjectApi?.create === "function" ? gameObjectApi.create(options) : null;
}

function renderStageTextBox(target: El | null, text: unknown, spec: Dict = {}): Dict | null {
  return (w().PartyGameStageTextRenderer?.renderStageTextBox?.(target, text, spec, (spec.options as Dict) || {}) as Dict) || null;
}

function fn(value: unknown): boolean {
  return typeof value === "function";
}

class PlayerRosterRenderer {
  host?: El;
  document: Document;
  gameObjectApi: GameObjectApi | undefined;
  timerSink: ((id: number) => void) | null;
  avatarClass: (shape?: string) => string;
  avatarFrameImage: () => string;
  dinoIcon: (shape?: string) => string;
  playerAvatarArt: (shape?: string) => string;
  syncAnswerBubble: (tile: El, player: Dict, options?: Dict) => number;
  getComposition: (id: string) => Dict | null;
  pointPopupIds = new Set<string>();
  gameObject: GameObjectLike | null = null;
  tileGameObjects = new Map<string, GameObjectLike>();
  pointPopupGameObjects = new Map<string, GameObjectLike>();
  pointPopupRenderers = new WeakMap<El, TreeRenderer>();

  constructor(options: Dict = {}) {
    this.host = options.host as El | undefined;
    this.document = (options.document as Document) || globalThis.document;
    this.gameObjectApi = (options.gameObjectApi as GameObjectApi) || (w().PartyGameGameObject as GameObjectApi) || (w().PartyGameStageGameObject as GameObjectApi);
    this.timerSink = fn(options.timerSink) ? (options.timerSink as (id: number) => void) : null;
    this.avatarClass = fn(options.avatarClass) ? (options.avatarClass as (s?: string) => string) : () => "";
    this.avatarFrameImage = fn(options.avatarFrameImage) ? (options.avatarFrameImage as () => string) : () => "";
    this.dinoIcon = fn(options.dinoIcon) ? (options.dinoIcon as (s?: string) => string) : () => "";
    this.playerAvatarArt = fn(options.playerAvatarArt)
      ? (options.playerAvatarArt as (s?: string) => string)
      : (shape?: string) => `${this.avatarFrameImage()}${this.dinoIcon(shape)}`;
    this.syncAnswerBubble = fn(options.syncAnswerBubble) ? (options.syncAnswerBubble as (t: El, p: Dict, o?: Dict) => number) : () => 0;
    this.getComposition = fn(options.getComposition)
      ? (options.getComposition as (id: string) => Dict | null)
      : (id: string) => w().artComposition?.(id) || null;
  }

  playerSignature(player: Dict): string {
    return JSON.stringify({ name: player.name, avatar: player.avatar || {}, isVip: player.isVip === true });
  }

  createTile(player: Dict, playerIndex: number, signature: string): El {
    const tile = this.document.createElement("article");
    tile.className = "player-tile";
    tile.classList.toggle("needs-input", player.needsInput === true);
    tile.dataset.playerId = player.id as string;
    tile.dataset.signature = signature;
    tile.style.setProperty("--player-index", String(playerIndex));
    tile.append(this.createAvatarNode(player), this.createNameNode(player));
    if (player.isVip) tile.appendChild(this.createVipNode());
    this.syncTileGameObject(tile, player);
    this.syncTileText(tile, player);
    this.syncAnswerBubble(tile, player, { instant: true });
    return tile;
  }

  createAvatarNode(player: Dict): El {
    const avatar = this.document.createElement("div");
    avatar.className = `player-avatar ${this.avatarClass((player.avatar as Dict)?.shape as string)}`.trim();
    avatar.style.setProperty("--avatar-color", ((player.avatar as Dict)?.color as string) || "#22d3ee");
    avatar.dataset.playerPart = "avatar";
    avatar.innerHTML = this.playerAvatarArt((player.avatar as Dict)?.shape as string);
    return avatar;
  }

  createNameNode(player: Dict): El {
    const name = this.document.createElement("div");
    name.className = "player-name";
    name.dataset.playerPart = "name";
    renderStageTextBox(name, player.name, { width: 118, height: 34, fontSize: 17, fontColor: "#17131f" });
    return name;
  }

  createVipNode(): El {
    const badge = this.document.createElement("div");
    badge.className = "vip-badge";
    badge.dataset.playerPart = "vip-badge";
    renderStageTextBox(badge, "VIP", { width: 44, height: 22, fontSize: 11, fontColor: "#17131f" });
    return badge;
  }

  syncTileText(tile: El | null, player: Dict): void {
    renderStageTextBox(tile?.querySelector(":scope > .player-name") || null, player.name, {
      width: 118,
      height: 34,
      fontSize: 17,
      fontColor: "#17131f"
    });
    const vipBadge = tile?.querySelector(":scope > .vip-badge") as El | null;
    if (vipBadge) {
      renderStageTextBox(vipBadge, player.isVip ? "VIP" : "", { width: 44, height: 22, fontSize: 11, fontColor: "#17131f" });
    }
  }

  syncTileGameObject(tile: El | null, player: Dict): GameObjectLike | null {
    if (!tile || typeof this.gameObjectApi?.create !== "function") return null;
    const playerId = String(player?.id || tile.dataset.playerId || "");
    if (!playerId) return null;
    const options: Dict = {
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
      setVisible: (isVisible: boolean) => {
        tile.dataset.visualVisible = isVisible ? "true" : "false";
      },
      timerSink: this.timerSink
    };
    const existing = this.tileGameObjects.get(playerId);
    const gameObject = existing?.target === tile ? existing.update(options) : createGameObject(this.gameObjectApi, options);
    if (gameObject) this.tileGameObjects.set(playerId, gameObject);
    return gameObject;
  }

  existingTilesByPlayerId(): Map<string, El> {
    return new Map(
      Array.from(this.host?.querySelectorAll(".player-tile[data-player-id]") || []).map((tile) => [
        (tile as El).dataset.playerId as string,
        tile as El
      ])
    );
  }

  render(players: Dict[] = []): void {
    if (!this.host) return;
    const existingTiles = this.existingTilesByPlayerId();
    const desiredIds = new Set(players.map((player) => player.id as string));
    let cursor = this.host.firstElementChild;
    players.forEach((player, playerIndex) => {
      const signature = this.playerSignature(player);
      const existing = existingTiles.get(player.id as string);
      const tile = existing?.dataset.signature === signature ? existing : this.createTile(player, playerIndex, signature);
      tile.classList.toggle("needs-input", player.needsInput === true);
      tile.style.setProperty("--player-index", String(playerIndex));
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
        this.host!.insertBefore(tile, cursor);
      }
      if (!isNewTile) {
        this.syncTileText(tile, player);
        this.syncAnswerBubble(tile, player);
      }
    });
    Array.from(this.host.querySelectorAll(".player-tile[data-player-id]")).forEach((node) => {
      const tile = node as El;
      if (!desiredIds.has(tile.dataset.playerId as string)) {
        this.tileGameObjects.delete(String(tile.dataset.playerId || ""));
        tile.remove();
      }
    });
  }

  visibilityDuration(options: Dict = {}): number {
    if (options.instant === true) return 0;
    const playerCount = this.host?.querySelectorAll(".player-tile").length || 0;
    return 1000 + Math.max(0, playerCount - 1) * 45;
  }

  gameObjectForRoster(options: Dict = {}): GameObjectLike | null {
    if (!this.host) return null;
    const duration = this.visibilityDuration(options);
    const gameObjectOptions: Dict = {
      id: this.host.id || "playerLobby",
      target: this.host,
      visibilityKey: `widget:${this.host.id || "playerLobby"}`,
      visualOptions: {
        hiddenClasses: ["players-hidden"],
        motionHiddenClasses: ["players-hidden"],
        instantClass: "players-instant",
        layoutHiddenClasses: ["players-hidden"],
        durations: { appear: duration, disappear: duration }
      },
      getVisible: () => !this.host!.classList.contains("players-hidden"),
      setVisible: (isVisible: boolean) => {
        this.host!.dataset.visualVisible = isVisible ? "true" : "false";
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

  setShown(isShown: boolean, options: Dict = {}): number {
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

  tileForPlayerId(playerId: unknown): El | null {
    if (!this.host || !playerId) return null;
    return this.host.querySelector(`.player-tile[data-player-id="${CSS.escape(String(playerId))}"]`);
  }

  renderPointPopups(popups: Dict[] = []): void {
    for (const popup of popups || []) {
      if (!popup?.id || this.pointPopupIds.has(popup.id as string)) continue;
      const tile = this.tileForPlayerId(popup.playerId);
      if (!tile) continue;
      this.pointPopupIds.add(popup.id as string);
      const node = this.document.createElement("div");
      node.className = "point-popup point-popup-hidden";
      node.dataset.pointPopupId = popup.id as string;
      this.renderPointPopupPrefab(node, popup);
      tile.appendChild(node);
      this.playPointPopup(node, popup);
    }
  }

  clonePrefabComponent(component: Dict, overrides: Dict = {}): Dict {
    const clone: Dict = {
      ...component,
      children: ((component.children as Dict[]) || []).map((child) => this.clonePrefabComponent(child, overrides))
    };
    const text = (overrides.text as Dict)?.[clone.id as string];
    if (text !== undefined && (clone.kind === "text" || clone.kind === "badge")) clone.defaultText = String(text ?? "");
    if ((overrides.props as Dict)?.[clone.id as string]) Object.assign(clone, (overrides.props as Dict)[clone.id as string]);
    return clone;
  }

  renderPointPopupPrefab(node: El, popup: Dict): boolean {
    const text = `+${Math.max(0, Math.floor(Number(popup?.points || 0)))}`;
    const composition = this.getComposition?.("player-point-popup");
    const artRuntime = w().PartyGameArtObject as { ArtObjectTreeRenderer?: new (o: Dict) => TreeRenderer } | undefined;
    if (!node || !composition || !artRuntime?.ArtObjectTreeRenderer) {
      renderStageTextBox(node, text, { width: 120, height: 46, fontSize: 34, fontColor: "var(--yellow)" });
      return false;
    }
    node.classList.add("has-prefab-art");
    const canvas = (composition.canvas as Dict) || { width: 150, height: 60 };
    node.style.width = `${Math.max(1, Number(canvas.width || 1))}px`;
    node.style.height = `${Math.max(1, Number(canvas.height || 1))}px`;
    const components = ((composition.components as Dict[]) || []).map((component) =>
      this.clonePrefabComponent(component, { text: { "point-text": text, "point-shadow": text } })
    );
    let renderer = this.pointPopupRenderers.get(node);
    if (!renderer) {
      renderer = new artRuntime.ArtObjectTreeRenderer({
        host: node,
        document: this.document,
        instanceId: `point-popup:${popup?.id || Math.random().toString(36).slice(2)}`,
        gameObjectApi: this.gameObjectApi,
        visualAnimation: w().PartyGameVisualObject,
        getComposition: this.getComposition
      });
      this.pointPopupRenderers.set(node, renderer);
    }
    renderer.render(components, canvas, { defaultAnimation: "on", instant: true, respectDefaultAnimationState: false });
    return true;
  }

  playPointPopup(node: El, popup: Dict): number {
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
        durations: { appear: 1500, disappear: 0 },
        animationHandlers: {
          appear: (api: Dict) => {
            (api.applyShownState as () => void)();
            (api.removeClasses as (c: unknown) => void)(["is-floating"]);
            void (api.element as El).offsetWidth;
            (api.addClasses as (c: unknown) => void)(["is-floating"]);
            (api.schedule as (d: number, cb: () => void) => void)(1500, () => {
              if (!(api.tokenMatches as () => boolean)()) return;
              this.pointPopupGameObjects.delete(id);
              (api.element as El).remove();
            });
            return 1500;
          }
        },
        transformOrigin: "center center"
      },
      getVisible: () => !node.classList.contains("point-popup-hidden"),
      setVisible: (isVisible: boolean) => {
        node.dataset.visualVisible = isVisible ? "true" : "false";
      },
      timerSink: this.timerSink
    });
    if (!gameObject) {
      node.classList.remove("point-popup-hidden");
      node.classList.add("is-floating");
      setTimeout(() => node.remove(), 1600);
      return 1500;
    }
    this.pointPopupGameObjects.set(id, gameObject);
    return gameObject.playVisibility(true);
  }

  clearPointPopupIds(): void {
    this.pointPopupIds.clear();
  }

  clearPointPopups(): void {
    this.clearPointPopupIds();
    this.pointPopupGameObjects.clear();
    this.host?.querySelectorAll(".point-popup").forEach((node) => node.remove());
  }
}

export const PartyGamePlayerRoster = {
  PlayerRosterRenderer,
  createRenderer: (options?: Dict) => new PlayerRosterRenderer(options)
};

export function installStagePlayerRosterGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGamePlayerRoster = PartyGamePlayerRoster;
}

installStagePlayerRosterGlobals(typeof window !== "undefined" ? window : globalThis);
