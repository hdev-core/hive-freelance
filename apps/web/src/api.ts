const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

/** Field-level issue from a Zod validation failure — see errorHandler in apps/api/src/lib/errors.ts. */
export type ApiValidationDetail = {
  path: (string | number)[];
  message: string;
};

/**
 * Same `.message`/`instanceof Error` contract as a plain Error (every
 * existing caller only reads those two), plus the structured `code`/
 * `details` the API sends on 400s — needed to show field-level validation
 * errors inline instead of just a generic message.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: ApiValidationDetail[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      details?: ApiValidationDetail[];
    };
    throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status, body.code, body.details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
