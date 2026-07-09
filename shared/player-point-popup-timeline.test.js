"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const player_point_popup_timeline_1 = require("./player-point-popup-timeline");
(0, vitest_1.describe)("defaultPlayerPointPopupTimeline", () => {
    (0, vitest_1.it)("defines a complete point popup appear timeline for editable prefab art", () => {
        const timeline = (0, player_point_popup_timeline_1.defaultPlayerPointPopupTimeline)();
        (0, vitest_1.expect)(timeline.labels.map((label) => label.name)).toEqual(["park", "off", "on", "appear", "update", "disappear"]);
        (0, vitest_1.expect)(timeline.commands).toContainEqual({ frame: 45, type: "stop" });
        (0, vitest_1.expect)(timeline.tracks.map((track) => track.targetId)).toEqual(["point-text", "point-shadow"]);
        (0, vitest_1.expect)(timeline.tracks[0].keyframes[0]).toMatchObject({ frame: 0, props: { opacity: 0, scale: 0 } });
        (0, vitest_1.expect)(timeline.tracks[0].keyframes[timeline.tracks[0].keyframes.length - 1]).toMatchObject({
            frame: 45,
            props: { opacity: 0, scale: 0 }
        });
    });
});
