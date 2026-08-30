# MPLADS Anomaly Review Platform

> **eSAKSHI displays data. This platform interrogates it.**

This local-first decision-support prototype helps MPLADS reviewers prioritize works that merit human attention. It compares records across works, explains the signals behind each anomaly, and keeps the underlying evidence visible. A flag is a review recommendation—not a finding about intent or wrongdoing.

## Current data status

The runnable demo currently uses **synthetic, provenance-labeled records** generated locally. They are designed to exercise known anomaly scenarios; they are not eSAKSHI records and do not establish performance on government data.

Real-data work remains:

- scrape public eSAKSHI aggregates and compile work-level records for selected districts;
- validate detectors against those records and completion photos;
- map relevant CAG MPLADS audit observations to detector scenarios; and
- human-review flagged pairs before reporting any measured result.

No detector accuracy or completed real-data validation is claimed today. eSAKSHI work-level coverage begins in FY 2023–24, so future ingestion must not imply deeper portal history.

### Current photo validation status

The demo generator writes 24 clearly marked synthetic PNG fixtures and computes their perceptual hashes and variance-of-Laplacian focus scores from the image files. These fixtures prove that the local photo pipeline and side-by-side evidence view run end to end; they do not validate performance on eSAKSHI imagery. A documented sample of ≥20 real eSAKSHI completion photos remains a validation gate before making any photo-detector performance claim.

## Decision-support capabilities

- **Possible duplicate works:** compares descriptions, location, amount, category, and time. The default text signal uses a finite MPLADS domain glossary for selected English, Hindi, and transliterated terms, followed by RapidFuzz lexical matching.
- **Unit-cost anomalies:** benchmarks a work against an appropriate peer group using robust median/MAD statistics.
- **Stalled-work review:** identifies old sanctions with missing progress or completion evidence.
- **Photo review:** supports local pHash similarity and Laplacian focus signals when completion photos are available; current evidence is synthetic-fixture coverage only.
- **Explainable prioritization:** decomposes each score into its contributing signals and links back to compared records.
- **Role-oriented views:** supports MP, State, District, and Ministry review workflows without hiding provenance.

## Architecture

The prototype is CPU-only, batch-oriented, and designed to run without venue internet after dependencies are installed:

```text
scripts/build_demo.py
        │ synthetic, source-labeled demo records
        ▼
backend/main.py (FastAPI + JSON repository)
        │ works, flags, scores, summaries, evidence
        ▼
frontend/ (Vite + React + TypeScript)
        │
        └─ dashboard → work → evidence → human review
```

The generated local dataset is the demo source. Public eSAKSHI, manually compiled district records, completion photos, and CAG reports are validation inputs to add next, never data to mix silently with synthetic records.

The current backend is a **JSON-backed local demo repository**. It reads tracked works from `data/demo/works.json` and writes local review decisions to the ignored `data/demo/reviews.json` file using atomic replacement. PostgreSQL and SQLite are not integrated. PostgreSQL is a later Phase 2 migration, after the real-data schema, provenance rules, and review workflow are validated; it is not a current setup requirement.

## Setup and run (macOS/Linux)

Prerequisites: `make`, Python 3 with `venv`, and Node.js with `npm`.

From the repository root:

```bash
cd /Users/shubhsharma/sih
make install-backend
make install-frontend
make generate
```

`make` uses `python3` by default. On a system where Python is exposed as `python`, use:

```bash
make PYTHON=python install-backend
```

Start the API and frontend in separate terminals:

```bash
# Terminal 1
make api
```

```bash
# Terminal 2
make frontend
```

Open the frontend at `http://localhost:5173` and FastAPI documentation at `http://127.0.0.1:8000/docs`. Vite may select another local port if `5173` is occupied; use the URL it prints.

Run verification:

```bash
make test
make build
```

`make test` runs the Python test suite. `make build` regenerates demo data and creates the production frontend bundle. Run `make demo` at any time to print the offline-demo startup checklist.

The equivalent core commands are:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
.venv/bin/python scripts/build_demo.py
.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
npm --prefix frontend install
npm --prefix frontend run dev
.venv/bin/python -m pytest
npm --prefix frontend run build
```

### Optional multilingual embeddings

The offline baseline is the domain-glossary plus RapidFuzz matcher described above. An optional lazy sentence-transformer scorer is available to code paths that explicitly configure the duplicate detector with `use_embeddings=True`; the API default leaves it disabled.

Install the optional dependency from the repository root with:

```bash
.venv/bin/python -m pip install -e '.[embeddings]'
```

This extra is not part of the offline baseline. Enabling it downloads `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` on first model use unless that model is already cached, so it requires advance network access and storage. It must not be described as general-language support unless the model is bundled for offline use and validated on the intended language and transliteration sample.

## API route summary

The current API contract is:

- `GET /health` — return local service, dataset, and provenance status.
- `GET /api/works` — list and filter work records.
- `GET /api/works/{id}` — return one work; `{id}` is the work identifier represented by the backend's `work_id` path parameter.
- `GET /api/flags` — list anomaly signals and their review context.
- `GET /api/risk/{work_id}` — return the decomposed prioritization score for one work.
- `GET /api/dashboard-summary` — return role-oriented aggregate counts and trends.
- `GET /api/flags/{flag_id}/evidence` — return the compared records and signals for one flag.
- `POST /api/flags/{flag_id}/review` — create or replace the local human-review decision for one flag.
- `PATCH /api/flags/{flag_id}/review` — compatibility alias with the same behavior as `POST`; it is intentionally hidden from the generated OpenAPI schema.

FastAPI documentation at `/docs` is the source of truth for query parameters and response schemas. The hidden `PATCH` alias remains callable even though it does not appear there.

## Provenance and language rules

Every record must carry exactly one source label:

- `synthetic` — generated solely for the demo;
- `real_scraped` — captured from a public source with source URL and retrieval time; or
- `manually_compiled` — transcribed with source reference and reviewer details.

Derived flags and scores must retain the source labels of every contributing record. Synthetic and real records must never be combined without an explicit, visible distinction.

Use **anomaly**, **review**, and **decision-support** language throughout the product. A flag communicates that evidence deserves human review; it does not decide the outcome. Scores must remain decomposable, and reviewers must be able to inspect and dispute the evidence.

The default multilingual behavior is deliberately narrow: a finite domain glossary canonicalizes selected MPLADS terms across English, Hindi, and common transliterations, then RapidFuzz compares the canonical text. This is a domain baseline, not a claim of general-language understanding. The optional multilingual sentence-transformer remains lazy, disabled by default, and outside the offline baseline until it is bundled and validated.

## Three-minute offline demo

Install dependencies and generate the dataset before disconnecting. Then:

1. **0:00–0:25 — Positioning:** start both services, open the local UI, and state that the current records are synthetic and visibly labeled.
2. **0:25–0:55 — Overview:** show the Ministry or District summary and choose a high-priority review item.
3. **0:55–1:55 — Evidence:** open a possible duplicate pair and compare descriptions, amounts, locations, and the matching signal side by side.
4. **1:55–2:35 — Explainability:** show the score decomposition, then briefly filter to a cost or stalled-work anomaly.
5. **2:35–3:00 — Trust:** point to provenance and the human-review workflow; close with “eSAKSHI displays data. This platform interrogates it.”

This path needs only the generated local data, FastAPI process, and Vite frontend process.

## Project structure

```text
.
├── backend/
│   ├── main.py           # FastAPI routes and JSON-backed app assembly
│   ├── repository.py     # tracked works plus ignored local review state
│   ├── analysis.py       # detector orchestration, evidence, and summaries
│   ├── detectors/        # duplicate, cost, stall, and photo signals
│   └── app/main.py       # ASGI compatibility entry point
├── data/
│   ├── generator.py      # provenance-labeled synthetic record generator
│   └── demo/
│       ├── works.json        # tracked generated demo records
│       ├── ground_truth.json # tracked injected demo scenarios
│       ├── photos/           # 24 tracked synthetic image fixtures
│       └── reviews.json      # ignored runtime review decisions, when created
├── frontend/             # Vite React TypeScript client
├── scripts/
│   └── build_demo.py     # synthetic demo-data generator
├── tests/                # Python tests
├── pyproject.toml        # backend package and developer dependencies
├── Makefile              # local setup, run, test, and build commands
└── README.md
```

## Immediate data tasks

1. Capture eSAKSHI aggregate provenance and manually compile work-level samples for at least two districts, limited to available FY 2023–24 onward data.
2. Preserve source URL, retrieval time, source label, and transformation history for every imported record.
3. Collect and review a documented sample of at least 20 real eSAKSHI completion photos for duplicate and quality signals.
4. Extract relevant CAG MPLADS observations and map at least three to reproducible detector scenarios.
5. Human-review the top flagged duplicate pairs and publish a measured result only with sample size and review method.
