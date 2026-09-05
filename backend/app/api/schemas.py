"""
Pydantic response schemas for the API layer.
These are the shapes the frontend receives — separate from internal pipeline models.
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel


class AuditStepOut(BaseModel):
    layer:        str
    attempted:    bool
    success:      bool
    confidence:   Optional[str] = None
    reasoning:    str = ""
    delta_amount: Optional[float] = None
    delta_days:   Optional[int]   = None


class MatchResultOut(BaseModel):
    record_id:          str
    status:             str          # "matched" | "exception"
    pg_txn_ids:         list[str]
    bank_utrs:          list[str]
    ledger_order_ids:   list[str]
    layer:              Optional[str] = None   # "exact" | "fuzzy" | "llm"
    confidence:         Optional[str] = None
    exception_category: Optional[str] = None
    exception_reason:   str = ""
    pg_gross:           Optional[float] = None
    pg_net:             Optional[float] = None
    bank_credit:        Optional[float] = None
    ledger_amount:      Optional[float] = None
    pg_date:            Optional[str]   = None
    bank_date:          Optional[str]   = None
    ledger_date:        Optional[str]   = None
    llm_reasoning:      str = ""
    audit_trail:        list[AuditStepOut] = []


class MetricsOut(BaseModel):
    total_pg_records:      int
    total_bank_records:    int
    total_ledger_records:  int
    matched_exact:         int
    matched_fuzzy:         int
    matched_llm:           int
    matched_total:         int
    exceptions:            int
    match_rate_pct:        float
    exception_counts:      dict[str, int]
    ground_truth_available: bool
    precision:             Optional[float] = None
    recall:                Optional[float] = None
    f1:                    Optional[float] = None
    llm_precision:         Optional[float] = None
    llm_recall:            Optional[float] = None
    total_seconds:         float
    records_per_sec:       float
    layer_timing:          dict[str, float]


class RunStatusOut(BaseModel):
    run_id:     str
    status:     str       # "queued" | "running" | "completed" | "failed"
    progress:   int = 0   # 0-100
    message:    str = ""


class RunResultOut(BaseModel):
    run_id:   str
    status:   str
    metrics:  Optional[MetricsOut]  = None
    results:  list[MatchResultOut]  = []


class RunCreatedOut(BaseModel):
    run_id: str
    message: str = "Reconciliation run queued"
