"""
Exception Categorization
=========================
Every unresolved record after all 3 layers gets one specific category —
never a generic "unmatched".

Categories:
  timing_pending              — amount matches but date diff > 3 days (likely in-transit)
  amount_mismatch_unexplained — amounts differ beyond any known deduction pattern
  duplicate_suspected         — same transaction_id / UTR appears more than once
  missing_source_data         — required field is null/empty
  true_anomaly                — no plausible match; flagged for manual investigation
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Optional

from .models import (
    AuditStep, BankRecord, Confidence, ExceptionCategory, LedgerRecord,
    MatchLayer, MatchResult, MatchStatus, PGRecord,
)

AMOUNT_TOLERANCE_PCT = 0.05   # 5 % — wider than fuzzy, still explainable
DATE_THRESHOLD_DAYS  = 3


def _parse_date(s: str) -> Optional[date]:
    try:
        return date.fromisoformat(s)
    except (ValueError, AttributeError):
        return None


def _amount_diff_pct(a: float, b: float) -> float:
    if b == 0:
        return float("inf")
    return abs(a - b) / abs(b)


def _categorize_pg(
    pg: PGRecord,
    unmatched_bank:   list[BankRecord],
    unmatched_ledger: list[LedgerRecord],
) -> tuple[ExceptionCategory, str]:
    """Determine exception category for an unresolved PG record."""

    # 1. Missing source data on PG itself
    if not pg.transaction_id or not pg.utr_number:
        return (
            ExceptionCategory.MISSING_SOURCE_DATA,
            f"PG record missing {'transaction_id' if not pg.transaction_id else 'utr_number'}",
        )

    # 2. Check if a bank record exists with the same UTR (timing issue)
    bank_match = next((b for b in unmatched_bank if b.utr_number == pg.utr_number), None)
    if bank_match:
        d_pg   = _parse_date(pg.settlement_date)
        d_bank = _parse_date(bank_match.credit_date)
        if d_pg and d_bank:
            diff = (d_bank - d_pg).days
            if diff > DATE_THRESHOLD_DAYS:
                return (
                    ExceptionCategory.TIMING_PENDING,
                    f"Bank UTR {pg.utr_number} found but credit date is {diff} day(s) after "
                    f"settlement ({pg.settlement_date} → {bank_match.credit_date}); "
                    "likely still in-transit",
                )

    # 3. Check if any bank record has a suspiciously close amount (unexplained delta)
    close_bank = min(
        unmatched_bank,
        key=lambda b: abs(b.credit_amount - pg.net_amount),
        default=None,
    )
    if close_bank:
        pct = _amount_diff_pct(close_bank.credit_amount, pg.net_amount)
        if pct <= AMOUNT_TOLERANCE_PCT:
            return (
                ExceptionCategory.AMOUNT_MISMATCH_UNEXPLAINED,
                f"Closest bank record {close_bank.utr_number} has credit_amount "
                f"{close_bank.credit_amount} vs PG net {pg.net_amount} "
                f"(diff={pct*100:.2f}%) — delta beyond fee/TDS pattern",
            )

    # 4. Duplicate signal — if PG txn_id appears with a bank record already matched
    #    (we can't check consumed here, so flag based on zero remaining candidates)
    if not unmatched_bank and not unmatched_ledger:
        return (
            ExceptionCategory.DUPLICATE_SUSPECTED,
            f"No unmatched bank or ledger records remain; "
            f"PG txn {pg.transaction_id} may be a duplicate",
        )

    # 5. True anomaly — everything else
    return (
        ExceptionCategory.TRUE_ANOMALY,
        f"No plausible match found for PG txn={pg.transaction_id} "
        f"(net={pg.net_amount}, date={pg.settlement_date}) after all 3 layers",
    )


def _categorize_orphan_bank(bank: BankRecord) -> tuple[ExceptionCategory, str]:
    if not bank.utr_number:
        return (
            ExceptionCategory.MISSING_SOURCE_DATA,
            "Bank record has no UTR number",
        )
    return (
        ExceptionCategory.TRUE_ANOMALY,
        f"Bank credit {bank.utr_number} (amount={bank.credit_amount}, "
        f"date={bank.credit_date}) has no matching PG settlement",
    )


def _categorize_orphan_ledger(ledger: LedgerRecord) -> tuple[ExceptionCategory, str]:
    if not ledger.transaction_id:
        return (
            ExceptionCategory.MISSING_SOURCE_DATA,
            f"Ledger order {ledger.order_id} has no transaction_id — "
            "cannot match without amount/date context from a PG record",
        )
    return (
        ExceptionCategory.TRUE_ANOMALY,
        f"Ledger order {ledger.order_id} (txn={ledger.transaction_id}, "
        f"amount={ledger.order_amount}) has no matching PG settlement",
    )


def build_exceptions(
    unmatched_pg:     list[PGRecord],
    unmatched_bank:   list[BankRecord],
    unmatched_ledger: list[LedgerRecord],
) -> list[MatchResult]:
    exceptions: list[MatchResult] = []

    for pg in unmatched_pg:
        prior_audit = getattr(pg, "_audit_so_far", [])
        cat, reason = _categorize_pg(pg, unmatched_bank, unmatched_ledger)
        prior_audit.append(AuditStep(
            layer     = MatchLayer.EXACT,    # placeholder — exception doesn't have its own layer
            attempted = False,
            success   = False,
            reasoning = f"[Exception] {cat.value}: {reason}",
        ))
        exceptions.append(MatchResult(
            record_id           = str(uuid.uuid4()),
            status              = MatchStatus.EXCEPTION,
            pg_txn_ids          = [pg.transaction_id] if pg.transaction_id else [],
            exception_category  = cat,
            exception_reason    = reason,
            pg_gross            = pg.gross_amount,
            pg_net              = pg.net_amount,
            pg_date             = pg.settlement_date,
            audit_trail         = prior_audit,
        ))

    for bank in unmatched_bank:
        cat, reason = _categorize_orphan_bank(bank)
        exceptions.append(MatchResult(
            record_id          = str(uuid.uuid4()),
            status             = MatchStatus.EXCEPTION,
            bank_utrs          = [bank.utr_number] if bank.utr_number else [],
            exception_category = cat,
            exception_reason   = reason,
            bank_credit        = bank.credit_amount,
            bank_date          = bank.credit_date,
            audit_trail        = [AuditStep(
                layer     = MatchLayer.EXACT,
                attempted = False,
                success   = False,
                reasoning = f"[Exception] {cat.value}: {reason}",
            )],
        ))

    for ledger in unmatched_ledger:
        cat, reason = _categorize_orphan_ledger(ledger)
        exceptions.append(MatchResult(
            record_id          = str(uuid.uuid4()),
            status             = MatchStatus.EXCEPTION,
            ledger_order_ids   = [ledger.order_id],
            exception_category = cat,
            exception_reason   = reason,
            ledger_amount      = ledger.order_amount,
            ledger_date        = ledger.order_date,
            audit_trail        = [AuditStep(
                layer     = MatchLayer.EXACT,
                attempted = False,
                success   = False,
                reasoning = f"[Exception] {cat.value}: {reason}",
            )],
        ))

    return exceptions
