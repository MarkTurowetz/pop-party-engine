import type {
  ArtAssetsResponse,
  GameConstantsResponse,
  GameConstantsSaveResponse,
  GameFlowResponse,
  GameFlowSaveResponse,
  HealthResponse,
  HostAudiosResponse,
  HostAudiosSaveResponse,
  LayoutResponse,
  LayoutSaveResponse
} from "../types/game-data";
import { collectFlowValidationIssues } from "../tools/flow/flowValidation";

export class ApiValidationError extends Error {
  readonly endpoint: string;

  constructor(endpoint: string, message: string) {
    super(`${endpoint}: ${message}`);
    this.name = "ApiValidationError";
    this.endpoint = endpoint;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertRecord(value: unknown, endpoint: string, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ApiValidationError(endpoint, `${label} must be an object`);
  return value;
}

function assertArray(value: unknown, endpoint: string, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ApiValidationError(endpoint, `${label} must be an array`);
  return value;
}

function assertString(value: unknown, endpoint: string, label: string): string {
  if (typeof value !== "string") throw new ApiValidationError(endpoint, `${label} must be a string`);
  return value;
}

function assertBoolean(value: unknown, endpoint: string, label: string): boolean {
  if (typeof value !== "boolean") throw new ApiValidationError(endpoint, `${label} must be a boolean`);
  return value;
}

function assertNumber(value: unknown, endpoint: string, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiValidationError(endpoint, `${label} must be a finite number`);
  }
  return value;
}

function assertOk(value: Record<string, unknown>, endpoint: string): void {
  if (value.ok !== true) throw new ApiValidationError(endpoint, "response must include ok: true");
}

function assertStorageStatus(value: unknown, endpoint: string, label = "storage"): void {
  const storage = assertRecord(value, endpoint, label);
  assertString(storage.kind, endpoint, `${label}.kind`);
  assertBoolean(storage.durable, endpoint, `${label}.durable`);
  assertString(storage.error, endpoint, `${label}.error`);
  assertString(storage.repo, endpoint, `${label}.repo`);
  assertString(storage.branch, endpoint, `${label}.branch`);
  assertString(storage.path, endpoint, `${label}.path`);
}

function assertFlow(value: unknown, endpoint: string, label: string): void {
  const issue = collectFlowValidationIssues(value, label)[0];
  if (issue) throw new ApiValidationError(endpoint, `${issue.path} ${issue.message}`);
}

function assertLayoutCollection(value: unknown, endpoint: string, label: string): void {
  const layouts = assertRecord(value, endpoint, label);
  const canvas = assertRecord(layouts.canvas, endpoint, `${label}.canvas`);
  assertNumber(canvas.width, endpoint, `${label}.canvas.width`);
  assertNumber(canvas.height, endpoint, `${label}.canvas.height`);
  const global = assertRecord(layouts.global, endpoint, `${label}.global`);
  assertString(global.id, endpoint, `${label}.global.id`);
  assertArray(global.elements, endpoint, `${label}.global.elements`);
  const states = assertArray(layouts.states, endpoint, `${label}.states`);
  states.forEach((state, stateIndex) => {
    const stateLabel = `${label}.states[${stateIndex}]`;
    const layoutState = assertRecord(state, endpoint, stateLabel);
    assertString(layoutState.id, endpoint, `${stateLabel}.id`);
    assertArray(layoutState.elements, endpoint, `${stateLabel}.elements`);
  });
}

function assertConstants(value: unknown, endpoint: string, label: string): void {
  assertRecord(value, endpoint, label);
}

function assertHostAudios(value: unknown, endpoint: string, label: string): void {
  const hostAudios = assertRecord(value, endpoint, label);
  assertArray(hostAudios.hostAudios, endpoint, `${label}.hostAudios`);
}

function assertArtAsset(value: unknown, endpoint: string, label: string): void {
  const asset = assertRecord(value, endpoint, label);
  assertString(asset.id, endpoint, `${label}.id`);
  assertString(asset.name, endpoint, `${label}.name`);
  assertString(asset.currentUrl, endpoint, `${label}.currentUrl`);
  assertString(asset.defaultUrl, endpoint, `${label}.defaultUrl`);
  assertBoolean(asset.hasCustom, endpoint, `${label}.hasCustom`);
}

function assertArtComposition(value: unknown, endpoint: string, label: string): void {
  const composition = assertRecord(value, endpoint, label);
  assertString(composition.id, endpoint, `${label}.id`);
  assertString(composition.name, endpoint, `${label}.name`);
  const canvas = assertRecord(composition.canvas, endpoint, `${label}.canvas`);
  assertNumber(canvas.width, endpoint, `${label}.canvas.width`);
  assertNumber(canvas.height, endpoint, `${label}.canvas.height`);
  assertArray(composition.components, endpoint, `${label}.components`);
}

export function validateHealthResponse(value: unknown, endpoint = "/api/health"): HealthResponse {
  const response = assertRecord(value, endpoint, "response");
  assertOk(response, endpoint);
  assertNumber(response.rooms, endpoint, "rooms");
  return value as HealthResponse;
}

export function validateGameFlowResponse(value: unknown, endpoint = "/api/game-flow"): GameFlowResponse {
  const response = assertRecord(value, endpoint, "response");
  assertOk(response, endpoint);
  assertFlow(response.flow, endpoint, "flow");
  assertFlow(response.savedFlow, endpoint, "savedFlow");
  assertFlow(response.runtimeFlow, endpoint, "runtimeFlow");
  assertBoolean(response.hasLocalDraft, endpoint, "hasLocalDraft");
  assertStorageStatus(response.storage, endpoint);
  assertArray(response.availableActionTypes, endpoint, "availableActionTypes");
  assertArray(response.availableTransitions, endpoint, "availableTransitions");
  return value as GameFlowResponse;
}

export function validateGameFlowSaveResponse(value: unknown, endpoint = "/api/game-flow"): GameFlowSaveResponse {
  const response = assertRecord(value, endpoint, "response");
  assertOk(response, endpoint);
  assertFlow(response.flow, endpoint, "flow");
  assertFlow(response.runtimeFlow, endpoint, "runtimeFlow");
  assertStorageStatus(response.storage, endpoint);
  return value as GameFlowSaveResponse;
}

export function validateLayoutResponse<TLayout extends LayoutResponse["layouts"]>(
  value: unknown,
  endpoint: string
): LayoutResponse<TLayout> {
  const response = assertRecord(value, endpoint, "response");
  assertOk(response, endpoint);
  assertLayoutCollection(response.layouts, endpoint, "layouts");
  assertLayoutCollection(response.savedLayouts, endpoint, "savedLayouts");
  assertBoolean(response.hasLocalDraft, endpoint, "hasLocalDraft");
  assertStorageStatus(response.storage, endpoint);
  return value as LayoutResponse<TLayout>;
}

export function validateLayoutSaveResponse<TLayout extends LayoutSaveResponse["layouts"]>(
  value: unknown,
  endpoint: string
): LayoutSaveResponse<TLayout> {
  const response = assertRecord(value, endpoint, "response");
  assertOk(response, endpoint);
  assertLayoutCollection(response.layouts, endpoint, "layouts");
  assertStorageStatus(response.storage, endpoint);
  return value as LayoutSaveResponse<TLayout>;
}

export function validateGameConstantsResponse(value: unknown, endpoint = "/api/game-constants"): GameConstantsResponse {
  const response = assertRecord(value, endpoint, "response");
  assertOk(response, endpoint);
  assertConstants(response.constants, endpoint, "constants");
  assertConstants(response.savedConstants, endpoint, "savedConstants");
  assertBoolean(response.hasLocalDraft, endpoint, "hasLocalDraft");
  assertStorageStatus(response.storage, endpoint);
  return value as GameConstantsResponse;
}

export function validateGameConstantsSaveResponse(value: unknown, endpoint = "/api/game-constants"): GameConstantsSaveResponse {
  const response = assertRecord(value, endpoint, "response");
  assertOk(response, endpoint);
  assertConstants(response.constants, endpoint, "constants");
  assertStorageStatus(response.storage, endpoint);
  return value as GameConstantsSaveResponse;
}

export function validateHostAudiosResponse(value: unknown, endpoint = "/api/host-audios"): HostAudiosResponse {
  const response = assertRecord(value, endpoint, "response");
  assertOk(response, endpoint);
  assertHostAudios(response.hostAudios, endpoint, "hostAudios");
  assertHostAudios(response.savedHostAudios, endpoint, "savedHostAudios");
  assertBoolean(response.hasLocalDraft, endpoint, "hasLocalDraft");
  assertStorageStatus(response.storage, endpoint);
  return value as HostAudiosResponse;
}

export function validateHostAudiosSaveResponse(value: unknown, endpoint = "/api/host-audios"): HostAudiosSaveResponse {
  const response = assertRecord(value, endpoint, "response");
  assertOk(response, endpoint);
  assertHostAudios(response.hostAudios, endpoint, "hostAudios");
  assertStorageStatus(response.storage, endpoint);
  return value as HostAudiosSaveResponse;
}

export function validateArtAssetsResponse(value: unknown, endpoint = "/api/art-assets"): ArtAssetsResponse {
  const response = assertRecord(value, endpoint, "response");
  assertOk(response, endpoint);
  assertArray(response.groups, endpoint, "groups");
  assertArray(response.assets, endpoint, "assets").forEach((asset, index) => {
    assertArtAsset(asset, endpoint, `assets[${index}]`);
  });
  assertArray(response.compositions, endpoint, "compositions").forEach((composition, index) => {
    assertArtComposition(composition, endpoint, `compositions[${index}]`);
  });
  return value as ArtAssetsResponse;
}
