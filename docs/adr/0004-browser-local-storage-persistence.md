# ADR 0004: Browser local-storage persistence for V1

- **Status:** Superseded by ADR 0005
- **Date:** 2026-10-05

## Context

V1 needs fast delivery with minimal operational complexity. The project prefers a simple static one-page implementation.

## Decision (original)

Persist editable content and registrations in **browser local storage**:

- Content key: `nolan-lanparty-content-v1`
- Registrations key: `nolan-lanparty-registrations-v1`

## Consequences

- No backend or database required for V1.
- Works immediately with static hosting.
- Data is browser-specific and not shared automatically across devices.

## Superseded rationale

The project now requires shared visibility for organizer edits and registrations across users. ADR 0005 replaces this local-only persistence model with a lightweight shared backend.
