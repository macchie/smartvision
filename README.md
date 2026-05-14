# SmartVision Apps

![PocketBase](https://img.shields.io/badge/PocketBase-0.36.9-blue)
![Angular](https://img.shields.io/badge/Frontend-Angular%20%2B%20PrimeNG-red)
![TailwindCSS](https://img.shields.io/badge/Styling-TailwindCSS-06B6D4)
![Docker](https://img.shields.io/badge/Deploy-Docker%20Compose-2496ED)

SmartVision Apps is a web platform for operational access control management.
It centralizes people, vehicle, camera, and room data, and provides a live dashboard for monitoring ingress/egress activity and room key workflows.

## Project Goal

Deliver a production-ready, role-aware access control dashboard that:

- keeps core operations in one web app (no mobile dependency)
- provides consistent CRUD workflows for all master data entities
- surfaces real backend state from PocketBase with clear user feedback
- supports secure, maintainable evolution through migrations and hooks

## Current Scope

This repository currently treats only these folders as source of truth:

- backend (PocketBase server, migrations, hooks)
- frontend (Angular application with PrimeNG and TailwindCSS)

Legacy/mobile folders are intentionally excluded from active development scope.

## Current Feature Set

### Authentication and Roles

- PocketBase auth with role-based rules (admin/operator/regular)
- Sign-in restricted to enabled admin/operator accounts only
- Self-registration is disabled; users are managed by admins/operators
- Admin and superuser seed accounts for local development
- Rule-repair migration to prevent drift to superuser-only CRUD behavior

### Operational Dashboard

- Live summary metrics (vehicles inside, people inside, keys distributed)
- Latest access events for users and vehicles
- Backend summary endpoint at /api/dashboard/summary for role-safe reads

### Master Data CRUD

- Cameras CRUD
- Vehicles CRUD
- Users CRUD
- Unified Rooms experience:
  - room groups shown as parent rows
  - rooms shown as sub-entries in one page/table

### UX and Interaction

- Responsive top toolbar with active-page highlighting
- PrimeNG toast notifications for success/error operation feedback
- PrimeNG confirmation dialogs (no native browser confirm dialogs)
- Production-style UI with PrimeNG + TailwindCSS

## Architecture

### Backend

- PocketBase runtime pinned to version 0.36.9
- Schema and data lifecycle managed via backend/pb_migrations
- Domain behavior and API hooks in backend/pb_hooks
- Demo data support controlled by DEMO_DATA environment variable

Important migrations include:

- 00000000000013_repair_core_collections_schema.js
- 00000000000015_reseed_dashboard_demo_data_fix.js
- 00000000000016_fix_core_crud_rules.js
- 00000000000021_restrict_users_auth_to_admin_operator.js

Seeded local credentials:

- App admin user: admin@smartvision.local / Admin123!
- PocketBase superuser: superadmin@smartvision.local / Admin123!

### Frontend

- Angular standalone architecture
- PrimeNG component system
- TailwindCSS styling (with tailwindcss-primeui)
- Web-only runtime
- Core app pages are eagerly loaded to avoid route-change style flash (FOUC)
- Production build output to backend/pb_public

## Prerequisites

- Node.js (LTS recommended)
- npm
- PocketBase binary in backend, version 0.36.9
- Docker and Docker Compose (optional)

## Local Development

From repository root:

```bash
make install
make dev
```

Disable demo data seeding:

```bash
make DEMO_DATA=FALSE backend
```

Useful URLs:

- PocketBase Admin: http://0.0.0.0:8090/_/
- Frontend Dev Server: http://0.0.0.0:4200

Run one service only:

```bash
make backend
make frontend
```

## Build

```bash
make build
```

Output directory:

- backend/pb_public

## Deploy with Docker

```bash
make docker
make docker-down
make docker-logs
```

## Maintenance

```bash
make clean-data
make clean
```

## Contribution Guidelines

- Keep backend compatibility pinned to PocketBase 0.36.9
- Keep frontend UI aligned with PrimeNG + TailwindCSS
- Prefer targeted, production-ready changes
- Update this README whenever behavior, architecture, commands, or compatibility changes
