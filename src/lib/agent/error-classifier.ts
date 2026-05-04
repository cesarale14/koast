/**
 * Classifies errors thrown during tool dispatch into a small taxonomy
 * the agent loop and the chat shell can both consume. Per M6 D28: tool
 * failures emit a `tool_call_failed` SSE event whose payload carries
 * a `kind` from this taxonomy plus a `retryable` boolean. The model
 * sees the message via the tool_result content; the chat shell's
 * ToolCall component renders the kind-specific variant.
 *
 * Keep this module free of database access and substrate state — it
 * inspects an Error object and returns a typed classification. The
 * dispatcher (or callers in the loop) pass thrown errors here and
 * surface the result; the classifier itself doesn't decide what to
 * do with the classification.
 *
 * Six kinds:
 *   - validation     : Zod / shape validation failed at the dispatcher
 *                      boundary (wrong input shape from the model;
 *                      retryable with corrected input).
 *   - authorization  : the host doesn't own the resource referenced;
 *                      not retryable (model can't fix this itself).
 *   - constraint     : Postgres CHECK / NOT NULL / unique violation
 *                      (other than conflict); retryable if the model
 *                      can choose a different value.
 *   - conflict       : Postgres unique violation that suggests a
 *                      correction-via-supersession is needed; retryable.
 *   - transient      : network / timeout / 5xx; retry-as-is recommended.
 *   - unknown        : anything else; not retryable (surface to host).
 */

export type ErrorKind =
  | "validation"
  | "authorization"
  | "constraint"
  | "conflict"
  | "transient"
  | "unknown";

export interface ClassifiedError {
  kind: ErrorKind;
  message: string;
  retryable: boolean;
}

interface PostgresErrorShape {
  code?: string;
  message?: string;
}

function looksLikePostgresError(e: unknown): e is PostgresErrorShape {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code?: unknown }).code === "string"
  );
}

/**
 * Classify an unknown error into a typed kind. Conservative: when in
 * doubt, returns 'unknown' with retryable=false rather than guessing.
 *
 * Detection heuristics (in order):
 *   1. Postgres error codes (when the error carries a `code` string):
 *        - '23505' → conflict (unique_violation)
 *        - '23502' / '23503' / '23514' → constraint (not_null / fk / check)
 *        - '08*' → transient (connection_exception family)
 *   2. Error message patterns:
 *        - "validation" / "schema" / "input" / "zod" → validation
 *        - "does not own" / "unauthorized" / "permission" → authorization
 *        - "timeout" / "ETIMEDOUT" / "ECONNRESET" / "fetch failed" → transient
 *   3. Otherwise → unknown.
 */
export function classifyError(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : String(err);

  if (looksLikePostgresError(err)) {
    const code = err.code ?? "";
    if (code === "23505") {
      return { kind: "conflict", message, retryable: true };
    }
    if (code === "23502" || code === "23503" || code === "23514") {
      return { kind: "constraint", message, retryable: true };
    }
    if (code.startsWith("08")) {
      return { kind: "transient", message, retryable: true };
    }
  }

  const lower = message.toLowerCase();

  if (
    lower.includes("does not own") ||
    lower.includes("unauthorized") ||
    lower.includes("permission denied") ||
    lower.includes("not authenticated")
  ) {
    return { kind: "authorization", message, retryable: false };
  }

  if (
    lower.includes("schema") ||
    lower.includes("validation") ||
    lower.includes("zod") ||
    lower.includes("invalid input")
  ) {
    return { kind: "validation", message, retryable: true };
  }

  if (
    lower.includes("timeout") ||
    lower.includes("etimedout") ||
    lower.includes("econnreset") ||
    lower.includes("fetch failed") ||
    lower.includes("network error") ||
    lower.includes("503") ||
    lower.includes("502")
  ) {
    return { kind: "transient", message, retryable: true };
  }

  return { kind: "unknown", message, retryable: false };
}
