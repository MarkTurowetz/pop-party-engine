import { describe, expect, it, vi } from "vitest";
import {
  checkpointSessionDraftPublishers,
  createSessionDraftPublisher,
  republishAllSessionDraftPublishers
} from "./sessionDraftPublisher";

describe("createSessionDraftPublisher", () => {
  it("debounces draft publishes and clears when returning to the saved snapshot", async () => {
    vi.useFakeTimers();
    try {
      const postDraft = vi.fn(async (message) => message);
      const onCleared = vi.fn();
      const onPublished = vi.fn();
      const publisher = createSessionDraftPublisher({
        postDraft,
        savedSnapshot: "saved",
        delayMs: 10,
        clearMessage: { clearFlow: true },
        draftMessage: (snapshot) => ({ flow: snapshot }),
        onCleared,
        onPublished
      });

      publisher.schedule("draft-a");
      publisher.schedule("draft-b");
      await vi.advanceTimersByTimeAsync(10);

      expect(postDraft).toHaveBeenCalledTimes(1);
      expect(postDraft).toHaveBeenCalledWith({ flow: "draft-b" });
      expect(onPublished).toHaveBeenCalledTimes(1);

      publisher.schedule("saved");
      await vi.advanceTimersByTimeAsync(10);

      expect(postDraft).toHaveBeenLastCalledWith({ clearFlow: true });
      expect(onCleared).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels pending publishes when a snapshot is marked saved", async () => {
    vi.useFakeTimers();
    try {
      const postDraft = vi.fn(async (message) => message);
      const publisher = createSessionDraftPublisher({
        postDraft,
        savedSnapshot: "saved",
        delayMs: 10,
        clearMessage: { clearFlow: true },
        draftMessage: (snapshot) => ({ flow: snapshot })
      });

      publisher.schedule("draft");
      publisher.markSaved("draft");
      await vi.advanceTimersByTimeAsync(10);

      expect(postDraft).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("republishes the current dirty snapshot after a server-side session reset", async () => {
    const postDraft = vi.fn(async (message) => message);
    const publisher = createSessionDraftPublisher({
      postDraft,
      savedSnapshot: "saved",
      delayMs: 0,
      clearMessage: { clearFlow: true },
      draftMessage: (snapshot) => ({ flow: snapshot })
    });

    try {
      await publisher.publish("dirty");
      postDraft.mockClear();

      await republishAllSessionDraftPublishers();

      expect(postDraft).toHaveBeenCalledTimes(1);
      expect(postDraft).toHaveBeenCalledWith({ flow: "dirty" });
    } finally {
      publisher.dispose();
    }
  });

  it("republishes clean browser models after the server loses session drafts", async () => {
    const postDraft = vi.fn(async (message) => message);
    const publisher = createSessionDraftPublisher({
      postDraft,
      savedSnapshot: "saved",
      delayMs: 0,
      clearMessage: { clearFlow: true },
      draftMessage: (snapshot) => ({ flow: snapshot })
    });

    try {
      await republishAllSessionDraftPublishers();
      expect(postDraft).toHaveBeenCalledOnce();
      expect(postDraft).toHaveBeenCalledWith({ flow: "saved" });
    } finally {
      publisher.dispose();
    }
  });

  it("flushes a pending edit once before checkpointing without forcing a republish", async () => {
    const postDraft = vi.fn(async (message) => message);
    const checkpoint = vi.fn(async () => ({ saved: true }));
    const publisher = createSessionDraftPublisher({
      postDraft,
      savedSnapshot: "saved",
      delayMs: 60_000,
      clearMessage: { clearFlow: true },
      draftMessage: (snapshot) => ({ flow: snapshot })
    });

    try {
      publisher.schedule("dirty");

      await expect(checkpointSessionDraftPublishers(checkpoint))
        .resolves.toEqual({ saved: true });

      expect(postDraft).toHaveBeenCalledTimes(1);
      expect(postDraft).toHaveBeenCalledWith({ flow: "dirty" });
      expect(checkpoint).toHaveBeenCalledTimes(1);
    } finally {
      publisher.dispose();
    }
  });

  it("does not republish an already-published edit during a normal checkpoint", async () => {
    const postDraft = vi.fn(async (message) => message);
    const checkpoint = vi.fn(async () => ({ saved: true }));
    const publisher = createSessionDraftPublisher({
      postDraft,
      savedSnapshot: "saved",
      delayMs: 0,
      clearMessage: { clearFlow: true },
      draftMessage: (snapshot) => ({ flow: snapshot })
    });

    try {
      await publisher.publish("dirty");
      postDraft.mockClear();

      await checkpointSessionDraftPublishers(checkpoint);

      expect(postDraft).not.toHaveBeenCalled();
      expect(checkpoint).toHaveBeenCalledTimes(1);
    } finally {
      publisher.dispose();
    }
  });

  it("republishes dirty snapshots and retries after explicit server recovery", async () => {
    const postDraft = vi.fn(async (message) => message);
    const recoveryError = Object.assign(new Error("Recovery required"), {
      payload: { errorCode: "AUTHORING_SESSION_RECOVERY_REQUIRED" }
    });
    const checkpoint = vi.fn()
      .mockRejectedValueOnce(recoveryError)
      .mockResolvedValueOnce({ saved: true });
    const publisher = createSessionDraftPublisher({
      postDraft,
      savedSnapshot: "saved",
      delayMs: 0,
      clearMessage: { clearFlow: true },
      draftMessage: (snapshot) => ({ flow: snapshot })
    });

    try {
      await publisher.publish("dirty");
      postDraft.mockClear();

      await expect(checkpointSessionDraftPublishers(checkpoint))
        .resolves.toEqual({ saved: true });

      expect(postDraft).toHaveBeenCalledTimes(1);
      expect(postDraft).toHaveBeenCalledWith({ flow: "dirty" });
      expect(checkpoint).toHaveBeenCalledTimes(2);
    } finally {
      publisher.dispose();
    }
  });

  it("does not republish or retry unrelated checkpoint errors", async () => {
    const postDraft = vi.fn(async (message) => message);
    const failure = new Error("Live prototype authoring is not enabled");
    const checkpoint = vi.fn(async () => {
      throw failure;
    });
    const publisher = createSessionDraftPublisher({
      postDraft,
      savedSnapshot: "saved",
      delayMs: 0,
      clearMessage: { clearFlow: true },
      draftMessage: (snapshot) => ({ flow: snapshot })
    });

    try {
      await publisher.publish("dirty");
      postDraft.mockClear();

      await expect(checkpointSessionDraftPublishers(checkpoint)).rejects.toBe(failure);

      expect(postDraft).not.toHaveBeenCalled();
      expect(checkpoint).toHaveBeenCalledTimes(1);
    } finally {
      publisher.dispose();
    }
  });
});
