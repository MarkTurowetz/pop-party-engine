import { describe, expect, it, vi } from "vitest";
import { createSessionDraftPublisher } from "./sessionDraftPublisher";

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
});
