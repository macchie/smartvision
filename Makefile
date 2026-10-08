.PHONY: all dev build backend frontend bridge install clean docker docker-down docker-logs docker-logs-bridge

POCKETBASE_VERSION ?= 0.36.9
DEMO_DATA ?= TRUE

# ─── Development ───

all: install dev

install:
	cd frontend && bun install

dev:
	@echo "Starting PocketBase + Angular dev server..."
	@echo "→ PocketBase Admin: http://0.0.0.0:8090/_/"
	@echo "→ Frontend Dev:     http://0.0.0.0:4200"
	@echo ""
	@$(MAKE) -j2 backend frontend

backend:
	cd backend && DEMO_DATA=$(DEMO_DATA) ./pocketbase serve --http=0.0.0.0:8090

frontend:
	cd frontend && bun run start

# Runs the gate-bridge real-time watcher against the local PocketBase.
# Copy extensions/gate-bridge/.env.example to .env and set PB_URL / credentials
# first. Deps are installed on demand; config is re-read while running.
bridge:
	@echo "Starting gate-bridge (→ $${PB_URL:-http://127.0.0.1:8090})..."
	cd extensions/gate-bridge && npm install && npm start

# ─── Production Build ───

build:
	cd frontend && bun run build
	@echo "✓ Frontend built to backend/pb_public/"

# ─── Docker ───

# Builds and starts both services: smartvision (PocketBase + frontend) and
# the gate-bridge real-time watcher.
docker:
	docker compose up --build -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f smartvision

docker-logs-bridge:
	docker compose logs -f gate-bridge

# ─── Utilities ───

clean-data:
	@rm -rf backend/pb_data/*
	@rm -rf backend/pb_public/*

clean:
	@rm -rf frontend/node_modules frontend/package-lock.json frontend/bun.lock frontend/bun.lockb frontend/dist
	@rm -rf backend/pb_public/*
	@touch backend/pb_public/.gitkeep
