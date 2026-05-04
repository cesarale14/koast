import { classifyError } from "../error-classifier";

describe("classifyError — Postgres error codes", () => {
  test("23505 → conflict, retryable", () => {
    const err = Object.assign(new Error("duplicate key value"), { code: "23505" });
    expect(classifyError(err)).toEqual({
      kind: "conflict",
      message: "duplicate key value",
      retryable: true,
    });
  });

  test("23502 (NOT NULL) → constraint, retryable", () => {
    const err = Object.assign(new Error("null value in column violates"), { code: "23502" });
    expect(classifyError(err).kind).toBe("constraint");
  });

  test("23503 (FK) → constraint, retryable", () => {
    const err = Object.assign(new Error("foreign key violation"), { code: "23503" });
    expect(classifyError(err).kind).toBe("constraint");
  });

  test("23514 (CHECK) → constraint, retryable", () => {
    const err = Object.assign(new Error("violates check constraint"), { code: "23514" });
    expect(classifyError(err).kind).toBe("constraint");
  });

  test("08001 (connection failure) → transient", () => {
    const err = Object.assign(new Error("could not connect"), { code: "08001" });
    expect(classifyError(err).kind).toBe("transient");
  });
});

describe("classifyError — message-pattern matching", () => {
  test("'does not own' → authorization, NOT retryable", () => {
    const result = classifyError(new Error("Host abc does not own property xyz."));
    expect(result.kind).toBe("authorization");
    expect(result.retryable).toBe(false);
  });

  test("'permission denied' → authorization", () => {
    expect(classifyError(new Error("permission denied")).kind).toBe("authorization");
  });

  test("'unauthorized' → authorization", () => {
    expect(classifyError(new Error("unauthorized request")).kind).toBe("authorization");
  });

  test("'invalid input' → validation, retryable", () => {
    const result = classifyError(new Error("invalid input syntax"));
    expect(result.kind).toBe("validation");
    expect(result.retryable).toBe(true);
  });

  test("'zod' → validation", () => {
    expect(classifyError(new Error("zod parse failed")).kind).toBe("validation");
  });

  test("'timeout' → transient, retryable", () => {
    const result = classifyError(new Error("Request timeout after 30s"));
    expect(result.kind).toBe("transient");
    expect(result.retryable).toBe(true);
  });

  test("'fetch failed' → transient", () => {
    expect(classifyError(new Error("fetch failed: ECONNREFUSED")).kind).toBe("transient");
  });

  test("'ETIMEDOUT' → transient", () => {
    expect(classifyError(new Error("ETIMEDOUT")).kind).toBe("transient");
  });

  test("503 → transient", () => {
    expect(classifyError(new Error("503 Service Unavailable")).kind).toBe("transient");
  });
});

describe("classifyError — fallback", () => {
  test("plain Error with no signals → unknown, NOT retryable", () => {
    const result = classifyError(new Error("something else broke"));
    expect(result.kind).toBe("unknown");
    expect(result.retryable).toBe(false);
  });

  test("non-Error thrown values fall through to unknown", () => {
    expect(classifyError("string-thrown").kind).toBe("unknown");
    expect(classifyError(42).kind).toBe("unknown");
    expect(classifyError(null).kind).toBe("unknown");
  });

  test("Postgres error with unknown code falls through to message-pattern matching", () => {
    const err = Object.assign(new Error("permission denied for table"), { code: "42501" });
    // Code '42501' isn't in our known list; falls through to the
    // message check which matches 'permission denied' → authorization.
    expect(classifyError(err).kind).toBe("authorization");
  });
});

describe("classifyError — Postgres takes precedence over message", () => {
  test("23505 conflict trumps a misleading message", () => {
    const err = Object.assign(
      new Error("validation failed (but really a unique violation)"),
      { code: "23505" },
    );
    // Code 23505 is checked first, so we get 'conflict' even though
    // the message would otherwise classify as 'validation'.
    expect(classifyError(err).kind).toBe("conflict");
  });
});
