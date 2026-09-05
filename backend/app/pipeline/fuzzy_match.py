"""
Layer 2 — Rule-Based Fuzzy Match
==================================
Applied to records that survived the exact-match layer.

Rules applied (in order):
  R1. Amount tolerance — net_amount vs credit_amount within ±2 %
      (covers fee/TDS deductions and rounding)
  R2. Date tolerance — settlement_date vs credit_date within ±3 days
  R3. Partial settlement — sum of N PG net_amounts matches 1 ledger order_amount (±2 %)
  R4. Fuzzy ledger match for null-tid records — match on amount+date proximity

Each match produces a rule-based confidence score:
  HIGH   — amount diff < 1 %, date diff ≤ 1 day
  MEDIUM — amount diff < 2 %, date diff ≤ 3 days
  LOW    — passes tolerance but at the edge
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from itertools import combinations
from typing import Optional

from .models import (
    AuditStep, BankRecord, Confidence, LedgerRecord, MatchLayer,
    MatchResult, MatchStatus, PGRecord,
)


# ── tolerance constants ──────────────────────────────────────────────────────
AMOUNT_TOLERANCE_PCT = 0.02   # 2 %
DATE_TOLERANCE_DAYS  = 3


def _parse_date(s: str) -> Optional[date]:
    try:
        return date.fromisoformat(s)
    except (ValueError, AttributeError):
        return None


def _amount_diff_pct(a: float, b: float) -> float:
    if b == 0:
        return float("inf")
    return abs(a - b) / abs(b)


def _date_diff_days(d1: str, d2: str) -> Optional[int]:
    pd1, pd2 = _parse_date(d1), _parse_date(d2)
    if pd1 is None or pd2 is None:
        return None
    return abs((pd1 - pd2).days)


def _confidence_from_deltas(amt_pct: float, days: Optional[int]) -> Confidence:
    if amt_pct < 0.01 and (days is None or days <= 1):
        return Confidence.HIGH
    if amt_pct < 0.02 and (days is None or days <= 3):
        return Confidence.MEDIUM
    return Confidence.LOW


def run_fuzzy_match(
    unmatched_pg:     list[PGRecord],
    unmatched_bank:   list[BankRecord],
    unmatched_ledger: list[LedgerRecord],
) -> tuple[
    list[MatchResult],   # newly matched
    list[PGRecord],      # still unmatched PG
    list[BankRecord],    # still unmatched bank
    list[LedgerRecord],  # still unmatched ledger
]:
    matched:          list[MatchResult]   = []
    consumed_pg:      set[str]            = set()  # transaction_ids
    consumed_bank:    set[str]            = set()  # utr_numbers
    consumed_ledger:  set[str]            = set()  # order_ids

    # ── index remaining bank by UTR for O(1) lookup ──────────────────────
    bank_by_utr = {b.utr_number: b for b in unmatched_bank}

    # ── R1+R2: PG ↔ Bank amount+date fuzzy, then attach ledger ──────────
    for pg in unmatched_pg:
        if pg.transaction_id in consumed_pg:
            continue

        # Try bank match via UTR first (already have UTR on PG)
        bank_rec = bank_by_utr.get(pg.utr_number)
        if bank_rec and bank_rec.utr_number not in consumed_bank:
            amt_pct  = _amount_diff_pct(bank_rec.credit_amount, pg.net_amount)
            days_off = _date_diff_days(pg.settlement_date, bank_rec.credit_date)

            if amt_pct <= AMOUNT_TOLERANCE_PCT and (days_off is None or days_off <= DATE_TOLERANCE_DAYS):
                conf = _confidence_from_deltas(amt_pct, days_off)

                # Try to find a matching ledger record
                ledger_rec = _find_ledger_match(pg, unmatched_ledger, consumed_ledger)

                prior_audit = getattr(pg, "_audit_so_far", [])
                prior_audit.append(AuditStep(
                    layer        = MatchLayer.FUZZY,
                    attempted    = True,
                    success      = True,
                    confidence   = conf,
                    delta_amount = round(bank_rec.credit_amount - pg.net_amount, 2),
                    delta_days   = days_off,
                    reasoning    = (
                        f"Fuzzy PG↔Bank: amount_diff={amt_pct*100:.2f}% "
                        f"({pg.net_amount}→{bank_rec.credit_amount}), "
                        f"date_diff={days_off}d"
                        + (f", Ledger matched via {'tid' if pg.transaction_id else 'amount+date'}"
                           if ledger_rec else ", no ledger match (passed to LLM)")
                    ),
                ))

                consumed_pg.add(pg.transaction_id)
                consumed_bank.add(bank_rec.utr_number)
                if ledger_rec:
                    consumed_ledger.add(ledger_rec.order_id)

                matched.append(MatchResult(
                    record_id        = str(uuid.uuid4()),
                    status           = MatchStatus.MATCHED,
                    pg_txn_ids       = [pg.transaction_id],
                    bank_utrs        = [bank_rec.utr_number],
                    ledger_order_ids = [ledger_rec.order_id] if ledger_rec else [],
                    layer            = MatchLayer.FUZZY,
                    confidence       = conf,
                    pg_gross         = pg.gross_amount,
                    pg_net           = pg.net_amount,
                    bank_credit      = bank_rec.credit_amount,
                    ledger_amount    = ledger_rec.order_amount if ledger_rec else None,
                    pg_date          = pg.settlement_date,
                    bank_date        = bank_rec.credit_date,
                    ledger_date      = ledger_rec.order_date if ledger_rec else None,
                    audit_trail      = prior_audit,
                ))

    # ── R3: Partial settlement — sum of 2 PG payouts = 1 ledger order ────
    remaining_pg = [
        pg for pg in unmatched_pg
        if pg.transaction_id not in consumed_pg
    ]
    remaining_ledger = [
        l for l in unmatched_ledger
        if l.order_id not in consumed_ledger
    ]

    partial_matches = _match_partial_settlements(
        remaining_pg, remaining_ledger, bank_by_utr,
        consumed_pg, consumed_bank, consumed_ledger,
    )
    matched.extend(partial_matches)

    # ── collect still-unmatched ───────────────────────────────────────────
    still_unmatched_pg = [
        pg for pg in unmatched_pg
        if pg.transaction_id not in consumed_pg
    ]
    still_unmatched_bank = [
        b for b in unmatched_bank
        if b.utr_number not in consumed_bank
    ]
    still_unmatched_ledger = [
        l for l in unmatched_ledger
        if l.order_id not in consumed_ledger
    ]

    return matched, still_unmatched_pg, still_unmatched_bank, still_unmatched_ledger


def _find_ledger_match(
    pg:               PGRecord,
    ledger_records:   list[LedgerRecord],
    consumed_ledger:  set[str],
) -> Optional[LedgerRecord]:
    """Try to match a PG record to a ledger record."""
    for l in ledger_records:
        if l.order_id in consumed_ledger:
            continue
        # Direct tid match
        if l.transaction_id and l.transaction_id == pg.transaction_id:
            consumed_ledger.add(l.order_id)
            return l
        # Fuzzy: amount within 2%, date within 3 days (handles gross vs net)
        amt_pct  = _amount_diff_pct(l.order_amount, pg.gross_amount)
        days_off = _date_diff_days(pg.settlement_date, l.order_date)
        if amt_pct <= AMOUNT_TOLERANCE_PCT and (days_off is None or days_off <= DATE_TOLERANCE_DAYS):
            consumed_ledger.add(l.order_id)
            return l
    return None


def _match_partial_settlements(
    pg_records:      list[PGRecord],
    ledger_records:  list[LedgerRecord],
    bank_by_utr:     dict[str, BankRecord],
    consumed_pg:     set[str],
    consumed_bank:   set[str],
    consumed_ledger: set[str],
) -> list[MatchResult]:
    """
    Try to match pairs of PG payouts whose sum equals a single ledger order.
    Only considers pairs (N=2) for now — covers the generator's split pattern.
    """
    results: list[MatchResult] = []

    free_pg = [p for p in pg_records if p.transaction_id not in consumed_pg]

    for ledger in ledger_records:
        if ledger.order_id in consumed_ledger:
            continue
        target = ledger.order_amount

        # Look for a pair of PG records whose gross sums ≈ ledger order_amount
        for pg_a, pg_b in combinations(free_pg, 2):
            if pg_a.transaction_id in consumed_pg or pg_b.transaction_id in consumed_pg:
                continue
            combo_gross = pg_a.gross_amount + pg_b.gross_amount
            combo_net   = pg_a.net_amount   + pg_b.net_amount
            # Match on gross or net sum
            if (
                _amount_diff_pct(combo_gross, target) <= AMOUNT_TOLERANCE_PCT
                or _amount_diff_pct(combo_net,   target) <= AMOUNT_TOLERANCE_PCT
            ):
                days_a = _date_diff_days(ledger.order_date, pg_a.settlement_date)
                days_b = _date_diff_days(ledger.order_date, pg_b.settlement_date)
                max_days = max(d for d in [days_a, days_b] if d is not None) if any(
                    d is not None for d in [days_a, days_b]
                ) else None

                bank_utrs = []
                for pg in [pg_a, pg_b]:
                    bank_rec = bank_by_utr.get(pg.utr_number)
                    if bank_rec and bank_rec.utr_number not in consumed_bank:
                        bank_utrs.append(bank_rec.utr_number)
                        consumed_bank.add(bank_rec.utr_number)

                consumed_pg.add(pg_a.transaction_id)
                consumed_pg.add(pg_b.transaction_id)
                consumed_ledger.add(ledger.order_id)

                conf = _confidence_from_deltas(
                    _amount_diff_pct(combo_gross, target), max_days
                )
                results.append(MatchResult(
                    record_id        = str(uuid.uuid4()),
                    status           = MatchStatus.MATCHED,
                    pg_txn_ids       = [pg_a.transaction_id, pg_b.transaction_id],
                    bank_utrs        = bank_utrs,
                    ledger_order_ids = [ledger.order_id],
                    layer            = MatchLayer.FUZZY,
                    confidence       = conf,
                    pg_gross         = combo_gross,
                    pg_net           = combo_net,
                    ledger_amount    = target,
                    ledger_date      = ledger.order_date,
                    audit_trail      = [AuditStep(
                        layer      = MatchLayer.FUZZY,
                        attempted  = True,
                        success    = True,
                        confidence = conf,
                        reasoning  = (
                            f"Partial settlement: "
                            f"{pg_a.transaction_id}+{pg_b.transaction_id} "
                            f"gross_sum={combo_gross} ≈ ledger_order={target} "
                            f"(diff={_amount_diff_pct(combo_gross,target)*100:.2f}%)"
                        ),
                    )],
                ))
                break  # move to next ledger record

    return results
