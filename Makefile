.PHONY: all dev build backend frontend install clean docker docker-down

POCKETBASE_VERSION ?= 0.36.9
DEMO_DATA ?= TRUE

# ─── Development ───

all: install dev

install:
	cd frontend && npm install

dev:
	@echo "Starting PocketBase + Angular dev server..."
	@echo "→ PocketBase Admin: http://0.0.0.0:8090/_/"
	@echo "→ Frontend Dev:     http://0.0.0.0:4200"
	@echo ""
	@$(MAKE) -j2 backend frontend

backend:
	cd backend && DEMO_DATA=$(DEMO_DATA) ./pocketbase serve --http=0.0.0.0:8090

frontend:
	cd frontend && npm run start

# ─── Production Build ───

build:
	cd frontend && npm run build
	@echo "✓ Frontend built to backend/pb_public/"

# ─── Docker ───

docker:
	docker compose up --build -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f smartvision

# ─── Utilities ───

clean-data:
	@rm -rf backend/pb_data/*
	@rm -rf backend/pb_public/*

clean:
	@rm -rf frontend/node_modules frontend/package-lock.json frontend/dist
	@rm -rf backend/pb_public/*
	@touch backend/pb_public/.gitkeep
