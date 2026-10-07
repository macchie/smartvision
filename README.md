# SmartVision

![PocketBase](https://img.shields.io/badge/PocketBase-0.36.9-blue)
![Angular](https://img.shields.io/badge/Frontend-Angular%2021-red)
![PrimeNG](https://img.shields.io/badge/UI-PrimeNG-009688)
![TailwindCSS](https://img.shields.io/badge/Styling-TailwindCSS-06B6D4)
![Bun](https://img.shields.io/badge/Runtime-Bun%201.3%2B-F9F1E1)
![Docker](https://img.shields.io/badge/Deploy-Docker%20Compose-2496ED)
![Realtime](https://img.shields.io/badge/Updates-Realtime-success)

SmartVision is a web-based access control platform for operational teams.
It centralizes people, vehicles, gates, and room keys in a single dashboard with realtime updates and production-ready CRUD workflows.

## Overview

SmartVision helps teams monitor and manage facility access with:

- live ingress, egress, and checkpoint visibility
- role-aware authentication and authorization
- full master-data management (users, vehicles, gates, rooms)
- realtime dashboard and access logs for fast operational decisions

## Key Features

- 🔐 Auth and Roles
  - Admin/operator login only
  - Role-based access rules enforced in PocketBase
  - Users created from UI are business profiles (person, employee, company) with fixed `regular` role
  - UI user creation does not require manual auth credentials; backend lifecycle hooks auto-provision internal email/password when missing

- 📊 Operational Dashboard
  - Live metrics: vehicles inside, people inside, keys distributed
  - Latest vehicle and people access streams
  - Clean direction cards for Ingress, Checkpoint, and Egress
  - Reusable quick-action dialog component for access and key workflows
  - Realtime-safe behavior with reconnect and fallback refresh

- 🚗👤 Access Management
  - Track both vehicle and user access events
  - Direction support: in, out, checkpoint
  - Fast filters and search in access logs

- 🗝 Room Key Workflow
  - Key distribution and collection events
  - Room key state synchronization

- 🛠 CRUD Modules
  - Gates, Vehicles, Users, Room Groups, Rooms
  - Consistent UI patterns with PrimeNG + TailwindCSS
  - Fixed top toolbar with safe-area aware spacing across all pages
  - Viewport-safe dialogs and overlays that stay fully visible on desktop/mobile

- 🌐 Per-user Preferences & i18n
  - `users_config` collection stores each user's language, colour scheme and dashboard layout
  - In-app Settings dialog (user menu) to switch language and light/dark theme
  - Preferences persist server-side and follow the user across devices
  - Internationalization built on Angular's official `@angular/localize`
  - English (source) + Italian, Spanish, French, applied at runtime (no per-locale builds)

- ⚡ Realtime Reliability
  - PocketBase subscriptions for live updates
  - Visibility/online rebinding and subscription recovery
  - Periodic consistency sync when realtime is degraded
  - Demo scheduler emits events and sends realtime update pings

## Tech Stack

- Backend: PocketBase 0.36.9 (migrations + hooks)
- Frontend: Angular 21 standalone architecture
- Frontend routing: lazy-loaded standalone screens via `loadComponent`
- UI: PrimeNG + TailwindCSS
- Frontend Runtime/Package Manager: Bun
- Build Output: frontend bundles served by PocketBase from backend/pb_public

## Quick Start

### 1. Prerequisites

- Bun 1.3+
- PocketBase binary in backend/
- Docker + Docker Compose (optional)

### 2. Install and Run

```bash
make install
make dev
```

### 3. Open the App

- Frontend: http://0.0.0.0:4200
- PocketBase Admin: http://0.0.0.0:8090/_/

## Command Examples

### Development

```bash
make install
make dev
make backend
make frontend
```

### Build

```bash
make build

# frontend-only
cd frontend
bun run build
```

### Demo Data Toggle

```bash
make DEMO_DATA=FALSE backend
```

### Docker

```bash
make docker
make docker-down
make docker-logs
```

### Maintenance

```bash
make clean-data
make clean
```

## Project Structure

```text
smartvision/
├── backend/
│   ├── pb_migrations/
│   ├── pb_hooks/
│   └── pocketbase
├── frontend/
│   ├── src/
│   ├── angular.json
│   ├── package.json
│   └── bun.lock
├── Makefile
├── Dockerfile
└── docker-compose.yml
```

## Internationalization (i18n)

SmartVision uses Angular's official **`@angular/localize`** in its **runtime
translation** mode, so the app is built once and locales are applied on the fly.

- Source locale is English (`en`); templates mark strings with `i18n`/`$localize`
  and stable custom IDs (e.g. `@@nav.dashboard`).
- Translation bundles live in `frontend/public/i18n/<lang>.json` as flat
  `{ "id": "text" }` maps under a `translations` key.
- At boot, `src/main.ts` reads the preferred locale and calls `loadTranslations()`
  before `bootstrapApplication` — non-English locales are fetched from
  `/i18n/<lang>.json`.
- The active locale is resolved from `localStorage['sv-lang']` (synced from the
  user's `users_config.language`), falling back to the browser language, then `en`.
- Switching language in **Settings** persists the choice and reloads the app so
  the new bundle is applied.

### Adding or updating a language

1. Add the locale code to `SUPPORTED_LANGUAGES` in
   `frontend/src/app/core/i18n/locales.ts` and the `language` field values in the
   `users_config` migration.
2. Create `frontend/public/i18n/<lang>.json` (copy `en.json` and translate values).
3. Mark any new strings in templates with `i18n="@@your.id"` (or `$localize` in
   TypeScript) and add the matching keys to every bundle.

> Note: the app chrome, authentication screen and dashboard are fully localized.
> The feature CRUD screens (users, vehicles, rooms, access logs, gates, room
> groups) follow the same pattern and can be localized incrementally by marking
> their strings and extending the JSON bundles.

## Local Demo Credentials

- App admin: admin@smartvision.local / Admin123!
- PocketBase superuser: superadmin@smartvision.local / Admin123!

## Contributing

- Keep backend compatibility pinned to PocketBase 0.36.9
- Keep frontend UI aligned with PrimeNG + TailwindCSS
- Reuse shared frontend helpers in `frontend/src/app/shared/utils` for table sorting/date formatting consistency
- Prefer targeted, production-ready changes
- Update README when architecture, commands, or runtime behavior changes
