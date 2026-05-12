# API Route Testing Pattern

Canonical pattern for Next.js App Router API route tests in this codebase. Inherited from M6/M7 substrate (D38 + §6 failure encoding at `/api/agent/artifact`; M7 baseline at `/api/agent/turn`); canonicalized at M9 Phase A.

## Pattern

Direct Route function imports + `jest.mock` at module boundaries + manual NextRequest construction. Production-faithful, zero new test framework dependencies, works with the existing jest + ts-jest setup.

## Test file location

Co-located with the route under a `__tests__/` subfolder:

```
src/app/api/<endpoint>/route.ts
src/app/api/<endpoint>/__tests__/route.test.ts
```

Existing `tests/` directories elsewhere in the codebase (e.g., `src/lib/agent/tests/`, `src/lib/agent-client/tests/`) predate this canonical and are not migrated. New tests use `__tests__/`.

## Imports

Order matters because `jest.mock` calls are hoisted before the route import, and the route module pulls in its mocked boundary modules at top level.

```typescript
import { GET } from "../route";

jest.mock("@/lib/supabase/server");

import { createClient } from "@/lib/supabase/server";
import {
  mockSupabaseClient,
  mockAuthedUser,
  mockUnauthed,
  mockSupabaseQuery,
} from "@/__tests__/helpers/supabase";
```

The `jest.mock("@/lib/supabase/server")` line is placed BETWEEN the Route handler import and the boundary module import. Jest hoists it before either, so the route module sees the mocked boundary when it loads.

## Mocking pattern

Mock at the **module boundary** level (not individual function level). For Supabase, that means `jest.mock("@/lib/supabase/server")` or `jest.mock("@/lib/supabase/service")` depending on which client the route imports. Use the shared helpers from `src/__tests__/helpers/supabase.ts` to construct the actual mock client object.

Other common boundaries:

```typescript
jest.mock("@/lib/auth/api-auth");        // for routes using getAuthenticatedUser
jest.mock("@/lib/channex/client");       // for routes calling Channex
jest.mock("@/lib/agent/loop");           // for routes running the agent loop
jest.mock("@/lib/action-substrate/...")  // for routes using action handlers
```

If a route imports a module solely for its side effects (e.g., tool registration), mock it as a no-op so the import doesn't throw:

```typescript
jest.mock("@/lib/agent/tools", () => ({}), { virtual: false });
```

## Auth mocking

Two auth patterns exist in the codebase. Use the one matching the route under test.

**Pattern A — `getAuthenticatedUser` (returns `{ user, error }`):**

Used by `/api/agent/turn`, `/api/agent/artifact`, and other routes that import from `@/lib/auth/api-auth`.

```typescript
jest.mock("@/lib/auth/api-auth");
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

(getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: HOST, error: null });
// or for 401 path:
(getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: null, error: "Unauthorized" });
```

**Pattern B — `createClient().auth.getUser()`:**

Used by `/api/audit-feed/*` and other routes that import `createClient` from `@/lib/supabase/server` and call `.auth.getUser()` directly.

```typescript
jest.mock("@/lib/supabase/server");
import { createClient } from "@/lib/supabase/server";
import { mockSupabaseClient, mockAuthedUser, mockUnauthed } from "@/__tests__/helpers/supabase";

const supabase = mockSupabaseClient();
mockAuthedUser(supabase, HOST_ID);  // or mockUnauthed(supabase) for 401 path
(createClient as jest.Mock).mockReturnValue(supabase);
```

## Supabase query mocking

Use `mockSupabaseQuery(client, table, result)` from the shared helpers. The helper returns a chain object where:

- Builder methods (`.select`, `.eq`, `.gt`, `.limit`, `.order`, etc.) return the chain so calls are chainable
- Terminal-row methods (`.single`, `.maybeSingle`) return `Promise<result>`
- The chain itself is thenable — `await query` on count/head queries resolves to the same result

Example:

```typescript
const supabase = mockSupabaseClient();
mockAuthedUser(supabase, HOST_ID);
mockSupabaseQuery(supabase, "host_state", {
  data: { last_seen_inspect_at: "2026-05-12T00:00:00Z" },
  error: null,
});
mockSupabaseQuery(supabase, "unified_audit_feed", { count: 5, error: null });
(createClient as jest.Mock).mockReturnValue(supabase);
```

For assertions on specific builder-method invocations, use `getQueryChain(supabase, "table")`:

```typescript
const auditChain = getQueryChain(supabase, "unified_audit_feed");
expect(auditChain.gt).toHaveBeenCalledWith("occurred_at", recent);
```

When the route does more than the helper's default chain shape supports (e.g., raw SQL via `rpc()`, nested selects with foreign-key projections, special return modes), build a per-test `jest.fn` chain inline — see `/api/agent/artifact/__tests__/route.test.ts` for that pattern.

## Request construction

For GET routes with no parameters (e.g., `export async function GET()`), call the handler directly:

```typescript
const response = await GET();
```

For POST or routes with a request argument, construct a minimal NextRequest stand-in:

```typescript
function makeRequest(body: unknown): Parameters<typeof POST>[0] {
  return {
    json: jest.fn().mockResolvedValue(body),
    signal: { aborted: false },
  } as unknown as Parameters<typeof POST>[0];
}

const response = await POST(makeRequest({ field: "value" }));
```

For invalid-JSON paths (testing the 400 error branch):

```typescript
const req = {
  json: jest.fn().mockRejectedValue(new SyntaxError("bad json")),
  signal: { aborted: false },
} as unknown as Parameters<typeof POST>[0];
const response = await POST(req);
expect(response.status).toBe(400);
```

For routes that read URL params via `NextRequest.nextUrl.searchParams`, construct a fuller mock:

```typescript
const req = {
  nextUrl: new URL("https://example.com/api/route?key=value"),
  signal: { aborted: false },
} as unknown as Parameters<typeof GET>[0];
```

## Response assertions

Routes return `NextResponse.json(...)` or stream SSE. Assert via `.status` and `.json()`:

```typescript
const response = await GET();
expect(response.status).toBe(200);
const body = await response.json();
expect(body).toEqual({ count: 5, display: "5" });
```

For SSE responses, drain the stream and parse events (see `/api/agent/artifact/__tests__/route.test.ts` for the `drainSse` helper that splits on `\n\n` and parses `data: ` lines):

```typescript
const events = await drainSse(response);
expect(events).toContainEqual(expect.objectContaining({ type: "done" }));
```

## Coverage scope

API route tests cover:

- **Auth paths** — authenticated, unauthenticated, expired session
- **Input validation** — missing fields, type mismatches, invalid values, oversized payloads
- **Supabase query happy paths + error paths** — both data shape and error response handling
- **Response shape + status codes** — exact body content + HTTP status

API route tests do NOT cover:

- **End-to-end HTTP behavior** (URL routing, middleware chain) — covered by browser smoke gate
- **Concurrent request handling** — covered by load tests if needed
- **Database constraint enforcement** — covered by integration tests if needed

## Component tests

This documentation covers API route tests only. Component tests (React Testing Library + jsdom) are not yet set up; they ship when a phase requires them — likely M9 Phase E voice-surface component tests or a dedicated M10 component-test-infra phase.

When that phase opens, the upgrade path is:

1. `npm install -D jest-environment-jsdom @testing-library/react @testing-library/jest-dom`
2. Extend `jest.config.ts` `testMatch` to include `*.test.tsx`
3. Add per-file `/** @jest-environment jsdom */` pragma at the top of component test files
4. Document the component-test pattern in a sibling doc (`docs/testing/component-tests.md`)
