# LAN Party Website Scope (V1)

## Goal

Deliver a simple one-page site that prioritizes **registration** and clearly shows the **games schedule**.

## Event constraints

- Date: **7 November**
- Location model: **Local (house) + remote**
- Expected attendees: **8-10**
- Seat capacity: **10 total**
  - **7 local seats**
  - **3 remote seats**
- Deadline: **Soon**

## V1 deliverables

The V1 site is a one-pager with these sections:

1. Event overview (date, location model, seat split)
2. Registration / RSVP
3. Games schedule
4. FAQ
5. Seat list / seat availability
6. Live updates / announcements

## Functional requirements

- Admin can edit content (schedule, updates, seat list, registration state).
- Site supports live announcements/updates.
- Registration tracks local vs remote seat capacity.
- Website remains intentionally simple (single-page experience).

## Non-functional requirements

- Fast to ship and easy to maintain.
- Minimal setup and minimal operational overhead.
- Mobile-friendly layout.

## Out of scope for V1

- Complex multi-page information architecture.
- Advanced account systems (user accounts, OAuth).
- Full payment processing.
- Tournament bracket automation unless later prioritized.

## Acceptance criteria for V1

- Users can view event details and schedule in one place.
- Users can submit a registration/RSVP.
- Admin can update key content without code changes.
- Seat capacity for local/remote participants is visible and enforced in the registration flow.
