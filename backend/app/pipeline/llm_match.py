"""
Layer 3 — LLM-Assisted Match (Google Gemini, free tier)
=========================================================
Called for records that survive both exact and fuzzy layers.

For each unresolved PG record, we:
  1. Build a compact JSON prompt with the PG record + top-5 candidate
     bank/ledger records ranked by amount proximity.
  2. Ask Gemini to reason about the best match (or "no match") and return
     structured JSON: {match: bool, bank_utr, ledger_order_id, confidence,
     reasoning}.
  3. Parse the response and record the LLM's reasoning in the audit trail.

Rate limiting: Gemini free tier allows 15 req/min. We respect this with a
simple token-bucket / sleep strategy.
"""

from __future__ import annotations

import json
import re
import time
import uuid
from typing import Optional

from google import genai
from google.genai import types as genai_types

from ..config import settings
from .models import (
    AuditStep, BankRecord, Confidence, LedgerRecord, MatchLayer,
    MatchResult, MatchStatus, PGRecord,
)

# ── rate limiting ────────────────────────────────────────────────────────────
_REQ_PER_MIN   = 14        # stay slightly under the 15 rpm free limit
_MIN_INTERVAL  = 60 / _REQ_PER_MIN   # ~4.3 seconds between calls
_last_call_ts: float = 0.0


def _rate_limit() -> None:
    global _last_call_ts
    elapsed = time.monotonic() - _last_call_ts
    if elapsed < _MIN_INTERVAL:
        time.sleep(_MIN_INTERVAL - elapsed)
    _last_call_ts = time.monotonic()


# ── Gemini client ─────────────────────────────────────────────────────────────
def _get_client():
    if not settings.gemini_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY not set. "
            "Get a free key at https://aistudio.google.com/app/apikey "
            "and add it to backend/.env"
        )
    return genai.Client(api_key=settings.gemini_api_key)


# ── candidate selection ───────────────────────────────────────────────────────
def _top_bank_candidates(
    pg: PGRecord,
    bank_records: list[BankRecord],
    consumed_bank: set[str],
    n: int = 5,
) -> list[BankRecord]:
    """Return top-N bank candidates sorted by amount proximity to pg.net_amount."""
    free = [b for b in bank_records if b.utr_number not in consumed_bank]
    return sorted(free, key=lambda b: abs(b.credit_amount - pg.net_amount))[:n]


def _top_ledger_candidates(
    pg: PGRecord,
    ledger_records: list[LedgerRecord],
    consumed_ledger: set[str],
    n: int = 5,
) -> list[LedgerRecord]:
    free = [l for l in ledger_records if l.order_id not in consumed_ledger]
    return sorted(free, key=lambda l: abs(l.order_amount - pg.gross_amount))[:n]


# ── prompt builder ────────────────────────────────────────────────────────────
def _build_prompt(
    pg: PGRecord,
    bank_candidates: list[BankRecord],
    ledger_candidates: list[LedgerRecord],
) -> str:
    pg_dict = {
        "transaction_id":  pg.transaction_id,
        "gross_amount":    pg.gross_amount,
        "net_amount":      pg.net_amount,
        "fee":             pg.fee,
        "tds":             pg.tds,
        "settlement_date": pg.settlement_date,
        "utr_number":      pg.utr_number,
    }
    bank_list = [
        {
            "utr_number":    b.utr_number,
            "credit_amount": b.credit_amount,
            "credit_date":   b.credit_date,
            "narration":     b.narration,
        }
        for b in bank_candidates
    ]
    ledger_list = [
        {
            "order_id":       l.order_id,
            "transaction_id": l.transaction_id,
            "order_amount":   l.order_amount,
            "order_date":     l.order_date,
            "customer_id":    l.customer_id,
        }
        for l in ledger_candidates
    ]

    return f"""You are a financial reconciliation engine.

A Payment Gateway (PG) settlement record could not be matched automatically.
Your task: decide which bank statement record and ledger record (if any) best match the PG record.

## PG Settlement Record
{json.dumps(pg_dict, indent=2)}

## Bank Statement Candidates (top 5 by amount proximity)
{json.dumps(bank_list, indent=2)}

## Order Ledger Candidates (top 5 by amount proximity)
{json.dumps(ledger_list, indent=2)}

## Instructions
- The PG net_amount should equal the bank credit_amount (after fee/TDS deductions).
- The PG gross_amount should approximately equal the ledger order_amount.
- Date differences up to 3 days are acceptable (timing lag).
- If no reasonable bank match exists, set bank_utr to null.
- If no reasonable ledger match exists, set ledger_order_id to null.
- If neither matches, set match to false.

## Response format (JSON only, no extra text)
{{
  "match": true | false,
  "bank_utr": "<utr_number or null>",
  "ledger_order_id": "<order_id or null>",
  "confidence": "high" | "medium" | "low",
  "reasoning": "<one or two sentences explaining your decision>"
}}"""


# ── response parser ───────────────────────────────────────────────────────────
def _parse_llm_response(text: str) -> Optional[dict]:
    """Extract JSON from the LLM response, tolerating markdown fences."""
    # Strip ```json ... ``` fences if present
    text = re.sub(r"```(?:json)?", "", text).strip().rstrip("`").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find the first {...} block
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return None


# ── main entry point ──────────────────────────────────────────────────────────
def run_llm_match(
    unmatched_pg:     list[PGRecord],
    unmatched_bank:   list[BankRecord],
    unmatched_ledger: list[LedgerRecord],
) -> tuple[
    list[MatchResult],   # newly matched by LLM
    list[PGRecord],      # still unmatched (→ exceptions)
    list[BankRecord],    # still unmatched bank
    list[LedgerRecord],  # still unmatched ledger
]:
    if not unmatched_pg:
        return [], [], unmatched_bank, unmatched_ledger

    # Check if LLM is configured — skip gracefully if not
    if not settings.gemini_api_key:
        print("[LLM layer] GEMINI_API_KEY not set — skipping LLM layer, "
              "all remaining records will be classified as exceptions.")
        return [], unmatched_pg, unmatched_bank, unmatched_ledger

    try:
        client = _get_client()
    except Exception as e:
        print(f"[LLM layer] Could not initialise Gemini: {e} — skipping.")
        return [], unmatched_pg, unmatched_bank, unmatched_ledger

    matched:          list[MatchResult]  = []
    consumed_pg:      set[str]           = set()
    consumed_bank:    set[str]           = set()
    consumed_ledger:  set[str]           = set()

    for pg in unmatched_pg:
        if pg.transaction_id in consumed_pg:
            continue

        bank_cands   = _top_bank_candidates(pg, unmatched_bank, consumed_bank)
        ledger_cands = _top_ledger_candidates(pg, unmatched_ledger, consumed_ledger)

        if not bank_cands and not ledger_cands:
            # Nothing to match against — leave for exception layer
            continue

        prompt = _build_prompt(pg, bank_cands, ledger_cands)

        try:
            _rate_limit()
            response = client.models.generate_content(
                model=settings.llm_model,
                contents=prompt,
            )
            raw_text = response.text
        except Exception as e:
            prior_audit = getattr(pg, "_audit_so_far", [])
            prior_audit.append(AuditStep(
                layer     = MatchLayer.LLM,
                attempted = True,
                success   = False,
                reasoning = f"LLM call failed: {e}",
            ))
            pg._audit_so_far = prior_audit  # type: ignore[attr-defined]
            continue

        parsed = _parse_llm_response(raw_text)
        prior_audit = getattr(pg, "_audit_so_far", [])

        if not parsed or not parsed.get("match"):
            prior_audit.append(AuditStep(
                layer     = MatchLayer.LLM,
                attempted = True,
                success   = False,
                reasoning = parsed.get("reasoning", raw_text[:300]) if parsed else raw_text[:300],
            ))
            pg._audit_so_far = prior_audit  # type: ignore[attr-defined]
            continue

        # ── LLM said match ───────────────────────────────────────────────
        conf_map = {"high": Confidence.HIGH, "medium": Confidence.MEDIUM, "low": Confidence.LOW}
        conf     = conf_map.get(str(parsed.get("confidence", "")).lower(), Confidence.LOW)
        bank_utr = parsed.get("bank_utr")
        ledger_oid = parsed.get("ledger_order_id")
        reasoning  = parsed.get("reasoning", "")

        matched_bank   = next((b for b in bank_cands   if b.utr_number == bank_utr),   None)
        matched_ledger = next((l for l in ledger_cands if l.order_id  == ledger_oid), None)

        prior_audit.append(AuditStep(
            layer      = MatchLayer.LLM,
            attempted  = True,
            success    = True,
            confidence = conf,
            reasoning  = reasoning,
            delta_amount = round(
                (matched_bank.credit_amount - pg.net_amount) if matched_bank else 0, 2
            ),
        ))

        consumed_pg.add(pg.transaction_id)
        if matched_bank:
            consumed_bank.add(matched_bank.utr_number)
        if matched_ledger:
            consumed_ledger.add(matched_ledger.order_id)

        matched.append(MatchResult(
            record_id        = str(uuid.uuid4()),
            status           = MatchStatus.MATCHED,
            pg_txn_ids       = [pg.transaction_id],
            bank_utrs        = [matched_bank.utr_number]   if matched_bank   else [],
            ledger_order_ids = [matched_ledger.order_id]   if matched_ledger else [],
            layer            = MatchLayer.LLM,
            confidence       = conf,
            pg_gross         = pg.gross_amount,
            pg_net           = pg.net_amount,
            bank_credit      = matched_bank.credit_amount  if matched_bank   else None,
            ledger_amount    = matched_ledger.order_amount if matched_ledger else None,
            pg_date          = pg.settlement_date,
            bank_date        = matched_bank.credit_date    if matched_bank   else None,
            ledger_date      = matched_ledger.order_date   if matched_ledger else None,
            audit_trail      = prior_audit,
            llm_reasoning    = reasoning,
        ))

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
