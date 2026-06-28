(function attachPartyGameVotingCardVisuals(global) {
  const KNOWN_COMPONENT_IDS = new Set(["current-card", "answer-text", "author-heading", "voter-container", "vote-count", "vote-widget"]);
  const FALLBACK_VOTING_CARD_COMPOSITION = {
    canvas: { width: 560, height: 230 },
    components: [
      { id: "current-card", x: 280, y: 96, width: 520, height: 118, scale: 1, fillColor: "#fff8d6", borderColor: "#17131f", borderWidth: 5, borderRadius: 16 },
      { id: "answer-text", x: 280, y: 96, width: 420, height: 78, scale: 1, fontSize: 32, fontColor: "#17131f" },
      { id: "author-heading", x: 280, y: 22, width: 340, height: 28, scale: 1, fontSize: 15, fontColor: "#6b5a80" },
      { id: "voter-container", x: 278, y: 188, width: 500, height: 48, scale: 1, childDistribution: "horizontal", fillColor: "transparent", borderColor: "transparent", borderWidth: 0, borderRadius: 0 },
      { id: "vote-count", x: 72, y: 188, width: 112, height: 32, scale: 1, fillColor: "#fff8d6", borderColor: "#17131f", borderWidth: 2, borderRadius: 999, fontSize: 15, fontColor: "#17131f" },
      { id: "vote-widget", x: 280, y: 188, width: 112, height: 32, scale: 1, fillColor: "#fff8d6", borderColor: "#17131f", borderWidth: 2, borderRadius: 999, fontSize: 15, fontColor: "#17131f" }
    ]
  };

  function createVotingCardElement(documentRef, cardId) {
    const group = documentRef.createElement("article");
    group.className = "voting-card-group voting-card-group-hidden";
    group.dataset.cardId = cardId;
    group.innerHTML = `
      <div class="voting-card"></div>
      <div class="voting-card-answer"></div>
      <div class="voting-card-votes voting-card-widget-hidden"></div>
      <div class="voting-card-author voting-card-widget-hidden"></div>
      <div class="voting-card-voters voting-card-widget-hidden"></div>
      <div class="voting-card-art-objects"></div>
    `;
    return group;
  }

  function cloneComponentTree(component) {
    return {
      ...(component || {}),
      children: Array.isArray(component?.children) ? component.children.map(cloneComponentTree) : []
    };
  }

  function safeComponentId(value, fallback) {
    const clean = String(value || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return clean || fallback;
  }

  class VotingCardView {
    constructor(options) {
      this.document = options.document;
      this.visualAnimation = options.visualAnimation;
      this.avatarClass = options.avatarClass;
      this.avatarFrameImage = options.avatarFrameImage;
      this.dinoIcon = options.dinoIcon;
      this.playerAvatarArt = options.playerAvatarArt || ((shape) => `${this.avatarFrameImage()}${this.dinoIcon(shape)}`);
      this.getComposition = options.getComposition;
      this.gameObjectApi = options.gameObjectApi || global.PartyGameGameObject || global.PartyGameStageGameObject;
      this.cardId = options.cardId;
      this.visualGameObjects = new WeakMap();
      this.visualFallbacks = new WeakMap();
      this.element = createVotingCardElement(this.document, options.cardId);
      this.authorElement = this.element.querySelector(".voting-card-author");
      this.cardElement = this.element.querySelector(".voting-card");
      this.answerElement = this.element.querySelector(".voting-card-answer");
      this.voteBadgeElement = this.element.querySelector(".voting-card-votes");
      this.votersElement = this.element.querySelector(".voting-card-voters");
      this.artObjectsElement = this.element.querySelector(".voting-card-art-objects");
      this.artObjectRuntime = global.PartyGameArtObject || null;
      this.rootArtRenderer = this.createArtTreeRenderer(this.artObjectsElement);
      this.componentChildRenderers = new Map();
      this.voterArtRenderer = null;
      this.currentVisibleVoters = [];
      this.voteRevealKey = "";
      this.voteRevealBadgeCount = 0;
      this.voteRevealTimers = [];
      this.visibleVoteCount = 0;
      this.groupVisual = this.createVisual(this.element, {
        hiddenClasses: ["voting-card-group-hidden"],
        motionHiddenClasses: ["voting-card-group-hidden"],
        exitingClass: "voting-card-group-exiting",
        updateClass: "voting-card-update",
        instantClass: "voting-card-instant"
      }, "group");
      this.authorVisual = this.createVisual(this.authorElement, {
        hiddenClasses: ["voting-card-widget-hidden"],
        motionHiddenClasses: ["voting-card-widget-hidden"],
        instantClass: "voting-card-widget-instant"
      }, "author");
      this.votersVisual = this.createVisual(this.votersElement, {
        hiddenClasses: ["voting-card-widget-hidden"],
        motionHiddenClasses: ["voting-card-widget-hidden"],
        instantClass: "voting-card-widget-instant"
      }, "voters");
      this.voteCountVisual = this.createVisual(this.voteBadgeElement, {
        hiddenClasses: ["voting-card-widget-hidden"],
        motionHiddenClasses: ["voting-card-widget-hidden"],
        instantClass: "voting-card-widget-instant",
        updateClass: "voting-card-update"
      }, "vote-count");
    }

    createVisual(element, options = {}, key = "") {
      if (!element) return null;
      const id = `voting-card:${this.cardId || this.element?.dataset.cardId || "card"}:${key || element.dataset.voterId || element.className || "visual"}`;
      const bridge = global.PartyGameVisualBridge?.createVisualForTarget?.({
        gameObjectApi: this.gameObjectApi,
        visualAnimation: this.visualAnimation,
        target: element,
        gameObject: this.visualGameObjects.get(element),
        legacyVisual: this.visualFallbacks.get(element),
        gameObjectOptions: {
          id,
          visibilityKey: id,
          isArt: true,
          isDynamic: true,
          visualOptions: {
            ...options,
            layoutHiddenClasses: [
              ...(Array.isArray(options.hiddenClasses) ? options.hiddenClasses : [options.hiddenClasses]).filter(Boolean),
              ...(options.exitingClass ? [options.exitingClass] : [])
            ]
          }
        },
        legacyVisualOptions: options
      });
      if (bridge?.gameObject) this.visualGameObjects.set(element, bridge.gameObject);
      if (bridge?.legacyVisual) this.visualFallbacks.set(element, bridge.legacyVisual);
      return bridge?.visual || null;
    }

    createArtTreeRenderer(host) {
      if (!this.artObjectRuntime || !host) return null;
      const hostKey = host.dataset?.artChildHostFor || host.className || "root";
      return new this.artObjectRuntime.ArtObjectTreeRenderer({
        host,
        document: this.document,
        instanceId: `voting-card:${this.cardId}:${hostKey}`,
        gameObjectApi: this.gameObjectApi,
        visualAnimation: this.visualAnimation
      });
    }

    sync(cardData, options = {}) {
      this.element.dataset.cardIndex = String(cardData.index ?? "");
      this.answerText = cardData.text || "";
      this.cardElement.classList.toggle("is-winner", cardData.isWinner === true);
      this.cardElement.classList.toggle("is-loser", cardData.isLoser === true);
      this.syncAuthor(cardData);
      this.applyComposition();
      this.syncVoters(cardData, options);
      this.groupVisual.play("on");
    }

    composition() {
      return (typeof this.getComposition === "function" ? this.getComposition() : null) || FALLBACK_VOTING_CARD_COMPOSITION;
    }

    component(componentId, fallbackId = "") {
      const components = this.composition()?.components || [];
      return components.find((item) => item.id === componentId) || (fallbackId ? components.find((item) => item.id === fallbackId) : null) || null;
    }

    rootArtComponents() {
      return (this.composition()?.components || []).filter((component) => !KNOWN_COMPONENT_IDS.has(component.id));
    }

    applyComponentLayout(element, component, canvas, textOverride = undefined) {
      if (!element || !component) return;
      const canvasWidth = Math.max(1, Number(canvas?.width || 1));
      const canvasHeight = Math.max(1, Number(canvas?.height || 1));
      element.style.left = `${Number(component.x || 0) / canvasWidth * 100}%`;
      element.style.top = `${Number(component.y || 0) / canvasHeight * 100}%`;
      element.style.width = `${Number(component.width || 1) / canvasWidth * 100}%`;
      element.style.height = `${Number(component.height || 1) / canvasHeight * 100}%`;
      element.style.setProperty("--component-scale", Number(component.scale || 1));
      element.style.setProperty("--component-rotation", `${Number(component.rotation || 0)}deg`);
      const labelText = arguments.length >= 4 ? String(textOverride ?? "") : String(component.defaultText || component.name || "");
      const fontSize = global.PartyGameArtObject?.componentFontSize?.(component, labelText) || Number(component.fontSize || 16);
      element.style.setProperty("--component-font-size", `${fontSize}px`);
      element.style.setProperty("--component-text-color", component.fontColor || "#17131f");
      element.style.setProperty("--component-fill-color", component.fillColor || "transparent");
      element.style.setProperty("--component-border-color", component.borderColor || "transparent");
      element.style.setProperty("--component-border-width", `${Number(component.borderWidth || 0)}px`);
      element.style.setProperty("--component-border-radius", `${Number(component.borderRadius || 0)}px`);
    }

    applyComposition() {
      const composition = this.composition();
      if (!composition) return;
      const canvas = composition.canvas || { width: 560, height: 230 };
      this.element.style.width = `${Number(canvas.width || 560)}px`;
      this.element.style.height = `${Number(canvas.height || 230)}px`;
      this.applyComponentLayout(this.cardElement, this.component("current-card"), canvas);
      this.applyComponentLayout(this.answerElement, this.component("answer-text"), canvas, this.answerText);
      this.renderComponentText(this.answerElement, this.component("answer-text"), this.answerText);
      this.applyComponentLayout(this.authorElement, this.component("author-heading"), canvas, this.authorText);
      this.renderComponentText(this.authorElement, this.component("author-heading"), this.authorText);
      this.applyComponentLayout(this.votersElement, this.component("voter-container"), canvas);
      this.applyComponentLayout(this.voteBadgeElement, this.component("vote-count", "vote-widget"), canvas, this.voteCountText);
      this.renderComponentText(this.voteBadgeElement, this.component("vote-count", "vote-widget"), this.voteCountText);
      this.renderRootArtObjects(canvas);
      this.renderComponentChildren("current-card", this.cardElement);
      this.renderComponentChildren("answer-text", this.answerElement);
      this.renderComponentChildren("author-heading", this.authorElement);
      this.renderComponentChildren("vote-count", this.voteBadgeElement);
      this.renderVoterArt(this.currentVisibleVoters, { instant: true, syncCount: false });
    }

    ensureChildHost(parentElement, componentId) {
      if (!parentElement || !componentId) return null;
      let host = parentElement.querySelector(`:scope > .voting-card-component-children[data-component-id="${componentId}"]`);
      if (!host) {
        host = this.document.createElement("div");
        host.className = "voting-card-component-children";
        host.dataset.componentId = componentId;
        parentElement.appendChild(host);
      }
      return host;
    }

    ensureVoterArtHost() {
      let host = this.votersElement.querySelector(":scope > .voting-card-voter-art-host");
      if (!host) {
        host = this.document.createElement("div");
        host.className = "voting-card-voter-art-host";
        this.votersElement.appendChild(host);
      }
      return host;
    }

    renderRootArtObjects(canvas) {
      this.rootArtRenderer?.render(this.rootArtComponents(), canvas, { defaultAnimation: "on" });
    }

    renderComponentChildren(componentId, parentElement) {
      const component = this.component(componentId);
      if (!component?.children?.length) {
        const renderer = this.componentChildRenderers.get(componentId);
        if (renderer) renderer.clear({ instant: true });
        return;
      }
      const host = this.ensureChildHost(parentElement, componentId);
      if (!host) return;
      let renderer = this.componentChildRenderers.get(componentId);
      if (!renderer || renderer.host !== host) {
        renderer = this.createArtTreeRenderer(host);
        if (!renderer) return;
        this.componentChildRenderers.set(componentId, renderer);
      }
      renderer.render(component.children || [], {
        width: Number(component.width || 1),
        height: Number(component.height || 1)
      }, { defaultAnimation: "on" });
    }

    syncAuthor(cardData) {
      this.authorText = cardData.authorName || "";
      if (cardData.authorsRevealed === true) {
        this.authorVisual.play("appear");
      } else {
        this.authorVisual.play("park", { instant: true });
      }
    }

    clearVoteRevealTimers() {
      for (const timerId of this.voteRevealTimers) global.clearTimeout(timerId);
      this.voteRevealTimers = [];
    }

    syncVoteCount(visibleVoteCount) {
      const count = Math.max(0, Math.floor(Number(visibleVoteCount || 0)));
      const wasVisible = this.voteCountVisual?.isVisible?.() === true;
      this.visibleVoteCount = count;
      this.voteCountText = count > 0 ? String(count) : "";
      this.renderComponentText(this.voteBadgeElement, this.component("vote-count", "vote-widget"), this.voteCountText);
      this.renderComponentChildren("vote-count", this.voteBadgeElement);
      if (count > 0) {
        this.voteCountVisual?.play(wasVisible ? "update" : "appear");
      } else {
        this.voteCountVisual?.play("park", { instant: true });
      }
    }

    voterArtRoot(voters = []) {
      const container = this.component("voter-container");
      const widget = this.component("vote-widget");
      if (!container || !widget) return null;
      const width = Math.max(1, Number(container.width || 1));
      const height = Math.max(1, Number(container.height || 1));
      const children = voters.map((voter, index) => {
        const voterId = safeComponentId(voter?.id, `voter-${index}`);
        const clone = cloneComponentTree(widget);
        clone.id = `vote-widget-${voterId}`;
        clone.name = voter?.name ? `Vote Widget ${voter.name}` : `Vote Widget ${index + 1}`;
        clone.defaultText = voter?.name || "Player";
        clone.x = width / 2;
        clone.y = height / 2;
        clone.defaultAnimationState = "appear";
        return clone;
      });
      const distribution = container.childDistribution === "vertical" ? "vertical" : "horizontal";
      return {
        ...cloneComponentTree(container),
        id: "voter-container-runtime",
        name: "Runtime Voter Container",
        x: width / 2,
        y: height / 2,
        width,
        height,
        scale: 1,
        rotation: 0,
        fillColor: "transparent",
        borderColor: "transparent",
        borderWidth: 0,
        borderRadius: 0,
        childDistribution: distribution,
        children
      };
    }

    renderVoterArt(voters = [], options = {}) {
      this.currentVisibleVoters = Array.isArray(voters) ? voters : [];
      const host = this.ensureVoterArtHost();
      if (!host) return;
      if (!this.voterArtRenderer || this.voterArtRenderer.host !== host) {
        this.voterArtRenderer = this.createArtTreeRenderer(host);
      }
      const container = this.component("voter-container");
      const root = this.voterArtRoot(this.currentVisibleVoters);
      if (!this.voterArtRenderer || !container || !root) {
        this.syncVoteCount(0);
        return;
      }
      this.voterArtRenderer.render([root], {
        width: Math.max(1, Number(container.width || 1)),
        height: Math.max(1, Number(container.height || 1))
      }, {
        defaultAnimation: "appear",
        instant: options.instant === true
      });
      if (options.syncCount !== false) this.syncVoteCount(this.currentVisibleVoters.length);
    }

    syncVoters(cardData, options = {}) {
      const voters = cardData.votesRevealed === true ? (cardData.voters || []) : [];
      if (cardData.votesRevealed === true) {
        this.votersVisual.play("on");
        this.scheduleVoteReveal(voters, options);
      } else {
        this.clearVoteRevealTimers();
        this.voteRevealKey = "";
        this.voteRevealBadgeCount = 0;
        this.renderVoterArt([], { instant: true });
        this.voterArtRenderer?.clear({ instant: true });
        this.syncVoteCount(0);
        this.votersVisual.play("park", { instant: true });
      }
    }

    scheduleVoteReveal(voters, options = {}) {
      const revealKey = options.voteRevealKey || "instant";
      const staggerMs = Math.max(0, Number(options.voteRevealStaggerMs || 0));
      const voterKey = `${revealKey}:${voters.map((voter, index) => voter?.id || `voter-${index}`).join("|")}`;
      if (voterKey === this.voteRevealKey && voters.length === this.voteRevealBadgeCount) return;
      this.clearVoteRevealTimers();
      this.voteRevealKey = voterKey;
      this.voteRevealBadgeCount = voters.length;
      this.renderVoterArt([], { instant: true });
      if (!voters.length) return;
      voters.forEach((voter, index) => {
        const visibleVoteCount = index + 1;
        const delayMs = staggerMs > 0 ? visibleVoteCount * staggerMs : 0;
        if (delayMs === 0) {
          this.renderVoterArt(voters.slice(0, visibleVoteCount), { instant: options.instant === true });
          return;
        }
        const timerId = global.setTimeout(() => {
          if (this.voteRevealKey !== voterKey) return;
          this.renderVoterArt(voters.slice(0, visibleVoteCount), { instant: false });
        }, delayMs);
        this.voteRevealTimers.push(timerId);
      });
    }

    renderComponentText(target, component, textOverride = "") {
      if (!target || !component) return;
      const hasTextOverride = arguments.length >= 3;
      const text = hasTextOverride ? String(textOverride ?? "") : String(component.defaultText || component.name || "");
      global.PartyGameArtObject?.renderComponentText?.(target, component, text);
    }

    remove(options = {}) {
      this.clearVoteRevealTimers();
      this.rootArtRenderer?.clear({ instant: options.instant === true });
      this.voterArtRenderer?.clear({ instant: options.instant === true });
      for (const renderer of this.componentChildRenderers.values()) {
        renderer.clear({ instant: options.instant === true });
      }
      this.componentChildRenderers.clear();
      const duration = this.groupVisual.play(options.instant ? "park" : "disappear", { instant: options.instant === true });
      const element = this.element;
      const token = element.dataset.visualAnimationToken || "";
      const removeElement = () => {
        if (element.parentElement && element.dataset.visualAnimationToken === token) element.remove();
      };
      if (duration > 0) global.setTimeout(removeElement, duration);
      else removeElement();
      return duration;
    }
  }

  class VotingCardRenderer {
    constructor(options) {
      this.layer = options.layer;
      this.document = options.document || global.document;
      this.visualAnimation = options.visualAnimation;
      this.avatarClass = options.avatarClass;
      this.avatarFrameImage = options.avatarFrameImage;
      this.dinoIcon = options.dinoIcon;
      this.playerAvatarArt = options.playerAvatarArt;
      this.getComposition = options.getComposition;
      this.gameObjectApi = options.gameObjectApi || global.PartyGameGameObject || global.PartyGameStageGameObject;
      this.cards = new Map();
      this.hideLayerTimer = null;
    }

    render(cards = [], options = {}) {
      if (!this.layer) return;
      const list = Array.isArray(cards) ? cards : [];
      if (list.length) this.showLayer();
      const desiredIds = new Set(list.map((card) => card.id));
      for (const cardData of list) {
        let view = this.cards.get(cardData.id);
        if (!view) {
          view = new VotingCardView({
            document: this.document,
            visualAnimation: this.visualAnimation,
            avatarClass: this.avatarClass,
            avatarFrameImage: this.avatarFrameImage,
            dinoIcon: this.dinoIcon,
            playerAvatarArt: this.playerAvatarArt,
            getComposition: this.getComposition,
            gameObjectApi: this.gameObjectApi,
            cardId: cardData.id
          });
          this.cards.set(cardData.id, view);
          this.layer.appendChild(view.element);
        }
        view.sync(cardData, options);
      }
      let removalDuration = 0;
      for (const [cardId, view] of Array.from(this.cards.entries())) {
        if (desiredIds.has(cardId)) continue;
        this.cards.delete(cardId);
        removalDuration = Math.max(removalDuration, view.remove());
      }
      if (!list.length && !this.cards.size) {
        this.scheduleLayerHide(removalDuration);
      }
    }

    clear(options = {}) {
      let removalDuration = 0;
      for (const [, view] of Array.from(this.cards.entries())) {
        removalDuration = Math.max(removalDuration, view.remove({ instant: options.instant !== false }));
      }
      this.cards.clear();
      this.scheduleLayerHide(removalDuration);
    }

    showLayer() {
      global.clearTimeout(this.hideLayerTimer);
      this.hideLayerTimer = null;
      this.layer.classList.remove("hidden");
    }

    scheduleLayerHide(delay = 0) {
      global.clearTimeout(this.hideLayerTimer);
      if (!this.layer) return;
      if (delay > 0) {
        this.hideLayerTimer = global.setTimeout(() => {
          if (!this.cards.size) this.layer.classList.add("hidden");
        }, delay);
        return;
      }
      this.layer.classList.add("hidden");
    }
  }

  global.PartyGameVotingCardVisuals = {
    createRenderer: (options) => new VotingCardRenderer(options)
  };
})(window);
