# DataVore JSONL Export Plan

## Scope

Add a new export flow that streams query results as JSONL (NDJSON) so users can export very large datasets without loading all rows into browser memory.

## UX

- Add an `Export JSONL` action near query run/cancel controls.
- Export action is enabled when:
  - query editor has non-empty SQL, and
  - user is not currently executing another export for the same session.
- Clicking export opens a lightweight modal:
  - filename input (default: `query-YYYYMMDD-HHmmss.jsonl`)
  - row limit option (`No limit`, `10k`, `100k`, custom numeric)
  - include metadata header toggle (`false` by default)
  - `Start export` and `Cancel`
- Progress/status area:
  - states: `Preparing`, `Streaming`, `Completed`, `Cancelled`, `Failed`
  - shows streamed row count and bytes written (best effort from `Content-Length` or chunk tally)
- Cancellation:
  - user can cancel during preparation or streaming
  - status updates immediately and indicates whether partial file was saved

## API Contract

## Endpoint

- `POST /query/export/jsonl`

## Request

```json
{
  "query": "SELECT ...",
  "queryId": "exp-<uuid>",
  "limit": 100000,
  "includeMetadataHeader": false
}
```

- `queryId` is required for cancellation and audit correlation.
- `limit` optional; server-side max cap enforced by config.

## Response

- Success:
  - `200 OK`
  - `Content-Type: application/x-ndjson; charset=utf-8`
  - `Content-Disposition: attachment; filename=\"<safe>.jsonl\"`
  - transfer via chunked streaming (no full buffering)
- Error:
  - structured JSON error with `code`, `message`, and optional `details`.

## Streaming Format Strategy

- Default format is NDJSON (one JSON object per line, UTF-8, `\n` delimiter).
- Row shape:
  - each line is a single row object as returned by query execution pipeline.
- Optional metadata header:
  - first line uses a reserved wrapper object:
    - `{ "_meta": { "columns": [...], "exportedAt": "...", "queryId": "..." } }`
- Never emit partial JSON objects; flush only full lines.
- Ensure stable newline handling across OSes (`\n` only).

## Server Implementation Notes

- Add service method in query service layer:
  - executes SQL using cursor/stream-capable driver path where supported (Postgres cursor, MySQL streaming rows).
  - transforms each row to JSON string + newline and writes to response stream.
- Set explicit high-water marks and use `res.write()` backpressure signal:
  - if `res.write()` returns `false`, pause DB row stream until `drain`.
- Avoid in-memory row accumulation except minimal batching (e.g., 100-1000 rows configurable).
- Add export-specific query timeout and maximum byte/row guardrails.

## Cancellation

- Reuse existing query cancellation infrastructure keyed by `queryId`.
- Cancellation contract:
  - `POST /query/cancel` with matching export `queryId`
  - server aborts DB cursor/stream and closes HTTP response
- Browser flow:
  - use `AbortController` for fetch request
  - on user cancel, call both:
    - client abort (`AbortController.abort()`)
    - server cancellation endpoint (best effort)

## Backpressure and Large Result Handling

- Backpressure:
  - wire DB stream pause/resume to HTTP socket drain events.
- Large result controls:
  - configurable hard limits:
    - max rows
    - max bytes
    - max duration
  - when limit reached, terminate stream cleanly and emit response trailer/log marker (server-side) indicating truncation reason.
- Memory profile:
  - keep memory O(batch_size), not O(total_rows).
- For browser download:
  - use `fetch` stream + `WritableStream`/`Blob` fallback.
  - if direct stream-to-disk APIs unavailable, chunk into Blob parts with size cap warnings.

## Auth and Security

- Require same auth/session checks as execute query endpoint.
- Enforce role-based access parity with query execution.
- Sanitize filename in `Content-Disposition` (no path traversal, control chars).
- Apply query validation rules already used in execute path.
- Add rate limiting and concurrency cap per user/session for export endpoints.
- Audit log fields:
  - actor/user id
  - queryId
  - start/end timestamps
  - bytes/rows streamed
  - cancelled/failed reason

## Error Handling

- Before stream starts:
  - return JSON error payload + non-2xx status.
- Mid-stream failures:
  - close stream and return partial file outcome to client UI.
  - classify reason in server logs (`db_error`, `timeout`, `cancelled`, `limit_exceeded`, `network_disconnect`).
- Client UI mapping:
  - show concise user message and expandable technical detail for HTTP status/code.

## Phased Rollout

1. Phase 1: Backend streaming endpoint (feature-flagged)
   - implement endpoint/service
   - add limits, cancellation, logging
   - internal/manual API testing
2. Phase 2: Browser UI integration
   - add export modal/status
   - implement stream download + cancel controls
   - hidden behind UI feature flag
3. Phase 3: Dogfood + observability
   - enable for internal environments
   - monitor failure rate, cancellation success, memory, latency
4. Phase 4: General availability
   - enable by default
   - publish docs and operator runbook

## Test Plan

- Unit tests:
  - JSONL line serialization (nulls, nested objects, unicode)
  - metadata header inclusion/exclusion
  - filename sanitization
  - limit and timeout behavior
- Integration tests (server):
  - chunked stream response headers/content
  - cancellation stops DB stream and HTTP response
  - backpressure pause/resume behavior
  - auth/permission failures
- Browser tests:
  - export action state transitions
  - successful streamed download
  - cancellation UX + partial file messaging
  - failure scenarios (401/403/500/network abort)
- Performance tests:
  - million-row export with bounded memory
  - concurrent exports across users/sessions
- Regression checks:
  - existing query execute/cancel paths unchanged
  - no cross-impact on standard data tab rendering
