# ADR 0003: Simple shared-password admin access for V1

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

V1 prioritizes simplicity and fast delivery. The organizer needs lightweight admin editing for schedule, updates, and seat list.

## Decision

Use a **single shared admin password** for V1 instead of a full user-account system.

## Consequences

- Very low implementation complexity and quick setup.
- No per-user audit trail or granular permissions.
- This approach is acceptable for a small private event, but should be replaced if the project grows or becomes public-facing.
