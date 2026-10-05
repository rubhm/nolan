# ADR 0001: Single-page website for V1

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

The event is small (8-10 attendees), has a short deadline, and needs a lightweight site focused on registration and schedule visibility.

## Decision

Build V1 as a **single-page website** that includes:

- Event overview
- Registration/RSVP
- Schedule
- FAQ
- Seat list
- Live updates

## Consequences

- Faster delivery with lower implementation overhead.
- Easier maintenance for a small organizer team.
- Less structure for large-scale content growth; if scope expands, future ADRs can split the site into multiple pages.
