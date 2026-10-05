# ADR 0002: Registration with local and remote seat capacity

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

The event has mixed attendance (in-person and remote) with explicit capacity limits:

- 7 in-person seats
- 3 remote seats

Registration is the top project goal and must reflect real capacity.

## Decision

Model registration with a **convertible local-seat rule**:

1. **Local seats:** max 7 (for in-person players)
2. **Remote base seats:** max 3
3. **Remote registrations may also consume unused local seats**

Effective constraints:

- `local_registrations <= local_capacity`
- `total_registrations <= local_capacity + remote_capacity`

## Consequences

- Remote participants can still register when dedicated remote seats are full if local capacity is unused.
- Organizer avoids manual overbooking cleanup.
- If event policy changes, capacities can be updated in one place.
