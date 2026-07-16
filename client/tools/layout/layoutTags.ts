import type { LayoutElement } from "../../types/game-data";

export const MAX_LAYOUT_TAG_LENGTH = 64;
export const MAX_LAYOUT_TAGS_PER_ELEMENT = 32;

export function normalizeLayoutTag(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LAYOUT_TAG_LENGTH);
}

function layoutTagKey(value: unknown): string {
  return normalizeLayoutTag(value).toLowerCase();
}

export function normalizeLayoutTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const rawTag of value) {
    const tag = normalizeLayoutTag(rawTag);
    const key = layoutTagKey(tag);
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_LAYOUT_TAGS_PER_ELEMENT) break;
  }
  return tags;
}

export function layoutElementTags(element: LayoutElement | null | undefined): string[] {
  return normalizeLayoutTags(element?.tags);
}

export function layoutViewTags(elements: LayoutElement[]): string[] {
  return normalizeLayoutTags(elements.flatMap((element) => layoutElementTags(element)));
}

export function layoutElementHasTag(element: LayoutElement, tag: unknown): boolean {
  const key = layoutTagKey(tag);
  return Boolean(key) && layoutElementTags(element).some((candidate) => layoutTagKey(candidate) === key);
}

function fuzzySubsequenceScore(candidate: string, query: string): number | null {
  let queryIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;
  let gaps = 0;
  for (let candidateIndex = 0; candidateIndex < candidate.length && queryIndex < query.length; candidateIndex += 1) {
    if (candidate[candidateIndex] !== query[queryIndex]) continue;
    if (firstMatch < 0) firstMatch = candidateIndex;
    if (lastMatch >= 0) gaps += candidateIndex - lastMatch - 1;
    lastMatch = candidateIndex;
    queryIndex += 1;
  }
  if (queryIndex !== query.length) return null;
  return 100 + Math.max(0, firstMatch) * 4 + gaps;
}

function fuzzyLayoutTagScore(tag: string, query: string): number | null {
  const candidate = layoutTagKey(tag);
  const normalizedQuery = layoutTagKey(query);
  if (!normalizedQuery) return 0;
  if (candidate === normalizedQuery) return 0;
  if (candidate.startsWith(normalizedQuery)) return 10 + candidate.length - normalizedQuery.length;
  const containsIndex = candidate.indexOf(normalizedQuery);
  if (containsIndex >= 0) return 40 + containsIndex;
  return fuzzySubsequenceScore(candidate, normalizedQuery);
}

export function fuzzyLayoutTags(tags: string[], query: unknown): string[] {
  return normalizeLayoutTags(tags)
    .map((tag, index) => ({ tag, index, score: fuzzyLayoutTagScore(tag, String(query ?? "")) }))
    .filter((entry): entry is { tag: string; index: number; score: number } => entry.score !== null)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((entry) => entry.tag);
}

export function canonicalLayoutTag(tags: string[], value: unknown): string {
  const key = layoutTagKey(value);
  if (!key) return "";
  return normalizeLayoutTags(tags).find((tag) => layoutTagKey(tag) === key) || "";
}
