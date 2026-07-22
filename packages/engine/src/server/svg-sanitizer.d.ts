export interface ForbiddenSvgPattern {
  code: string;
  pattern: RegExp;
}

export const FORBIDDEN_SVG_PATTERNS: readonly ForbiddenSvgPattern[];
export function assertSafeSvg<T extends Uint8Array | string>(bytes: T): T;
export function svgResponseHeaders(): Readonly<Record<string, string>>;
