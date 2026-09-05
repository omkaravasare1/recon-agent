"""
FastAPI route handlers for ReconAgent.

Endpoints:
  POST /reconcile/run                        — start a run (async, returns run_id)
  GET  /reconcile/{run_id}/status            — poll progress
  GET  /reconcile/{run_id}/results           — full results + metrics
  GET  /reconcile/{run_id}/record/{record_id} — single record audit trail
  GET  /reconcile/{run_id}/export            — exception CSV download
"""
from __future__ import annotations

import asyncio
import csv
import io
import threading
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..config import settings
from ..pipeline.models import MatchResult, MatchStatus
from ..pipeline.orchestrator import run_pipeline
from .schemas import (
    AuditStepOut,
    MatchResultOut,
    MetricsOut,
    RunCreatedOut,
    RunResultOut,
    RunStatusOut,
)
from .store import RunEntry, create_run, get_run, new_run_id, update_run, write_audit_log

router = APIRouter(prefix="/reconcile", tags=["reconcile"])


# ── helpers ──────────────────────────────────────────────────────────────────

def _to_result_out(r: MatchResult) -> MatchResultOut:
    return MatchResultOut(
        record_id          = r.record_id,
        status             = r.status.value,
        pg_txn_ids         = r.pg_txn_ids,
        bank_utrs          = r.bank_utrs,
        ledger_order_ids   = r.ledger_order_ids,
        layer              = r.layer.value if r.layer else None,
        confidence         = r.confidence.value if r.confidence else None,
        exception_category = r.exception_category.value if r.exception_category else None,
        exception_reason   = r.exception_reason,
        pg_gross           = r.pg_gross,
        pg_net             = r.pg_net,
        bank_credit        = r.bank_credit,
        ledger_amount      = r.ledger_amount,
        pg_date            = r.pg_date,
        bank_date          = r.bank_date,
        ledger_date        = r.ledger_date,
        llm_reasoning      = r.llm_reasoning,
        audit_trail        = [
            AuditStepOut(
                layer        = s.layer.value,
                attempted    = s.attempted,
                success      = s.success,
                confidence   = s.confidence.value if s.confidence else None,
                reasoning    = s.reasoning,
                delta_amount = s.delta_amount,
                delta_days   = s.delta_days,
            )
            for s in r.audit_trail
        ],
    )


def _to_metrics_out(m) -> MetricsOut:
    return MetricsOut(**m.to_dict())


# ── background pipeline runner ────────────────────────────────────────────────

def _run_pipeline_bg(run_id: str, skip_llm: bool) -> None:
    entry = get_run(run_id)
    if not entry:
        return
    entry.status   = "running"
    entry.progress = 10
    update_run(entry)

    try:
        result = run_pipeline(
            run_id   = run_id,
            data_dir = settings.data_dir,
            gt_dir   = settings.ground_truth_dir,
            skip_llm = skip_llm,
        )
        entry.status   = "completed"
        entry.progress = 100
        entry.result   = result
        update_run(entry)

        # Write audit log to disk
        write_audit_log(run_id, result, settings.logs_dir)

    except Exception as exc:
        entry.status  = "failed"
        entry.message = str(exc)
        update_run(entry)
        raise


# ── routes ────────────────────────────────────────────────────────────────────

@router.post("/run", response_model=RunCreatedOut, status_code=202)
async def start_run(
    background_tasks: BackgroundTasks,
    skip_llm: bool = Query(default=False, description="Skip LLM layer (faster, no API key needed)"),
):
    """Trigger a reconciliation run. Returns a run_id to poll for results."""
    run_id = new_run_id()
    create_run(run_id)
    background_tasks.add_task(_run_pipeline_bg, run_id, skip_llm)
    return RunCreatedOut(run_id=run_id)


@router.get("/{run_id}/status", response_model=RunStatusOut)
async def get_status(run_id: str):
    """Poll run progress (0-100 %)."""
    entry = get_run(run_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return RunStatusOut(
        run_id   = run_id,
        status   = entry.status,
        progress = entry.progress,
        message  = entry.message,
    )


@router.get("/{run_id}/results", response_model=RunResultOut)
async def get_results(run_id: str):
    """Full results: all matches + exceptions + metrics."""
    entry = get_run(run_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    if entry.status not in ("completed", "failed"):
        raise HTTPException(status_code=202, detail=f"Run is still {entry.status}")
    if entry.status == "failed":
        raise HTTPException(status_code=500, detail=entry.message)

    result = entry.result
    return RunResultOut(
        run_id  = run_id,
        status  = entry.status,
        metrics = _to_metrics_out(result.metrics) if result and result.metrics else None,
        results = [_to_result_out(r) for r in result.results] if result else [],
    )


@router.get("/{run_id}/record/{record_id}", response_model=MatchResultOut)
async def get_record(run_id: str, record_id: str):
    """Drill into a single record's full audit trail."""
    entry = get_run(run_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    if not entry.result:
        raise HTTPException(status_code=202, detail="Run not yet complete")

    for r in entry.result.results:
        if r.record_id == record_id:
            return _to_result_out(r)

    raise HTTPException(status_code=404, detail=f"Record {record_id} not found in run {run_id}")


@router.get("/{run_id}/export")
async def export_exceptions(run_id: str):
    """Download exception list as CSV."""
    entry = get_run(run_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    if not entry.result:
        raise HTTPException(status_code=202, detail="Run not yet complete")

    exceptions = [r for r in entry.result.results if r.status == MatchStatus.EXCEPTION]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "record_id", "exception_category", "exception_reason",
        "pg_txn_ids", "bank_utrs", "ledger_order_ids",
        "pg_gross", "pg_net", "bank_credit", "ledger_amount",
        "pg_date", "bank_date", "ledger_date",
    ])
    writer.writeheader()
    for r in exceptions:
        writer.writerow({
            "record_id":          r.record_id,
            "exception_category": r.exception_category.value if r.exception_category else "",
            "exception_reason":   r.exception_reason,
            "pg_txn_ids":         "|".join(r.pg_txn_ids),
            "bank_utrs":          "|".join(r.bank_utrs),
            "ledger_order_ids":   "|".join(r.ledger_order_ids),
            "pg_gross":           r.pg_gross or "",
            "pg_net":             r.pg_net or "",
            "bank_credit":        r.bank_credit or "",
            "ledger_amount":      r.ledger_amount or "",
            "pg_date":            r.pg_date or "",
            "bank_date":          r.bank_date or "",
            "ledger_date":        r.ledger_date or "",
        })

    output.seek(0)
    filename = f"exceptions_{run_id[:8]}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
