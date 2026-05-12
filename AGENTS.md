# AGENTS.md

Guidelines for AI coding agents working in this repository.

## 1) Scope

Operate only on the active SmartVision stack:

- `backend/`
- `frontend/`
- root infra/config files (e.g. `Makefile`, `Dockerfile`, `docker-compose.yml`, `README.md`)

Do not use `SmartVisionIonic/` or `SmartVisionLoopback/` as project sources of truth.

## 2) Backend Compatibility (PocketBase)

- Required PocketBase version: **0.36.9**.
- Keep migrations and hooks compatible with `POCKETBASE_VERSION=0.36.9`.
- Do not introduce syntax/API usage that depends on a different PocketBase major/minor version unless explicitly requested.
- If changing backend startup/deploy behavior, keep version checks and Docker version pin aligned.

## 3) Frontend UI Rules

- Always use **PrimeNG components** for UI implementation where applicable.
- Always style with **TailwindCSS** (including existing PrimeUI integration).
- Keep component styling production-grade, accessible, and responsive.
- Avoid introducing conflicting UI systems unless explicitly requested.

## 4) Production-Ready Code Requirement

Every change must be production ready:

- no placeholder hacks in final code
- no dead/commented legacy blocks unless intentionally documented
- robust error handling for changed paths
- secure defaults and least-privilege access patterns
- maintainable naming and clear structure

## 5) README Maintenance Rule

Always update `README.md` when important changes occur, including:

- run/build/deploy commands
- architecture or folder responsibilities
- compatibility/version requirements
- major feature or workflow updates

Keep README concise, accurate, and aligned with current repository behavior.

## 6) Change Hygiene

- Prefer minimal, targeted edits.
- Preserve existing conventions unless a deliberate refactor is requested.
- Validate changed files with available checks before finalizing.
