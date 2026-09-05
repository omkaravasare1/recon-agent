"""
Metrics & Self-Grading
=======================
Compares the pipeline's output against the hidden ground truth to produce:
  - Match rate % (overall + per layer)
  - Precision / Recall on "correct match" decisions
  - LLM layer accuracy specifically
  - Processing time / throughput
  - Per-layer breakdown counts
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .models import ExceptionCategory, MatchLayer, MatchResult, MatchStatus


@dataclass
class LayerMetrics:
    layer:      str
    matched:    int = 0
    correct:    int = 0    # matched AND ground-truth says it's a valid match
    incorrect:  int = 0    # matched BUT ground-truth says different partner or no match


@dataclass
class ReconciliationMetrics:
    # Counts
    total_pg_records:   int = 0
    total_bank_records: int = 0
    total_ledger_records: int = 0

    matched_exact:  int = 0
    matched_fuzzy:  int = 0
    matched_llm:    int = 0
    exceptions:     int = 0

    # Exception breakdown
    exception_counts: dict[str, int] = field(default_factory=dict)

    # Self-grading (vs ground truth)
    ground_truth_available: bool = False
    precision:      Optional[float] = None   # TP / (TP + FP)
    recall:         Optional[float] = None   # TP / (TP + FN)
    f1:             Optional[float] = None
    llm_precision:  Optional[float] = None
    llm_recall:     Optional[float] = None

    # Timing
    total_seconds:   float = 0.0
    records_per_sec: float = 0.0

    layer_timing: dict[str, float] = field(default_factory=dict)

    # Derived
    @property
    def total_records(self) -> int:
        return self.total_pg_records

    @property
    def matched_total(self) -> int:
        return self.matched_exact + self.matched_fuzzy + self.matched_llm

    @property
    def match_rate_pct(self) -> float:
        if self.total_records == 0:
            return 0.0
        return round(self.matched_total / self.total_records * 100, 2)

    def to_dict(self) -> dict:
        return {
            "total_pg_records":    self.total_pg_records,
            "total_bank_records":  self.total_bank_records,
            "total_ledger_records": self.total_ledger_records,
            "matched_exact":       self.matched_exact,
            "matched_fuzzy":       self.matched_fuzzy,
            "matched_llm":         self.matched_llm,
            "matched_total":       self.matched_total,
            "exceptions":          self.exceptions,
            "match_rate_pct":      self.match_rate_pct,
            "exception_counts":    self.exception_counts,
            "ground_truth_available": self.ground_truth_available,
            "precision":           self.precision,
            "recall":              self.recall,
            "f1":                  self.f1,
            "llm_precision":       self.llm_precision,
            "llm_recall":          self.llm_recall,
            "total_seconds":       round(self.total_seconds, 3),
            "records_per_sec":     round(self.records_per_sec, 1),
            "layer_timing":        {k: round(v, 3) for k, v in self.layer_timing.items()},
        }


def compute_metrics(
    results:     list[MatchResult],
    n_pg:        int,
    n_bank:      int,
    n_ledger:    int,
    total_secs:  float,
    layer_timing: dict[str, float],
    gt_path:     Optional[str | Path] = None,
) -> ReconciliationMetrics:
    m = ReconciliationMetrics(
        total_pg_records      = n_pg,
        total_bank_records    = n_bank,
        total_ledger_records  = n_ledger,
        total_seconds         = total_secs,
        records_per_sec       = round(n_pg / total_secs, 1) if total_secs > 0 else 0.0,
        layer_timing          = layer_timing,
    )

    # Count by layer and exceptions
    for r in results:
        if r.status == MatchStatus.MATCHED:
            if r.layer == MatchLayer.EXACT:
                m.matched_exact += 1
            elif r.layer == MatchLayer.FUZZY:
                m.matched_fuzzy += 1
            elif r.layer == MatchLayer.LLM:
                m.matched_llm += 1
        else:
            m.exceptions += 1
            cat = r.exception_category.value if r.exception_category else "unknown"
            m.exception_counts[cat] = m.exception_counts.get(cat, 0) + 1

    # Self-grading
    if gt_path and Path(gt_path).exists():
        m.ground_truth_available = True
        _grade_against_ground_truth(m, results, gt_path)

    return m


def _grade_against_ground_truth(
    m:        ReconciliationMetrics,
    results:  list[MatchResult],
    gt_path:  str | Path,
) -> None:
    """
    Compare pipeline decisions against ground truth.

    Ground truth record structure (from generate_data.py):
    {
      "type": "exact" | "timing_lag" | "partial_settlement" | ... | "true_anomaly",
      "pg_ids": [...],
      "bank_utrs": [...],
      "ledger_order_ids": [...],
    }

    A pipeline "match" decision is a True Positive if:
      - At least one pg_id in the result matches a pg_id in a GT record
        AND that GT record's type is NOT "true_anomaly"
      - The matched bank UTR or ledger order_id is in the GT record

    A "match" is a False Positive if:
      - The GT record for those pg_ids is "true_anomaly" (should NOT be matched)
      - Or the matched partner IDs are wrong

    A "no match" (exception) is a True Negative if GT type IS "true_anomaly".
    A "no match" is a False Negative if GT type is NOT "true_anomaly".
    """
    with open(gt_path) as f:
        gt_data = json.load(f)

    gt_records = gt_data.get("records", [])

    # Build lookup: pg_id → gt_record
    gt_by_pg: dict[str, dict] = {}
    for gtr in gt_records:
        for pg_id in gtr.get("pg_ids", []):
            gt_by_pg[pg_id] = gtr

    tp = fp = fn = tn = 0
    llm_tp = llm_fp = llm_fn = 0

    for result in results:
        is_match_decision = result.status == MatchStatus.MATCHED
        is_llm = result.layer == MatchLayer.LLM

        # Find the GT record for this result's primary PG ID
        primary_pg = result.pg_txn_ids[0] if result.pg_txn_ids else None
        gtr = gt_by_pg.get(primary_pg) if primary_pg else None

        if gtr is None:
            # No GT record for this PG ID — can't evaluate
            continue

        gt_is_anomaly = gtr.get("type") == "true_anomaly"

        if is_match_decision:
            if gt_is_anomaly:
                # Matched something that should NOT be matched
                fp += 1
                if is_llm:
                    llm_fp += 1
            else:
                # Check if the partner IDs are correct
                gt_bank_utrs  = set(gtr.get("bank_utrs", []))
                gt_ledger_ids = set(gtr.get("ledger_order_ids", []))
                result_bank   = set(result.bank_utrs)
                result_ledger = set(result.ledger_order_ids)

                # Accept if there's any overlap in the matched IDs
                bank_ok   = not gt_bank_utrs  or bool(result_bank  & gt_bank_utrs)
                ledger_ok = not gt_ledger_ids or bool(result_ledger & gt_ledger_ids)

                if bank_ok and ledger_ok:
                    tp += 1
                    if is_llm:
                        llm_tp += 1
                else:
                    fp += 1
                    if is_llm:
                        llm_fp += 1
        else:
            # No-match decision (exception)
            if gt_is_anomaly:
                tn += 1   # correctly flagged as anomaly
            else:
                fn += 1   # missed a valid match
                if is_llm:
                    llm_fn += 1

    # Overall precision / recall
    m.precision = round(tp / (tp + fp), 4) if (tp + fp) > 0 else None
    m.recall    = round(tp / (tp + fn), 4) if (tp + fn) > 0 else None
    if m.precision is not None and m.recall is not None and (m.precision + m.recall) > 0:
        m.f1 = round(
            2 * m.precision * m.recall / (m.precision + m.recall), 4
        )

    # LLM-specific
    m.llm_precision = round(llm_tp / (llm_tp + llm_fp), 4) if (llm_tp + llm_fp) > 0 else None
    m.llm_recall    = round(llm_tp / (llm_tp + llm_fn), 4) if (llm_tp + llm_fn) > 0 else None
