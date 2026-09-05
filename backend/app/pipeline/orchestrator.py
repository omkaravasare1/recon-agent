"""
Pipeline Orchestrator
======================
Runs the 3-layer reconciliation pipeline end-to-end and returns a
structured RunResult including all matches, exceptions, and metrics.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .exceptions import build_exceptions
from .exact_match import run_exact_match
from .fuzzy_match import run_fuzzy_match
from .llm_match import run_llm_match
from .loader import load_bank, load_ledger, load_pg
from .metrics import ReconciliationMetrics, compute_metrics
from .models import MatchResult


@dataclass
class RunResult:
    run_id:   str
    status:   str                           # "completed" | "running" | "failed"
    results:  list[MatchResult] = field(default_factory=list)
    metrics:  Optional[ReconciliationMetrics] = None
    error:    str = ""


def run_pipeline(
    run_id:      str,
    data_dir:    str = "data/generated",
    gt_dir:      str = "data/ground_truth",
    skip_llm:    bool = False,
) -> RunResult:
    t0 = time.monotonic()
    layer_timing: dict[str, float] = {}

    # ── load sources ─────────────────────────────────────────────────────────
    pg_records     = load_pg(Path(data_dir) / "pg_settlements.csv")
    bank_records   = load_bank(Path(data_dir) / "bank_statement.csv")
    ledger_records = load_ledger(Path(data_dir) / "order_ledger.csv")

    n_pg     = len(pg_records)
    n_bank   = len(bank_records)
    n_ledger = len(ledger_records)

    all_results: list[MatchResult] = []

    # ── Layer 1: Exact match ─────────────────────────────────────────────────
    t1 = time.monotonic()
    exact_matched, unmatched_pg, unmatched_bank, unmatched_ledger = run_exact_match(
        pg_records, bank_records, ledger_records
    )
    layer_timing["exact"] = time.monotonic() - t1
    all_results.extend(exact_matched)

    print(f"[Exact]  matched={len(exact_matched)}  "
          f"remaining PG={len(unmatched_pg)}  "
          f"bank={len(unmatched_bank)}  ledger={len(unmatched_ledger)}")

    # ── Layer 2: Fuzzy match ─────────────────────────────────────────────────
    t2 = time.monotonic()
    fuzzy_matched, unmatched_pg, unmatched_bank, unmatched_ledger = run_fuzzy_match(
        unmatched_pg, unmatched_bank, unmatched_ledger
    )
    layer_timing["fuzzy"] = time.monotonic() - t2
    all_results.extend(fuzzy_matched)

    print(f"[Fuzzy]  matched={len(fuzzy_matched)}  "
          f"remaining PG={len(unmatched_pg)}  "
          f"bank={len(unmatched_bank)}  ledger={len(unmatched_ledger)}")

    # ── Layer 3: LLM match ───────────────────────────────────────────────────
    t3 = time.monotonic()
    if skip_llm:
        llm_matched  = []
        still_pg     = unmatched_pg
        still_bank   = unmatched_bank
        still_ledger = unmatched_ledger
    else:
        llm_matched, still_pg, still_bank, still_ledger = run_llm_match(
            unmatched_pg, unmatched_bank, unmatched_ledger
        )
    layer_timing["llm"] = time.monotonic() - t3
    all_results.extend(llm_matched)

    print(f"[LLM]    matched={len(llm_matched)}  "
          f"remaining PG={len(still_pg)}  "
          f"bank={len(still_bank)}  ledger={len(still_ledger)}")

    # ── Exception categorization ─────────────────────────────────────────────
    t4 = time.monotonic()
    exceptions = build_exceptions(still_pg, still_bank, still_ledger)
    layer_timing["exceptions"] = time.monotonic() - t4
    all_results.extend(exceptions)

    print(f"[Exceptions] count={len(exceptions)}")

    # ── Metrics & self-grading ───────────────────────────────────────────────
    total_secs = time.monotonic() - t0
    gt_file    = Path(gt_dir) / "ground_truth.json"

    metrics = compute_metrics(
        results      = all_results,
        n_pg         = n_pg,
        n_bank       = n_bank,
        n_ledger     = n_ledger,
        total_secs   = total_secs,
        layer_timing = layer_timing,
        gt_path      = gt_file if gt_file.exists() else None,
    )

    print(
        f"\n{'='*55}\n"
        f"  Run {run_id} complete\n"
        f"  Match rate : {metrics.match_rate_pct}%\n"
        f"  Exact      : {metrics.matched_exact}\n"
        f"  Fuzzy      : {metrics.matched_fuzzy}\n"
        f"  LLM        : {metrics.matched_llm}\n"
        f"  Exceptions : {metrics.exceptions}\n"
        f"  Precision  : {metrics.precision}\n"
        f"  Recall     : {metrics.recall}\n"
        f"  F1         : {metrics.f1}\n"
        f"  Time       : {total_secs:.2f}s  ({metrics.records_per_sec} rec/s)\n"
        f"{'='*55}"
    )

    return RunResult(
        run_id  = run_id,
        status  = "completed",
        results = all_results,
        metrics = metrics,
    )
