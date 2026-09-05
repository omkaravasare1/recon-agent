"""
ReconAgent — Synthetic Data Generator
======================================
Generates three realistic, messy data sources for reconciliation testing:
  1. PG Settlement file      (pg_settlements.csv)
  2. Bank statement           (bank_statement.csv)
  3. Internal order ledger    (order_ledger.csv)

Also writes ground_truth.json — a hidden mapping used only for self-grading.

Run:
    python -m app.generate_data [--seed 42] [--records 200] [--out-dir data/generated]

Design goals
------------
- ~70 % clean 1:1 exact matches (matched on transaction_id / utr_number)
- ~10 % timing-lag records (bank credit 1-3 days late)
- ~7  % partial settlements (1 order → 2 payouts)
- ~5  % fee/TDS amount delta records
- ~3  % rounding differences (±₹1-2)
- ~3  % duplicate entries in one source
- ~2  % missing transaction_id in ledger (fuzzy-only)
- ~3-5 % genuine true anomalies — NOT matchable by any correct system
"""

import argparse
import json
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from faker import Faker

fake = Faker("en_IN")

# ── helpers ──────────────────────────────────────────────────────────────────

def new_txn_id() -> str:
    return f"TXN{uuid.uuid4().hex[:10].upper()}"


def new_utr() -> str:
    return f"UTR{random.randint(10**11, 10**12 - 1)}"


def new_order_id() -> str:
    return f"ORD{uuid.uuid4().hex[:8].upper()}"


def new_customer_id() -> str:
    return f"CUST{random.randint(1000, 9999)}"


def random_amount(lo=500, hi=50_000) -> float:
    return round(random.uniform(lo, hi), 2)


def random_date(start: datetime, days_range: int = 30) -> datetime:
    return start + timedelta(days=random.randint(0, days_range))


def compute_fee_tds(gross: float) -> tuple[float, float, float]:
    """Return (fee, tds, net).  fee = 2% of gross, TDS = 10% of fee."""
    fee = round(gross * 0.02, 2)
    tds = round(fee * 0.10, 2)
    net = round(gross - fee - tds, 2)
    return fee, tds, net


def garble_narration(utr: str, amount: float) -> str:
    templates = [
        f"NEFT/{utr}/RAZORPAY",
        f"IMPS {utr[:8]}*** {amount:.0f}",
        f"CR {utr[-6:]} RZRPY",
        f"RTGS/{utr}/RZP SETTL",
        f"INW-{utr[:6]}-RAZORPAY PAYMENTS",
        f"NEFT-{utr}-RZP",          # occasionally clean
    ]
    narration = random.choice(templates)
    # 15 % chance of truncation
    if random.random() < 0.15:
        narration = narration[: random.randint(8, len(narration) - 1)] + "…"
    return narration


# ── main generator ────────────────────────────────────────────────────────────

def generate(
    seed: int = 42,
    n_base: int = 200,
    out_dir: str = "data/generated",
    gt_dir: str = "data/ground_truth",
) -> None:
    random.seed(seed)
    np.random.seed(seed)
    fake.seed_instance(seed)

    out_path = Path(out_dir)
    gt_path = Path(gt_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    gt_path.mkdir(parents=True, exist_ok=True)

    base_date = datetime(2024, 3, 1)

    # ── bucket sizes (fixed counts, anomalies guaranteed ≥ 6) ────────────
    n_exact       = int(n_base * 0.68)   # clean exact matches
    n_timing      = int(n_base * 0.09)   # bank credit delayed
    n_partial     = int(n_base * 0.06)   # partial settlements (even number → pairs)
    n_partial     = n_partial if n_partial % 2 == 0 else n_partial - 1
    n_fee_delta   = int(n_base * 0.05)   # gross vs net confusion
    n_rounding    = int(n_base * 0.03)   # ±₹1-2 rounding
    n_duplicate   = int(n_base * 0.02)   # duplicate entries
    n_missing_tid = int(n_base * 0.02)   # no transaction_id in ledger
    n_anomaly     = max(6, n_base - (
        n_exact + n_timing + n_partial + n_fee_delta +
        n_rounding + n_duplicate + n_missing_tid
    ))                                    # true anomalies — guaranteed ≥ 6

    print(f"Generating {n_base} base records  (seed={seed})")
    print(f"  exact={n_exact}, timing={n_timing}, partial={n_partial}, "
          f"fee_delta={n_fee_delta}, rounding={n_rounding}, "
          f"duplicate={n_duplicate}, missing_tid={n_missing_tid}, "
          f"anomaly={n_anomaly}")

    pg_rows:     list[dict] = []
    bank_rows:   list[dict] = []
    ledger_rows: list[dict] = []

    # ground truth: list of {type, pg_ids, bank_ids, ledger_ids, notes}
    gt: list[dict] = []

    # ── 1. EXACT MATCHES ────────────────────────────────────────────────────
    for _ in range(n_exact):
        txn_id  = new_txn_id()
        utr     = new_utr()
        gross   = random_amount()
        fee, tds, net = compute_fee_tds(gross)
        sdate   = random_date(base_date)
        order_id    = new_order_id()
        customer_id = new_customer_id()

        pg_rows.append({
            "transaction_id": txn_id,
            "gross_amount": gross,
            "fee": fee,
            "tds": tds,
            "net_amount": net,
            "settlement_date": sdate.strftime("%Y-%m-%d"),
            "utr_number": utr,
        })
        bank_rows.append({
            "utr_number": utr,
            "credit_amount": net,
            "credit_date": sdate.strftime("%Y-%m-%d"),
            "narration": garble_narration(utr, net),
        })
        ledger_rows.append({
            "order_id": order_id,
            "transaction_id": txn_id,
            "order_amount": gross,
            "order_date": sdate.strftime("%Y-%m-%d"),
            "customer_id": customer_id,
        })
        gt.append({
            "type": "exact",
            "pg_ids": [txn_id],
            "bank_utrs": [utr],
            "ledger_order_ids": [order_id],
            "notes": "clean 1:1 exact match",
        })

    # ── 2. TIMING LAG ────────────────────────────────────────────────────────
    for _ in range(n_timing):
        txn_id  = new_txn_id()
        utr     = new_utr()
        gross   = random_amount()
        fee, tds, net = compute_fee_tds(gross)
        sdate   = random_date(base_date)
        lag     = timedelta(days=random.randint(1, 3))
        order_id    = new_order_id()
        customer_id = new_customer_id()

        pg_rows.append({
            "transaction_id": txn_id,
            "gross_amount": gross,
            "fee": fee,
            "tds": tds,
            "net_amount": net,
            "settlement_date": sdate.strftime("%Y-%m-%d"),
            "utr_number": utr,
        })
        bank_rows.append({
            "utr_number": utr,
            "credit_amount": net,
            "credit_date": (sdate + lag).strftime("%Y-%m-%d"),  # ← delayed
            "narration": garble_narration(utr, net),
        })
        ledger_rows.append({
            "order_id": order_id,
            "transaction_id": txn_id,
            "order_amount": gross,
            "order_date": sdate.strftime("%Y-%m-%d"),
            "customer_id": customer_id,
        })
        gt.append({
            "type": "timing_lag",
            "pg_ids": [txn_id],
            "bank_utrs": [utr],
            "ledger_order_ids": [order_id],
            "notes": f"bank credit delayed by {lag.days} day(s)",
        })

    # ── 3. PARTIAL SETTLEMENTS (1 order → 2 PG payouts) ─────────────────────
    n_partial_orders = n_partial // 2
    for _ in range(n_partial_orders):
        order_id    = new_order_id()
        customer_id = new_customer_id()
        total_gross = random_amount(2000, 50_000)
        split1      = round(total_gross * random.uniform(0.4, 0.6), 2)
        split2      = round(total_gross - split1, 2)
        odate       = random_date(base_date)

        payout_pg_ids  = []
        payout_utrs    = []

        for split in [split1, split2]:
            txn_id = new_txn_id()
            utr    = new_utr()
            fee, tds, net = compute_fee_tds(split)
            sdate  = odate + timedelta(days=random.randint(0, 1))

            pg_rows.append({
                "transaction_id": txn_id,
                "gross_amount": split,
                "fee": fee,
                "tds": tds,
                "net_amount": net,
                "settlement_date": sdate.strftime("%Y-%m-%d"),
                "utr_number": utr,
            })
            bank_rows.append({
                "utr_number": utr,
                "credit_amount": net,
                "credit_date": sdate.strftime("%Y-%m-%d"),
                "narration": garble_narration(utr, net),
            })
            payout_pg_ids.append(txn_id)
            payout_utrs.append(utr)

        ledger_rows.append({
            "order_id": order_id,
            "transaction_id": None,           # ← no single txn_id
            "order_amount": total_gross,
            "order_date": odate.strftime("%Y-%m-%d"),
            "customer_id": customer_id,
        })
        gt.append({
            "type": "partial_settlement",
            "pg_ids": payout_pg_ids,
            "bank_utrs": payout_utrs,
            "ledger_order_ids": [order_id],
            "notes": f"1 order split into 2 payouts ({split1} + {split2} = {total_gross})",
        })

    # ── 4. FEE/TDS AMOUNT DELTA ──────────────────────────────────────────────
    for _ in range(n_fee_delta):
        txn_id  = new_txn_id()
        utr     = new_utr()
        gross   = random_amount()
        fee, tds, net = compute_fee_tds(gross)
        sdate   = random_date(base_date)
        order_id    = new_order_id()
        customer_id = new_customer_id()

        pg_rows.append({
            "transaction_id": txn_id,
            "gross_amount": gross,
            "fee": fee,
            "tds": tds,
            "net_amount": net,
            "settlement_date": sdate.strftime("%Y-%m-%d"),
            "utr_number": utr,
        })
        bank_rows.append({
            "utr_number": utr,
            "credit_amount": net,
            "credit_date": sdate.strftime("%Y-%m-%d"),
            "narration": garble_narration(utr, net),
        })
        # Ledger records gross (before fee/TDS deduction) — common data-entry mistake
        ledger_rows.append({
            "order_id": order_id,
            "transaction_id": txn_id,
            "order_amount": gross,   # ← gross, not net (intentional delta)
            "order_date": sdate.strftime("%Y-%m-%d"),
            "customer_id": customer_id,
        })
        gt.append({
            "type": "fee_delta",
            "pg_ids": [txn_id],
            "bank_utrs": [utr],
            "ledger_order_ids": [order_id],
            "notes": f"ledger has gross={gross}, bank received net={net} (delta={round(gross-net,2)})",
        })

    # ── 5. ROUNDING DIFFERENCES ──────────────────────────────────────────────
    for _ in range(n_rounding):
        txn_id  = new_txn_id()
        utr     = new_utr()
        gross   = random_amount()
        fee, tds, net = compute_fee_tds(gross)
        sdate   = random_date(base_date)
        order_id    = new_order_id()
        customer_id = new_customer_id()
        rounding_delta = round(random.uniform(-2, 2), 2)

        pg_rows.append({
            "transaction_id": txn_id,
            "gross_amount": gross,
            "fee": fee,
            "tds": tds,
            "net_amount": net,
            "settlement_date": sdate.strftime("%Y-%m-%d"),
            "utr_number": utr,
        })
        bank_rows.append({
            "utr_number": utr,
            "credit_amount": round(net + rounding_delta, 2),  # ← rounded differently
            "credit_date": sdate.strftime("%Y-%m-%d"),
            "narration": garble_narration(utr, net),
        })
        ledger_rows.append({
            "order_id": order_id,
            "transaction_id": txn_id,
            "order_amount": gross,
            "order_date": sdate.strftime("%Y-%m-%d"),
            "customer_id": customer_id,
        })
        gt.append({
            "type": "rounding",
            "pg_ids": [txn_id],
            "bank_utrs": [utr],
            "ledger_order_ids": [order_id],
            "notes": f"rounding diff={rounding_delta}",
        })

    # ── 6. DUPLICATE ENTRIES ─────────────────────────────────────────────────
    for _ in range(n_duplicate):
        txn_id  = new_txn_id()
        utr     = new_utr()
        gross   = random_amount()
        fee, tds, net = compute_fee_tds(gross)
        sdate   = random_date(base_date)
        order_id    = new_order_id()
        customer_id = new_customer_id()

        pg_row = {
            "transaction_id": txn_id,
            "gross_amount": gross,
            "fee": fee,
            "tds": tds,
            "net_amount": net,
            "settlement_date": sdate.strftime("%Y-%m-%d"),
            "utr_number": utr,
        }
        pg_rows.append(pg_row)
        pg_rows.append(dict(pg_row))   # ← duplicate in PG file

        bank_rows.append({
            "utr_number": utr,
            "credit_amount": net,
            "credit_date": sdate.strftime("%Y-%m-%d"),
            "narration": garble_narration(utr, net),
        })
        ledger_rows.append({
            "order_id": order_id,
            "transaction_id": txn_id,
            "order_amount": gross,
            "order_date": sdate.strftime("%Y-%m-%d"),
            "customer_id": customer_id,
        })
        gt.append({
            "type": "duplicate",
            "pg_ids": [txn_id, txn_id],  # same ID appears twice
            "bank_utrs": [utr],
            "ledger_order_ids": [order_id],
            "notes": "duplicate PG row — one is spurious",
        })

    # ── 7. MISSING TRANSACTION_ID (fuzzy-only) ───────────────────────────────
    for _ in range(n_missing_tid):
        txn_id  = new_txn_id()
        utr     = new_utr()
        gross   = random_amount()
        fee, tds, net = compute_fee_tds(gross)
        sdate   = random_date(base_date)
        order_id    = new_order_id()
        customer_id = new_customer_id()

        pg_rows.append({
            "transaction_id": txn_id,
            "gross_amount": gross,
            "fee": fee,
            "tds": tds,
            "net_amount": net,
            "settlement_date": sdate.strftime("%Y-%m-%d"),
            "utr_number": utr,
        })
        bank_rows.append({
            "utr_number": utr,
            "credit_amount": net,
            "credit_date": sdate.strftime("%Y-%m-%d"),
            "narration": garble_narration(utr, net),
        })
        ledger_rows.append({
            "order_id": order_id,
            "transaction_id": None,   # ← intentionally missing
            "order_amount": gross,
            "order_date": sdate.strftime("%Y-%m-%d"),
            "customer_id": customer_id,
        })
        gt.append({
            "type": "missing_tid",
            "pg_ids": [txn_id],
            "bank_utrs": [utr],
            "ledger_order_ids": [order_id],
            "notes": "ledger transaction_id is null — must fuzzy-match on amount+date+customer",
        })

    # ── 8. TRUE ANOMALIES (genuinely unresolvable) ───────────────────────────
    # PG has a settlement with no matching bank credit and no ledger entry
    for i in range(n_anomaly):
        txn_id = new_txn_id()
        utr    = new_utr()
        gross  = random_amount()
        fee, tds, net = compute_fee_tds(gross)
        sdate  = random_date(base_date)

        anomaly_type = i % 3
        if anomaly_type == 0:
            # PG record with no bank / ledger match at all
            pg_rows.append({
                "transaction_id": txn_id,
                "gross_amount": gross,
                "fee": fee,
                "tds": tds,
                "net_amount": net,
                "settlement_date": sdate.strftime("%Y-%m-%d"),
                "utr_number": utr,
            })
            gt.append({
                "type": "true_anomaly",
                "pg_ids": [txn_id],
                "bank_utrs": [],
                "ledger_order_ids": [],
                "notes": "PG record with no bank or ledger counterpart",
            })
        elif anomaly_type == 1:
            # Bank credit with unknown UTR / no PG record
            orphan_utr = new_utr()
            bank_rows.append({
                "utr_number": orphan_utr,
                "credit_amount": random_amount(100, 5000),
                "credit_date": sdate.strftime("%Y-%m-%d"),
                "narration": f"UNKNOWN/{orphan_utr}/ERR",
            })
            gt.append({
                "type": "true_anomaly",
                "pg_ids": [],
                "bank_utrs": [orphan_utr],
                "ledger_order_ids": [],
                "notes": "Bank credit with no matching PG settlement",
            })
        else:
            # Ledger entry with corrupted / wrong amount — PG exists but amounts wildly off
            order_id    = new_order_id()
            customer_id = new_customer_id()
            pg_rows.append({
                "transaction_id": txn_id,
                "gross_amount": gross,
                "fee": fee,
                "tds": tds,
                "net_amount": net,
                "settlement_date": sdate.strftime("%Y-%m-%d"),
                "utr_number": utr,
            })
            corrupted_amount = round(gross * random.uniform(3, 10), 2)  # wildly different
            ledger_rows.append({
                "order_id": order_id,
                "transaction_id": txn_id,   # ID matches but amount is garbage
                "order_amount": corrupted_amount,
                "order_date": sdate.strftime("%Y-%m-%d"),
                "customer_id": customer_id,
            })
            gt.append({
                "type": "true_anomaly",
                "pg_ids": [txn_id],
                "bank_utrs": [],
                "ledger_order_ids": [order_id],
                "notes": f"Corrupted ledger amount ({corrupted_amount}) vs PG gross ({gross})",
            })

    # ── shuffle all three files independently ────────────────────────────────
    random.shuffle(pg_rows)
    random.shuffle(bank_rows)
    random.shuffle(ledger_rows)

    # ── write CSVs ───────────────────────────────────────────────────────────
    pg_df     = pd.DataFrame(pg_rows)
    bank_df   = pd.DataFrame(bank_rows)
    ledger_df = pd.DataFrame(ledger_rows)

    pg_df.to_csv(out_path / "pg_settlements.csv", index=False)
    bank_df.to_csv(out_path / "bank_statement.csv", index=False)
    ledger_df.to_csv(out_path / "order_ledger.csv", index=False)

    # ── write ground truth ───────────────────────────────────────────────────
    gt_meta = {
        "seed": seed,
        "n_base": n_base,
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "bucket_counts": {
            "exact": n_exact,
            "timing_lag": n_timing,
            "partial_settlement": n_partial_orders,
            "fee_delta": n_fee_delta,
            "rounding": n_rounding,
            "duplicate": n_duplicate,
            "missing_tid": n_missing_tid,
            "true_anomaly": n_anomaly,
        },
        "records": gt,
    }
    with open(gt_path / "ground_truth.json", "w") as f:
        json.dump(gt_meta, f, indent=2)

    print(f"\nFiles written to {out_path}/")
    print(f"  pg_settlements.csv  : {len(pg_df)} rows")
    print(f"  bank_statement.csv  : {len(bank_df)} rows")
    print(f"  order_ledger.csv    : {len(ledger_df)} rows")
    print(f"Ground truth written to {gt_path}/ground_truth.json")
    print(f"  {len(gt)} ground-truth mappings")
    print("\nBucket breakdown:")
    for k, v in gt_meta["bucket_counts"].items():
        print(f"  {k:<25} {v}")


# ── CLI entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic reconciliation data")
    parser.add_argument("--seed",    type=int, default=42,             help="Random seed")
    parser.add_argument("--records", type=int, default=200,            help="Base record count")
    parser.add_argument("--out-dir", type=str, default="data/generated",   help="Output directory")
    parser.add_argument("--gt-dir",  type=str, default="data/ground_truth", help="Ground truth dir")
    args = parser.parse_args()

    generate(
        seed=args.seed,
        n_base=args.records,
        out_dir=args.out_dir,
        gt_dir=args.gt_dir,
    )
