"""
Shared data models for the reconciliation pipeline.
All layers produce and consume these types.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class MatchLayer(str, Enum):
    EXACT = "exact"
    FUZZY = "fuzzy"
    LLM   = "llm"


class MatchStatus(str, Enum):
    MATCHED   = "matched"
    EXCEPTION = "exception"


class ExceptionCategory(str, Enum):
    TIMING_PENDING              = "timing_pending"
    AMOUNT_MISMATCH_UNEXPLAINED = "amount_mismatch_unexplained"
    DUPLICATE_SUSPECTED         = "duplicate_suspected"
    MISSING_SOURCE_DATA         = "missing_source_data"
    TRUE_ANOMALY                = "true_anomaly"


class Confidence(str, Enum):
    HIGH   = "high"
    MEDIUM = "medium"
    LOW    = "low"


@dataclass
class PGRecord:
    transaction_id:  str
    gross_amount:    float
    fee:             float
    tds:             float
    net_amount:      float
    settlement_date: str          # YYYY-MM-DD
    utr_number:      str
    row_index:       int = 0      # original CSV row for dedup tracking


@dataclass
class BankRecord:
    utr_number:    str
    credit_amount: float
    credit_date:   str            # YYYY-MM-DD
    narration:     str
    row_index:     int = 0


@dataclass
class LedgerRecord:
    order_id:       str
    transaction_id: Optional[str]  # can be None
    order_amount:   float
    order_date:     str            # YYYY-MM-DD
    customer_id:    str
    row_index:      int = 0


@dataclass
class AuditStep:
    """One layer's attempt at matching a record."""
    layer:      MatchLayer
    attempted:  bool
    success:    bool
    confidence: Optional[Confidence] = None
    reasoning:  str = ""
    delta_amount: Optional[float] = None
    delta_days:   Optional[int]   = None


@dataclass
class MatchResult:
    """Final result for one logical reconciliation unit."""
    record_id:    str                    # synthetic ID for this result row
    status:       MatchStatus

    # Source record references (by key)
    pg_txn_ids:       list[str] = field(default_factory=list)
    bank_utrs:        list[str] = field(default_factory=list)
    ledger_order_ids: list[str] = field(default_factory=list)

    # Resolution
    layer:      Optional[MatchLayer]       = None
    confidence: Optional[Confidence]       = None
    exception_category: Optional[ExceptionCategory] = None
    exception_reason:   str = ""

    # Amounts for display
    pg_gross:      Optional[float] = None
    pg_net:        Optional[float] = None
    bank_credit:   Optional[float] = None
    ledger_amount: Optional[float] = None

    # Dates
    pg_date:     Optional[str] = None
    bank_date:   Optional[str] = None
    ledger_date: Optional[str] = None

    # Full audit trail
    audit_trail: list[AuditStep] = field(default_factory=list)

    # LLM reasoning text (if applicable)
    llm_reasoning: str = ""
