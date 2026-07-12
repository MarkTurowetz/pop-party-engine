import type { TimelineDocument } from "./timeline-model";

export function defaultPlayerPointPopupTimeline(): TimelineDocument {
  const popupFrames = { start: 1, pop: 5, hold: 22, end: 45 };
  const trackFor = (targetId: string, baseX: number, baseY: number) => ({
    targetId,
    keyframes: [
      { frame: 0, props: { opacity: 1, scale: 0, x: baseX, y: baseY + 16 }, easing: "hold" },
      { frame: popupFrames.start, props: { opacity: 0, scale: 0, x: baseX, y: baseY + 16 }, easing: "easeOut" },
      { frame: popupFrames.pop, props: { opacity: 1, scale: 1.2, x: baseX, y: baseY }, easing: "easeOut" },
      { frame: popupFrames.hold, props: { opacity: 1, scale: 1, x: baseX, y: baseY - 8 }, easing: "easeInOut" },
      { frame: popupFrames.end, props: { opacity: 0, scale: 0, x: baseX, y: baseY - 26 }, easing: "easeIn" }
    ]
  });
  return {
    fps: 30,
    frameCount: popupFrames.end + 1,
    labels: [
      { name: "Park", frame: 0 },
      { name: "Off", frame: 0 },
      { name: "On", frame: 0 },
      { name: "Appear", frame: popupFrames.start },
      { name: "Update", frame: popupFrames.start },
      { name: "Disappear", frame: popupFrames.end }
    ],
    commands: [
      { frame: 0, type: "stop" },
      { frame: 0, type: "setVisible", target: "false" },
      { frame: popupFrames.end, type: "stop" }
    ],
    tracks: [trackFor("point-text", 75, 30), trackFor("point-shadow", 79, 34)]
  };
}
