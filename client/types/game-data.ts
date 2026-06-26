export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: unknown };

export type StorageKind = "local" | "github" | string;

export interface ToolStorageStatus {
  kind: StorageKind;
  durable: boolean;
  error: string;
  repo: string;
  branch: string;
  path: string;
}

export interface FlowTiming {
  mode?: string;
  seconds?: number;
}

export interface FlowAction extends JsonObject {
  id: string;
  name?: string;
  type: string;
  timing?: FlowTiming;
}

export interface FlowState extends JsonObject {
  id: string;
  name?: string;
  actions: FlowAction[];
}

export interface GameFlow extends JsonObject {
  states: FlowState[];
}

export interface LayoutElement extends JsonObject {
  id: string;
  name?: string;
  kind?: string;
  selector?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  scale?: number;
  rotation?: number;
  defaultText?: string;
}

export interface LayoutState extends JsonObject {
  id: string;
  name?: string;
  elements: LayoutElement[];
}

export interface StageLayoutCollection extends JsonObject {
  canvas: {
    width: number;
    height: number;
  };
  global: LayoutState;
  states: LayoutState[];
}

export type ControllerLayoutCollection = StageLayoutCollection;

export interface GameConstants extends JsonObject {
  playerColors?: string[];
  customConstants?: JsonObject[];
}

export interface HostAudioLine extends JsonObject {
  id: string;
  text: string;
  url: string;
}

export interface HostAudioSet extends JsonObject {
  id: string;
  name: string;
  lines: HostAudioLine[];
}

export interface HostAudios extends JsonObject {
  hostAudios: HostAudioSet[];
}

export interface ArtAsset extends JsonObject {
  id: string;
  name: string;
  category?: string;
  currentUrl: string;
  defaultUrl: string;
  hasCustom: boolean;
}

export interface ArtComponent extends JsonObject {
  id: string;
  name?: string;
  kind: string;
  children?: ArtComponent[];
}

export interface ArtComposition extends JsonObject {
  id: string;
  name: string;
  description?: string;
  surface: "stage" | "controller" | string;
  canvas: {
    width: number;
    height: number;
  };
  components: ArtComponent[];
}

export interface GameFlowResponse {
  ok: true;
  flow: GameFlow;
  savedFlow: GameFlow;
  runtimeFlow: GameFlow;
  hasLocalDraft: boolean;
  storage: ToolStorageStatus;
  availableActionTypes: JsonObject[];
  availableTransitions: JsonObject[];
}

export interface LayoutResponse<TLayout extends StageLayoutCollection = StageLayoutCollection> {
  ok: true;
  layouts: TLayout;
  savedLayouts: TLayout;
  hasLocalDraft: boolean;
  storage: ToolStorageStatus;
}

export interface GameConstantsResponse {
  ok: true;
  constants: GameConstants;
  savedConstants: GameConstants;
  hasLocalDraft: boolean;
  storage: ToolStorageStatus;
}

export interface HostAudiosResponse {
  ok: true;
  hostAudios: HostAudios;
  savedHostAudios: HostAudios;
  hasLocalDraft: boolean;
  storage: ToolStorageStatus;
}

export interface ArtAssetsResponse {
  ok: true;
  groups: JsonObject[];
  assets: ArtAsset[];
  compositions: ArtComposition[];
}

export interface HealthResponse {
  ok: true;
  rooms: number;
}
