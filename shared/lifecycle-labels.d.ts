export declare const lifecycleLabels: Readonly<{
    readonly park: "Park";
    readonly on: "On";
    readonly off: "Off";
    readonly appear: "Appear";
    readonly update: "Update";
    readonly disappear: "Disappear";
}>;
export type LifecycleLabel = (typeof lifecycleLabels)[keyof typeof lifecycleLabels];
export declare function canonicalLifecycleLabel(value: unknown): LifecycleLabel | null;
export declare function normalizeLifecycleLabel(value: unknown): string;
export declare function lifecycleLabelsMatch(left: unknown, right: unknown): boolean;
export declare function uniqueTimelineLabelMatch<T extends {
    name: string;
}>(labels: T[], requested: unknown): T | null;
export declare const PartyGameLifecycleLabels: {
    lifecycleLabels: Readonly<{
        readonly park: "Park";
        readonly on: "On";
        readonly off: "Off";
        readonly appear: "Appear";
        readonly update: "Update";
        readonly disappear: "Disappear";
    }>;
    canonicalLifecycleLabel: typeof canonicalLifecycleLabel;
    normalizeLifecycleLabel: typeof normalizeLifecycleLabel;
    lifecycleLabelsMatch: typeof lifecycleLabelsMatch;
    uniqueTimelineLabelMatch: typeof uniqueTimelineLabelMatch;
};
