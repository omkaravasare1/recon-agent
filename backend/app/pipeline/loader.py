"""
Loads the three CSV sources into typed record lists.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from .models import PGRecord, BankRecord, LedgerRecord


def _safe_str(val: Any) -> str:
    if pd.isna(val):
        return ""
    return str(val).strip()


def _safe_float(val: Any) -> float:
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def load_pg(path: str | Path) -> list[PGRecord]:
    df = pd.read_csv(path, dtype=str)
    records = []
    for i, row in df.iterrows():
        records.append(PGRecord(
            transaction_id  = _safe_str(row["transaction_id"]),
            gross_amount    = _safe_float(row["gross_amount"]),
            fee             = _safe_float(row["fee"]),
            tds             = _safe_float(row["tds"]),
            net_amount      = _safe_float(row["net_amount"]),
            settlement_date = _safe_str(row["settlement_date"]),
            utr_number      = _safe_str(row["utr_number"]),
            row_index       = int(i),
        ))
    return records


def load_bank(path: str | Path) -> list[BankRecord]:
    df = pd.read_csv(path, dtype=str)
    records = []
    for i, row in df.iterrows():
        records.append(BankRecord(
            utr_number    = _safe_str(row["utr_number"]),
            credit_amount = _safe_float(row["credit_amount"]),
            credit_date   = _safe_str(row["credit_date"]),
            narration     = _safe_str(row["narration"]),
            row_index     = int(i),
        ))
    return records


def load_ledger(path: str | Path) -> list[LedgerRecord]:
    df = pd.read_csv(path, dtype=str)
    records = []
    for i, row in df.iterrows():
        tid = _safe_str(row.get("transaction_id", ""))
        records.append(LedgerRecord(
            order_id       = _safe_str(row["order_id"]),
            transaction_id = tid if tid not in ("", "None", "nan") else None,
            order_amount   = _safe_float(row["order_amount"]),
            order_date     = _safe_str(row["order_date"]),
            customer_id    = _safe_str(row["customer_id"]),
            row_index      = int(i),
        ))
    return records
