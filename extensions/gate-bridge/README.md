# SmartVision gate bridge

Real-time companion to the folder-watch cron in `pb_hooks`. It turns gate
triggers into instant gate events instead of waiting for the 1-minute sweep.

For every **enabled** record in the `gate_triggers` collection it:

- **folder_watch** — watches `watch_folder` with OS file notifications
  (chokidar). The moment a matching image lands, it extracts the plate from the
  filename and forwards it, then deletes the file or moves it to
  `processed_folder` (same behaviour as the cron engine).
- **tcp_socket** — listens on `tcp_host:tcp_port`, splits the stream on
  `tcp_delimiter`, and extracts the plate from each message.

Each detection is POSTed to the existing route:

```
POST {PB_URL}/api/gate-event   { "gate_id": "<gates.gate_id>", "plate_number": "<PLATE>" }
```

which runs the same vehicle lookup / access creation and min-stay guards as the
cron engine. Plate extraction matches the engine exactly: first capture group of
`plate_regex` (or the whole match), case-insensitive, normalized to uppercase
alphanumerics.

The cron in `pb_hooks/gate_triggers.pb.js` stays enabled as a safety-net sweep
for anything the bridge misses while restarting.

## Run

Requires Node >= 18 (global `fetch`).

```bash
cd extensions/gate-bridge
cp .env.example .env    # then edit PB_URL / credentials
npm install
npm start
```

Config (`gate_triggers`) is re-read every `CONFIG_POLL_SECONDS`; adding, editing
or disabling a trigger in the UI is picked up automatically — watchers and TCP
listeners are reconciled without a restart.

### Credentials

The bridge authenticates as the account in `.env` (`PB_IDENTITY` / `PB_PASSWORD`
/ `PB_AUTH_COLLECTION`). It needs an authenticated user to read `gate_triggers`
and to call `/api/gate-event` — use an `admin` or `operator` account, or a
`_superusers` account (`PB_AUTH_COLLECTION=_superusers`).

## Docker

A `Dockerfile` is included and the repo's `docker-compose.yml` runs this bridge
alongside PocketBase. From the repo root:

```bash
docker compose up --build -d      # or: make docker
docker compose logs -f gate-bridge # or: make docker-logs-bridge
```

In compose the bridge reaches PocketBase by service name
(`PB_URL=http://smartvision:8090`) and credentials come from the `environment:`
block (change `PB_IDENTITY` / `PB_PASSWORD`). Camera-drop folders are bind-mounted
into **both** containers at the same path (`./camera-drop → /data/cameras`), so a
trigger's `watch_folder` must use the in-container path, e.g. `/data/cameras/north`.
Expose any `tcp_socket` ports in the `gate-bridge` service's `ports:` list.

## Keeping it running (without Docker)

Use a process manager, e.g. pm2:

```bash
pm2 start index.js --name smartvision-gate-bridge
```

or a systemd service that runs `node /path/to/extensions/gate-bridge/index.js` with
the environment from `.env`.
