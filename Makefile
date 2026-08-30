SHELL := /bin/sh

PYTHON ?= python3
VENV ?= .venv
VENV_PYTHON := $(VENV)/bin/python
API_HOST ?= 127.0.0.1
API_PORT ?= 8000

.DEFAULT_GOAL := help

.PHONY: help install-backend generate api install-frontend frontend test build demo

help:
	@printf '%s\n' \
		'Targets:' \
		'  install-backend   Create .venv and install Python developer dependencies' \
		'  generate          Generate the provenance-labeled synthetic demo data' \
		'  api               Run FastAPI with local reload' \
		'  install-frontend  Install frontend dependencies (locked when available)' \
		'  frontend          Run the Vite development server' \
		'  test              Run the Python test suite' \
		'  build             Regenerate demo data and build the frontend' \
		'  demo              Print the offline demo checklist'

install-backend:
	@command -v "$(PYTHON)" >/dev/null 2>&1 || { printf '%s\n' "$(PYTHON) is required."; exit 1; }
	"$(PYTHON)" -m venv "$(VENV)"
	"$(VENV_PYTHON)" -m pip install -e '.[dev]'

generate:
	@test -x "$(VENV_PYTHON)" || { printf '%s\n' 'Backend environment missing; run make install-backend.'; exit 1; }
	"$(VENV_PYTHON)" scripts/build_demo.py

api:
	@test -x "$(VENV_PYTHON)" || { printf '%s\n' 'Backend environment missing; run make install-backend.'; exit 1; }
	"$(VENV_PYTHON)" -m uvicorn backend.app.main:app --host "$(API_HOST)" --port "$(API_PORT)" --reload

install-frontend:
	@command -v npm >/dev/null 2>&1 || { printf '%s\n' 'npm is required.'; exit 1; }
	@if [ -f frontend/package-lock.json ]; then \
		npm --prefix frontend ci; \
	else \
		npm --prefix frontend install; \
	fi

frontend:
	@test -d frontend/node_modules || { printf '%s\n' 'Frontend dependencies missing; run make install-frontend.'; exit 1; }
	npm --prefix frontend run dev

test:
	@test -x "$(VENV_PYTHON)" || { printf '%s\n' 'Backend environment missing; run make install-backend.'; exit 1; }
	"$(VENV_PYTHON)" -m pytest

build: generate
	@test -d frontend/node_modules || { printf '%s\n' 'Frontend dependencies missing; run make install-frontend.'; exit 1; }
	npm --prefix frontend run build

demo:
	@printf '%s\n' \
		'Offline demo checklist:' \
		'  1. While online: make install-backend install-frontend' \
		'  2. Prepare data: make generate' \
		'  3. Terminal 1: make api' \
		'  4. Terminal 2: make frontend' \
		'  5. Open http://localhost:5173' \
		'  6. API reference: http://127.0.0.1:8000/docs'
