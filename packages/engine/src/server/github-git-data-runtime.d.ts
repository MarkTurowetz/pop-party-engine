export class GithubRefConflictError extends Error {
  readonly code: "GITHUB_REF_CONFLICT";
  readonly status: 409;
  readonly ref: string;
  readonly expectedSha: string;
  readonly actualSha: string;
}

export function createGithubGitDataRuntime(options: Record<string, unknown>): Readonly<Record<string, unknown>>;
export function normalizeRef(value: unknown): string;
