# nolan

Website project for a small LAN party (local + remote participants).

## Project docs

- Scope: [`docs/project-scope.md`](docs/project-scope.md)
- Architecture decisions: [`docs/adr/`](docs/adr/)

## Run locally

This project uses a tiny Node backend so content and registrations are shared for everyone using the same running server.

1. Start the server:
   - `node server.js`
2. Open:
   - `http://localhost:3000`

## Admin mode (V1)

- Open the **Admin** card at the bottom of the page.
- Password: `lanparty-admin` (or set `ADMIN_PASSWORD` env var before starting the server)
- Admin mode can edit schedule, updates, FAQ, registration open/closed state, and seat capacities.

## Shared data storage

- Shared content and registrations are stored in `data/store.json`.
- Anyone using this running server sees the same data.

## Seat logic

- Local registrations consume local seats.
- Remote registrations can use dedicated remote seats **and** any unused local seats.
- Effective constraints:
  - `local_registrations <= local_capacity`
  - `total_registrations <= local_capacity + remote_capacity`
