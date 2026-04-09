"""Final selection chain prompt and deterministic fallback formatter."""

from __future__ import annotations

from typing import Any, Dict, List


FINAL_SELECTOR_PROMPT = """
You are receiving candidates that have already been reranked by taxonomy policy.

Your job is NOT to invent new labels or re-run taxonomy policy.

Only:
- classify the provided candidates into directly_supported, pattern_inferred, or no_evidence
- preserve canonical names exactly as given
- keep concise evidence reasons
- do not resurrect suppressed candidates
- do not add candidates that were not passed in
- prefer fewer, stronger outputs over many weak outputs
""".strip()


def build_finalize_prompt(candidates: List[Dict[str, Any]]) -> str:
    return f"{FINAL_SELECTOR_PROMPT}\n\nCandidates: {candidates}"


def finalize_selection(candidates: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Deterministic formatter for candidates already thresholded upstream."""
    grouped: Dict[str, List[Dict[str, Any]]] = {
        "directly_supported": [],
        "pattern_inferred": [],
        "no_evidence": [],
    }
    for candidate in candidates:
        bucket = str(candidate.get("bucket", "no_evidence"))
        normalized_bucket = (
            bucket if bucket in grouped else "no_evidence"
        )
        grouped[normalized_bucket].append(
            {
                "entity_name": candidate.get("entity_name", ""),
                "decision_reason": candidate.get("decision_reason", ""),
            }
        )
    return grouped
