# ReconAgent — Multi-Source Settlement Reconciliation

**Razorpay AI Buildathon — Track 4: AI Finance Controller**

ReconAgent reconciles transactions across three synthetic data sources:
- Payment Gateway (PG) settlement file
- Bank statement
- Internal order ledger

It runs a 3-layer matching pipeline (exact → rule-based fuzzy → LLM-assisted), produces an honest exception list with categorized unresolvable records, and self-grades against ground truth.

---

## Quick Start

### 1. Get a free Gemini API key
Go to https://aistudio.google.com/app/apikey → "Create API Key" (no credit card needed).

### 2. Backend

```bash
cd backend
python -m venv .venv

# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt

cp .env.example .env
# Edit .env — paste your GEMINI_API_KEY

# Generate synthetic data (run once)
python -m app.generate_data

# Start the API server
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:5173

---

## Architecture

```
backend/
  app/
    generate_data.py      # Synthetic data generator + ground truth
    pipeline/
      exact_match.py      # Layer 1: deterministic key-based matching
      fuzzy_match.py      # Layer 2: rule-based tolerance matching
      llm_match.py        # Layer 3: Gemini-assisted reasoning (free API)
      exceptions.py       # Exception categorization
      metrics.py          # Self-grading vs ground truth
      orchestrator.py     # Runs all layers in sequence
    api/
      routes.py           # FastAPI route handlers
    main.py               # FastAPI app entrypoint
    config.py             # Settings (.env driven)
  data/
    generated/            # pg_settlements.csv, bank_statement.csv, order_ledger.csv
    ground_truth/         # ground_truth.json (hidden from pipeline, used only for grading)
  logs/                   # Per-run structured audit logs (JSON)

frontend/
  src/
    components/           # Reusable UI components
    pages/                # Dashboard, Exceptions
    api/                  # Typed API client
```

## LLM — Google Gemini (Free Tier)

| Model | Free limits |
|-------|-------------|
| `gemini-1.5-flash` | 15 requests/min, 1 million tokens/day |

Get your key: https://aistudio.google.com/app/apikey

## Matching Pipeline

| Layer | Method | Typical coverage |
|-------|--------|-----------------|
| Exact | transaction_id / UTR direct lookup | ~70% of records |
| Fuzzy | Amount ±2%, date ±3 days, partial-settlement aggregation | ~20% |
| LLM   | Gemini reasoning on remaining candidates | ~5-7% |
| Exception | Categorized unresolvable records | ~3-5% |

## Exception Categories

| Category | Meaning |
|----------|---------|
| `timing_pending` | Bank credit not yet posted |
| `amount_mismatch_unexplained` | Amount differs beyond known deductions |
| `duplicate_suspected` | Likely duplicate, needs human review |
| `missing_source_data` | Required field missing |
| `true_anomaly` | No plausible match after all 3 layers |

## Metrics Reported

- Match rate % (total + per layer)
- Precision / Recall vs. ground truth (internal validation)
- LLM layer accuracy separately
- Throughput (records/second)
- Processing time breakdown per layer
