# ADR 0005: Shared backend with JSON data store

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Local-browser storage did not meet the requirement that organizer edits and registrations must be visible to everyone using the site.

## Decision

Use a lightweight Node HTTP server (`server.js`) that:

- Serves the static site files.
- Exposes REST endpoints for state, registration, and admin updates.
- Persists shared state in `data/store.json`.

Admin-protected endpoints require a shared password via `x-admin-password` header.

## Consequences

- Content and registrations are shared across users hitting the same server.
- Operational complexity remains low (single process, file-backed store).
- This is still a lightweight solution and not intended for high-scale production traffic.
