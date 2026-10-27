# 37 Companion — `make` builds and starts every container, then opens the app in your browser.
# `make help` lists every command.
SHELL := /bin/bash
.DEFAULT_GOAL := run
URL     := http://localhost:3000
COMPOSE := docker compose
# make run WORKSPACE=~/42 → also mount your 42 projects folder (optional, own machine only).
ifdef WORKSPACE
export WORKSPACE := $(abspath $(WORKSPACE))
COMPOSE += -f docker-compose.yml -f docker-compose.workspace.yml
endif
OPEN := $(shell command -v open 2>/dev/null || command -v xdg-open 2>/dev/null)

.PHONY: run up stop down restart rebuild logs ps status db owner dev install lint typecheck check build fetch-projects certifications evals clean help

help: ## List the commands
	@grep -E '^[a-z -]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-16s %s\n", $$1, $$2}'

run: up ## Build if needed, start all containers, open the browser
	@echo "→ waiting for $(URL)"
	@for i in $$(seq 1 90); do curl -fs -o /dev/null $(URL)/ && break; sleep 1; done
	@curl -fs -o /dev/null $(URL)/ || { echo "app didn't come up — run: make logs"; exit 1; }
	@echo "✓ 37 Companion is running at $(URL)"
	@$(if $(OPEN),$(OPEN) $(URL) >/dev/null 2>&1 || true,true)

up: .env.local ## Build and start the containers without opening the browser
	@docker info >/dev/null 2>&1 || { echo "Docker isn't running — start Docker and try again."; exit 1; }
	@$(COMPOSE) up -d --build

stop: ## Stop the containers (keeps your data)
	@$(COMPOSE) stop

down: ## Remove the containers (keeps the database volume)
	@$(COMPOSE) down

restart: ## Restart the containers
	@$(COMPOSE) restart

rebuild: .env.local ## Rebuild the app image from scratch and start
	@$(COMPOSE) build --no-cache app && $(COMPOSE) up -d

logs: ## Follow the logs of all containers
	@$(COMPOSE) logs -f --tail=100

ps status: ## Show container status
	@$(COMPOSE) ps

db: ## Open a psql shell on the database
	@$(COMPOSE) exec db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

owner: ## Give a 42 login the owner badge: make owner LOGIN=yourlogin
	@test -n "$(LOGIN)" || { echo "usage: make owner LOGIN=<42 login>"; exit 1; }
	@[[ "$(LOGIN)" =~ ^[a-zA-Z0-9_-]+$$ ]] || { echo "invalid login"; exit 1; }
	@$(COMPOSE) exec -T db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -c "INSERT INTO leets.vip (category, login, profile, token) VALUES ('"'"'student'"'"', '"'"'$(LOGIN)'"'"', '"'"''"'"', '"'"'owner'"'"') ON CONFLICT (login) DO UPDATE SET token = '"'"'owner'"'"';"'
	@echo "✓ $(LOGIN) is now the owner"

dev: .env.local ## Run only the db in Docker and the app with hot reload (npm run dev)
	@$(COMPOSE) up -d db
	@npm run dev

install: ## Install the npm dependencies (for make dev / lint / typecheck)
	@npm ci

lint: ## Run ESLint
	@npx eslint src

typecheck: ## Run the TypeScript compiler (no output files)
	@npx tsc --noEmit -p .

check: lint typecheck ## Lint + typecheck — run before every commit

build: ## Production build (what the Docker image runs)
	@npm run build

fetch-projects: ## Refresh the project catalog from the 42 API (CAMPUS=<id>, default 21)
	@npm run fetch:projects

certifications: ## Refresh Credly badges + the RNCP 39783 / 39774 fiches → src/data/certifications.json
	@python3 scripts/fetch_certifications.py

evals: ## Re-scrape the evaluation sheets of 42evalhub.com → src/data/evals.json
	@python3 scripts/scrape_evalhub.py $(ARGS)

clean: ## Remove containers, image AND the database volume
	@read -p "This deletes the 37 Companion database volume. Continue? [y/N] " a; [[ $$a == y ]]
	@$(COMPOSE) down -v --rmi local

.env.local:
	@cp .env.example .env.local
	@key=$$(openssl rand -hex 32) && sed -i.bak "s|^SECRET_KEY=$$|SECRET_KEY=$$key|" .env.local && rm -f .env.local.bak
	@echo "Created .env.local — add INTRA_UID and INTRA_SECRET_KEY from your 42 app, then run make again."
	@exit 1
