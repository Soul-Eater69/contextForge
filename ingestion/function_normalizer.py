"""Normalization helpers for ingestion stage."""

from __future__ import annotations

from typing import Any, Dict

from ingestion.summary_generator import SUMMARY_OUTPUT_FIELDS


def ensure_summary_shape(summary: Dict[str, Any]) -> Dict[str, Any]:
    """Backfill missing summary fields with deterministic defaults."""
    normalized = dict(summary)
    for field in SUMMARY_OUTPUT_FIELDS:
        if field in {"business_objective", "initiative_type"}:
            normalized.setdefault(field, "")
        else:
            normalized.setdefault(field, [])
    return normalized
