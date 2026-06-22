(function attachPartyGameVotingCardVisuals(global) {
  function createVotingCardElement(documentRef, cardId) {
    const group = documentRef.createElement("article");
    group.className = "voting-card-group voting-card-group-hidden";
    group.dataset.cardId = cardId;
    group.innerHTML = `
      <div class="voting-card-author voting-card-widget-hidden"></div>
      <div class="voting-card">
        <div class="voting-card-answer"></div>
        <div class="voting-card-votes hidden"></div>
      </div>
      <div class="voting-card-voters voting-card-widget-hidden"></div>
    `;
    return group;
  }

  function createVoterBadge(documentRef) {
    const badge = documentRef.createElement("span");
    badge.className = "voting-card-voter-badge voting-card-vote-hidden";
    badge.innerHTML = `
      <span class="voting-card-voter-avatar"></span>
      <span class="voting-card-voter-name"></span>
    `;
    return badge;
  }

  class VotingCardView {
    constructor(options) {
      this.document = options.document;
      this.visualAnimation = options.visualAnimation;
      this.avatarClass = options.avatarClass;
      this.avatarFrameImage = options.avatarFrameImage;
      this.dinoIcon = options.dinoIcon;
      this.element = createVotingCardElement(this.document, options.cardId);
      this.authorElement = this.element.querySelector(".voting-card-author");
      this.cardElement = this.element.querySelector(".voting-card");
      this.answerElement = this.element.querySelector(".voting-card-answer");
      this.voteBadgeElement = this.element.querySelector(".voting-card-votes");
      this.votersElement = this.element.querySelector(".voting-card-voters");
      this.groupVisual = this.createVisual(this.element, {
        hiddenClasses: ["voting-card-group-hidden"],
        motionHiddenClasses: ["voting-card-group-hidden"],
        exitingClass: "voting-card-group-exiting",
        updateClass: "voting-card-update",
        instantClass: "voting-card-instant"
      });
      this.authorVisual = this.createVisual(this.authorElement, {
        hiddenClasses: ["voting-card-widget-hidden"],
        motionHiddenClasses: ["voting-card-widget-hidden"],
        instantClass: "voting-card-widget-instant"
      });
      this.votersVisual = this.createVisual(this.votersElement, {
        hiddenClasses: ["voting-card-widget-hidden"],
        motionHiddenClasses: ["voting-card-widget-hidden"],
        instantClass: "voting-card-widget-instant"
      });
    }

    createVisual(element, options) {
      return this.visualAnimation.createCssVisualObject({
        element,
        ...options
      });
    }

    sync(cardData) {
      this.element.dataset.cardIndex = String(cardData.index ?? "");
      this.answerElement.textContent = cardData.text || "";
      this.cardElement.classList.toggle("is-winner", cardData.isWinner === true);
      this.cardElement.classList.toggle("is-loser", cardData.isLoser === true);
      this.syncAuthor(cardData);
      this.syncVoteCount(cardData);
      this.syncVoters(cardData);
      this.groupVisual.play("on");
    }

    syncAuthor(cardData) {
      this.authorElement.textContent = cardData.authorName || "";
      if (cardData.authorsRevealed === true) {
        this.authorVisual.play("appear");
      } else {
        this.authorVisual.play("park", { instant: true });
      }
    }

    syncVoteCount(cardData) {
      const voteCount = Number(cardData.voteCount || 0);
      this.voteBadgeElement.classList.toggle("hidden", cardData.votesRevealed !== true);
      this.voteBadgeElement.textContent = `${voteCount} vote${voteCount === 1 ? "" : "s"}`;
    }

    syncVoters(cardData) {
      const voters = cardData.votesRevealed === true ? (cardData.voters || []) : [];
      const desiredIds = new Set(voters.map((voter, index) => voter.id || `voter-${index}`));
      const existing = new Map(Array.from(this.votersElement.querySelectorAll(".voting-card-voter-badge")).map((badge) => [badge.dataset.voterId, badge]));
      let cursor = this.votersElement.firstElementChild;
      voters.forEach((voter, index) => {
        const voterId = voter.id || `voter-${index}`;
        let badge = existing.get(voterId);
        if (!badge) {
          badge = createVoterBadge(this.document);
          badge.dataset.voterId = voterId;
        }
        this.updateVoterBadge(badge, voter, index);
        if (badge === cursor) {
          cursor = cursor.nextElementSibling;
        } else {
          this.votersElement.insertBefore(badge, cursor);
        }
        this.createVisual(badge, {
          hiddenClasses: ["voting-card-vote-hidden"],
          motionHiddenClasses: ["voting-card-vote-hidden"],
          instantClass: "voting-card-vote-instant"
        }).play("on");
      });
      for (const badge of Array.from(this.votersElement.querySelectorAll(".voting-card-voter-badge"))) {
        if (!desiredIds.has(badge.dataset.voterId || "")) badge.remove();
      }
      if (cardData.votesRevealed === true) {
        this.votersVisual.play("on");
      } else {
        this.votersVisual.play("park", { instant: true });
      }
    }

    updateVoterBadge(badge, voter, index) {
      badge.style.transitionDelay = `${index * 80}ms`;
      const avatarElement = badge.querySelector(".voting-card-voter-avatar");
      avatarElement.className = `voting-card-voter-avatar ${this.avatarClass(voter.avatar?.shape)}`;
      avatarElement.style.setProperty("--avatar-color", voter.avatar?.color || "#22d3ee");
      avatarElement.innerHTML = `${this.avatarFrameImage()}${this.dinoIcon(voter.avatar?.shape)}`;
      badge.querySelector(".voting-card-voter-name").textContent = voter.name || "Player";
    }

    remove(options = {}) {
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
      this.cards = new Map();
      this.hideLayerTimer = null;
    }

    render(cards = []) {
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
            cardId: cardData.id
          });
          this.cards.set(cardData.id, view);
          this.layer.appendChild(view.element);
        }
        view.sync(cardData);
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
