"""
In-memory run store + audit log writer.
Keeps the last N runs in RAM; writes structured JSON audit logs to disk.
"""
from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from ..pipeline.models import MatchResult, MatchStatus
from ..pipeline.orchestrator import RunResult


@dataclass
class RunEntry:
    run_id:    str
    status:    str             # queued | running | completed | failed
    progress:  int = 0
    message:   str = ""
    result:    Optional[RunResult] = None
    started_at: str = ""
    ended_at:   str = ""


# Single global store — fine for a single-process server / demo
_runs: dict[str, RunEntry] = {}
_MAX_RUNS = 20


def new_run_id() -> str:
    return str(uuid.uuid4())


def create_run(run_id: str) -> RunEntry:
    entry = RunEntry(
        run_id     = run_id,
        status     = "queued",
        started_at = datetime.now(timezone.utc).isoformat(),
    )
    _runs[run_id] = entry
    # Evict oldest if over limit
    if len(_runs) > _MAX_RUNS:
        oldest = next(iter(_runs))
        del _runs[oldest]
    return entry


def get_run(run_id: str) -> Optional[RunEntry]:
    return _runs.get(run_id)


def update_run(entry: RunEntry) -> None:
    _runs[entry.run_id] = entry


def write_audit_log(run_id: str, result: RunResult, logs_dir: str) -> None:
    """Write a structured JSON audit log for this run."""
    Path(logs_dir).mkdir(parents=True, exist_ok=True)
    log_path = Path(logs_dir) / f"{run_id}.json"

    def _serialise_result(r: MatchResult) -> dict:
        return {
            "record_id":          r.record_id,
            "status":             r.status.value,
            "layer":              r.layer.value if r.layer else None,
            "confidence":         r.confidence.value if r.confidence else None,
            "exception_category": r.exception_category.value if r.exception_category else None,
            "exception_reason":   r.exception_reason,
            "pg_txn_ids":         r.pg_txn_ids,
            "bank_utrs":          r.bank_utrs,
            "ledger_order_ids":   r.ledger_order_ids,
            "pg_gross":           r.pg_gross,
            "pg_net":             r.pg_net,
            "bank_credit":        r.bank_credit,
            "ledger_amount":      r.ledger_amount,
            "pg_date":            r.pg_date,
            "bank_date":          r.bank_date,
            "ledger_date":        r.ledger_date,
            "llm_reasoning":      r.llm_reasoning,
            "audit_trail": [
                {
                    "layer":        s.layer.value,
                    "attempted":    s.attempted,
                    "success":      s.success,
                    "confidence":   s.confidence.value if s.confidence else None,
                    "reasoning":    s.reasoning,
                    "delta_amount": s.delta_amount,
                    "delta_days":   s.delta_days,
                }
                for s in r.audit_trail
            ],
        }

    log_doc = {
        "run_id":      run_id,
        "written_at":  datetime.now(timezone.utc).isoformat(),
        "metrics":     result.metrics.to_dict() if result.metrics else {},
        "results":     [_serialise_result(r) for r in result.results],
    }

    with open(log_path, "w") as f:
        json.dump(log_doc, f, indent=2)
