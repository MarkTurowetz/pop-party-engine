export declare const ART_TIMELINE_ARCHITECTURE_VERSION = 2;
export interface ArtArchitectureComponent {
    id: string;
    name?: string;
    instanceLabel?: string;
    kind?: string;
    artCompositionId?: string;
    timeline?: unknown;
    children?: ArtArchitectureComponent[];
    [key: string]: unknown;
}
export interface ArtArchitectureComposition {
    id: string;
    name?: string;
    timelineArchitectureVersion?: number;
    timeline?: unknown;
    components?: ArtArchitectureComponent[];
    [key: string]: unknown;
}
export interface ArtArchitectureIssue {
    compositionId: string;
    code: string;
    message: string;
}
export interface ArtArchitectureMigrationResult<T> {
    compositions: T[];
    migratedCompositionIds: string[];
    issues: ArtArchitectureIssue[];
    removedTrackCount: number;
    removedKeyframeCount: number;
    removedComponentTimelineCount: number;
}
export declare function validArtInstanceLabel(value: unknown): boolean;
export declare function suggestedArtInstanceLabel(value: unknown, fallback?: string): string;
export declare function assignUniqueArtInstanceLabels(components: ArtArchitectureComponent[] | undefined): void;
export declare function collectArtArchitectureIssues(compositions: ArtArchitectureComposition[]): ArtArchitectureIssue[];
export declare function migrateArtTimelineArchitecture<T extends ArtArchitectureComposition>(source: T[]): ArtArchitectureMigrationResult<T>;
