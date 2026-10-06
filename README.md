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

Optional: run using values from `.env`:

```bash
cp .env.example .env
set -a && . ./.env && set +a
node server.js
```

`DATA_DIR` can point to an absolute data directory path if you want to map persistence to a specific filesystem location.

To require a sitewide player password:

```bash
SITE_PASSWORD='your-player-password' node server.js
```

## Admin mode (V1)

- Click **Admin tools** in the top-right of the page.
- Password: `lanparty-admin` (or set `ADMIN_PASSWORD` env var before starting the server)
- Admin mode can edit schedule, updates, FAQ, registration open/closed state, and seat capacities.
- Admin mode can update each attendee between `local` and `remote`, or remove registrations individually.

## Shared data storage

- Shared content and registrations are stored in `<DATA_DIR>/store.json`.
- By default, `DATA_DIR` is `./data` in the project root.
- Set `DATA_DIR` to an absolute directory path to store data elsewhere.
- Anyone using this running server sees the same data.

## Seat logic

- Local registrations consume local seats.
- Remote registrations can use dedicated remote seats **and** any unused local seats.
- Effective constraints:
  - `local_registrations <= local_capacity`
  - `total_registrations <= local_capacity + remote_capacity`

## Docker

Build:

```bash
docker build -t nolan:local .
```

Run:

```bash
docker run --rm -p 3000:3000 nolan:local
```

Optional custom admin password:

```bash
docker run --rm -p 3000:3000 -e ADMIN_PASSWORD='change-me' nolan:local
```

Sitewide player password:

```bash
docker run --rm -p 3000:3000 -e SITE_PASSWORD='your-player-password' nolan:local
```

Map data storage to a host path (bind mount for persistence):

```bash
HOST_DATA_DIR=/absolute/path/to/nolan-data
mkdir -p "$HOST_DATA_DIR"
sudo chown -R 1000:1000 "$HOST_DATA_DIR" # container runs as uid 1000 (node)
docker run --rm -p 3000:3000 \
  -v "$HOST_DATA_DIR:/app/data" \
  -e DATA_DIR=/app/data \
  nolan:local
```

If you prefer to avoid host permission management, use a named volume:

```bash
docker volume create nolan-data
docker run --rm -p 3000:3000 \
  -v nolan-data:/app/data \
  -e DATA_DIR=/app/data \
  nolan:local
```

## Container publishing on tags

This repository publishes a container image to GHCR when a tag matching `vX.X.X` is pushed (for example `v1.2.3`).

- Workflow: `.github/workflows/publish-image.yml`
- Image: `ghcr.io/rubhm/nolan`
- Tags pushed:
  - `vX.X.X` (the release tag)
  - `latest`

## Sitewide access gate

When `SITE_PASSWORD` is set, users are shown a password screen before they can access the site or API. After entering the correct password, they get a session cookie and can browse normally.
