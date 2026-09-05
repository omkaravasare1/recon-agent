"""
Layer 1 — Exact Match
======================
Matches records using direct key equality:
  - PG ↔ Bank:   utr_number exact match
  - PG ↔ Ledger: transaction_id exact match

A "full match" requires all three sources to link to the same PG record.
Partial links (PG↔Bank only, or PG↔Ledger only) are passed to later layers.

Returns:
  matched  — list[MatchResult]  (fully resolved here)
  unmatched_pg     — PG records not yet fully resolved
  unmatched_bank   — Bank records not consumed
  unmatched_ledger — Ledger records not consumed
"""

from __future__ import annotations

import uuid
from typing import Optional

from .models import (
    AuditStep, BankRecord, Confidence, LedgerRecord, MatchLayer,
    MatchResult, MatchStatus, PGRecord,
)


def run_exact_match(
    pg_records:     list[PGRecord],
    bank_records:   list[BankRecord],
    ledger_records: list[LedgerRecord],
) -> tuple[
    list[MatchResult],   # matched
    list[PGRecord],      # unmatched PG
    list[BankRecord],    # unmatched bank
    list[LedgerRecord],  # unmatched ledger
]:
    # ── index sources ────────────────────────────────────────────────────────
    # Bank: utr → BankRecord  (first occurrence wins; duplicates flagged later)
    bank_by_utr:   dict[str, BankRecord]   = {}
    bank_dupe_utrs: set[str]               = set()
    for b in bank_records:
        if b.utr_number in bank_by_utr:
            bank_dupe_utrs.add(b.utr_number)
        else:
            bank_by_utr[b.utr_number] = b

    # Ledger: transaction_id → LedgerRecord (None-tid records skipped here)
    ledger_by_tid: dict[str, LedgerRecord] = {}
    ledger_no_tid: list[LedgerRecord]      = []
    for l in ledger_records:
        if l.transaction_id:
            ledger_by_tid[l.transaction_id] = l
        else:
            ledger_no_tid.append(l)

    matched:          list[MatchResult]   = []
    consumed_bank:    set[str]            = set()   # utr_numbers
    consumed_ledger:  set[str]            = set()   # order_ids
    unmatched_pg:     list[PGRecord]      = []

    # Track PG transaction_ids seen so far — detect PG duplicates
    pg_seen_tids: dict[str, PGRecord] = {}

    for pg in pg_records:
        audit: list[AuditStep] = []

        # ── duplicate PG detection ───────────────────────────────────────────
        if pg.transaction_id in pg_seen_tids:
            audit.append(AuditStep(
                layer     = MatchLayer.EXACT,
                attempted = True,
                success   = False,
                reasoning = f"Duplicate PG entry: transaction_id {pg.transaction_id} already seen",
            ))
            unmatched_pg.append(pg)
            continue
        pg_seen_tids[pg.transaction_id] = pg

        # ── attempt bank match (via UTR) ─────────────────────────────────────
        bank_rec: Optional[BankRecord] = bank_by_utr.get(pg.utr_number)
        bank_hit = bank_rec is not None and pg.utr_number not in consumed_bank

        # ── attempt ledger match (via transaction_id) ────────────────────────
        ledger_rec: Optional[LedgerRecord] = ledger_by_tid.get(pg.transaction_id)
        ledger_hit = ledger_rec is not None and (
            ledger_rec.order_id not in consumed_ledger
        )

        if bank_hit and ledger_hit:
            # Full 3-way exact match
            consumed_bank.add(pg.utr_number)
            consumed_ledger.add(ledger_rec.order_id)  # type: ignore[union-attr]

            audit.append(AuditStep(
                layer      = MatchLayer.EXACT,
                attempted  = True,
                success    = True,
                confidence = Confidence.HIGH,
                reasoning  = (
                    f"3-way exact match: "
                    f"PG txn={pg.transaction_id}, "
                    f"Bank UTR={pg.utr_number}, "
                    f"Ledger order={ledger_rec.order_id}"  # type: ignore[union-attr]
                ),
            ))
            matched.append(MatchResult(
                record_id         = str(uuid.uuid4()),
                status            = MatchStatus.MATCHED,
                pg_txn_ids        = [pg.transaction_id],
                bank_utrs         = [pg.utr_number],
                ledger_order_ids  = [ledger_rec.order_id],  # type: ignore[union-attr]
                layer             = MatchLayer.EXACT,
                confidence        = Confidence.HIGH,
                pg_gross          = pg.gross_amount,
                pg_net            = pg.net_amount,
                bank_credit       = bank_rec.credit_amount,  # type: ignore[union-attr]
                ledger_amount     = ledger_rec.order_amount,  # type: ignore[union-attr]
                pg_date           = pg.settlement_date,
                bank_date         = bank_rec.credit_date,  # type: ignore[union-attr]
                ledger_date       = ledger_rec.order_date,  # type: ignore[union-attr]
                audit_trail       = audit,
            ))
        else:
            # Partial or no match — pass to fuzzy layer
            reason_parts = []
            if not bank_hit:
                reason_parts.append(
                    f"No bank UTR match for {pg.utr_number}"
                    if bank_rec is None
                    else f"Bank UTR {pg.utr_number} already consumed"
                )
            if not ledger_hit:
                reason_parts.append(
                    f"No ledger txn match for {pg.transaction_id}"
                    if ledger_rec is None
                    else f"Ledger order {ledger_rec.order_id} already consumed"  # type: ignore
                )
            audit.append(AuditStep(
                layer     = MatchLayer.EXACT,
                attempted = True,
                success   = False,
                reasoning = "; ".join(reason_parts),
            ))
            # Carry partial context into the unmatched record
            pg._bank_partial   = bank_rec if bank_hit else None   # type: ignore[attr-defined]
            pg._ledger_partial = ledger_rec if ledger_hit else None  # type: ignore[attr-defined]
            pg._audit_so_far   = audit  # type: ignore[attr-defined]
            unmatched_pg.append(pg)

    # ── collect unconsumed bank / ledger records ──────────────────────────
    unmatched_bank = [
        b for b in bank_records
        if b.utr_number not in consumed_bank
        and b.utr_number not in bank_dupe_utrs   # dupes handled as exceptions later
    ]
    unmatched_ledger = [
        l for l in ledger_records
        if (l.order_id not in consumed_ledger) and l not in ledger_no_tid
    ] + ledger_no_tid  # include no-tid records for fuzzy

    return matched, unmatched_pg, unmatched_bank, unmatched_ledger
