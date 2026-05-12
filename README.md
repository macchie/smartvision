# SmartVision Apps 🚀

![PocketBase](https://img.shields.io/badge/PocketBase-0.36.9-blue)
![Angular](https://img.shields.io/badge/Frontend-Angular%20%2B%20PrimeNG-red)
![TailwindCSS](https://img.shields.io/badge/Styling-TailwindCSS-06B6D4)
![Docker](https://img.shields.io/badge/Deploy-Docker%20Compose-2496ED)
![License](https://img.shields.io/badge/License-Open%20Source-success)

Open-source SmartVision workspace with a modern frontend and a PocketBase backend.

## ✨ Project Scope

This documentation covers only:

- `backend/` (PocketBase app, migrations, hooks)
- `frontend/` (Angular app with PrimeNG + TailwindCSS)

It intentionally excludes legacy/mobile folders.

## 🧱 Architecture

### Backend (`backend/`)

- PocketBase server
- Schema migrations in `backend/pb_migrations/`
- Server hooks in `backend/pb_hooks/`
- Runtime compatibility target: **PocketBase 0.36.9**
- Seed migration creates:
	- App admin user: `admin@smartvision.local` / `Admin123!`
	- PocketBase superuser: `superadmin@smartvision.local` / `Admin123!`
- Demo data migration (`00000000000011_seed_demo_data.js`) runs only when `DEMO_DATA=TRUE` and seeds sample cameras, room groups/rooms, users, vehicles, and accesses.
- Repair/reseed migrations are included for legacy or partially-corrupted datasets:
	- `00000000000013_repair_core_collections_schema.js` restores expected fields and safe read rules on core collections.
	- `00000000000015_reseed_dashboard_demo_data_fix.js` refreshes dashboard demo events/metrics when `DEMO_DATA=TRUE`.
- Email verification is disabled in the current frontend auth flow.

### Frontend (`frontend/`)

- Angular application
- UI components: PrimeNG
- Styling: TailwindCSS (+ `tailwindcss-primeui`)
- Web-only runtime (Capacitor/native features removed)
- Production build output goes to `backend/pb_public/`
- Dashboard is fully PocketBase-driven (no mocked data):
	- Latest camera/access events from `accesses`
	- Vehicles inside and people inside computed from open `accesses`
	- Keys distributed computed from open `room_key_events`
	- Legacy disabled recovery rows are ignored in dashboard aggregates/events
	- Frontend consumes backend summary endpoint `/api/dashboard/summary` for role-safe dashboard reads

## ⚙️ Prerequisites

- Node.js (recommended: current LTS)
- npm
- PocketBase binary in `backend/` (version `0.36.9`)
- Docker + Docker Compose (optional, for containerized deploy)

## 🛠️ Local Development

From repository root:

```bash
make install
make dev
```

To disable demo-only seed migration data during backend startup:

```bash
make DEMO_DATA=FALSE backend
```

Useful URLs:

- PocketBase Admin: `http://0.0.0.0:8090/_/`
- Frontend Dev Server: `http://0.0.0.0:4200`

### Run only one service

```bash
make backend
make frontend
```

## 📦 Build

Build frontend assets into PocketBase public directory:

```bash
make build
```

Output:

- `backend/pb_public/`

## 🚢 Deploy (Docker)

Build and start in background:

```bash
make docker
```

Stop services:

```bash
make docker-down
```

View logs:

```bash
make docker-logs
```

## 🧹 Maintenance Commands

Clear runtime data/public artifacts:

```bash
make clean-data
```

Deep clean frontend dependencies/build artifacts:

```bash
make clean
```

## 🤝 Contributing

- Keep backend migrations/hooks compatible with PocketBase `0.36.9`.
- Keep frontend UI consistent with PrimeNG + TailwindCSS.
- Update this README when important project behavior, commands, architecture, or compatibility changes.

---

Built with care for production-ready SmartVision workflows 💡
