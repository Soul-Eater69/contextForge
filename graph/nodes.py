"""Graph nodes for taxonomy-aware final selection."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List

from chains.selector_finalize_chain import finalize_selection


BUCKET_PRIORITY = {
    "directly_supported": 0,
    "pattern_inferred": 1,
    "no_evidence": 2,
}

BROAD_FAMILY_HINTS = {
    "strategy",
    "community health",
    "infrastructure",
    "it",
    "data",
    "analytics",
}


def _is_suppressed(candidate: Dict[str, Any]) -> bool:
    if candidate.get("suppressed") is True:
        return True
    return str(candidate.get("decision_reason", "")).lower().startswith("suppressed")


def _is_broad(candidate: Dict[str, Any]) -> bool:
    if candidate.get("broad") is True:
        return True
    family = str(candidate.get("family", "")).lower()
    return any(hint in family for hint in BROAD_FAMILY_HINTS)


def _support_strength(candidate: Dict[str, Any]) -> int:
    return int(bool(candidate.get("historical_support_present"))) + int(
        bool(candidate.get("bundle_support_present"))
    ) + int(bool(candidate.get("downstream_support_present")))


def _passes_thresholds(
    candidate: Dict[str, Any],
    *,
    direct_threshold: float,
    pattern_threshold: float,
    broad_threshold: float,
    downstream_exception_threshold: float,
) -> bool:
    eligibility = float(candidate.get("eligibility_score", 0.0))
    bucket = candidate.get("bucket", "no_evidence")

    if _is_broad(candidate):
        return eligibility >= broad_threshold

    if bucket == "directly_supported":
        return eligibility >= direct_threshold
    if bucket == "pattern_inferred":
        return eligibility >= pattern_threshold

    # Downstream exception for otherwise weak/no_evidence candidates.
    downstream_ok = bool(candidate.get("downstream_support_present"))
    corroborated = bool(candidate.get("historical_support_present")) or bool(
        candidate.get("bundle_support_present")
    )
    return (
        eligibility >= downstream_exception_threshold
        and downstream_ok
        and corroborated
    )


def filter_reranked_candidates_for_final_selection(
    reranked_candidates: List[Dict[str, Any]],
    *,
    direct_threshold: float = 0.50,
    pattern_threshold: float = 0.58,
    broad_threshold: float = 0.62,
    downstream_exception_threshold: float = 0.45,
    max_final_labels: int = 6,
) -> List[Dict[str, Any]]:
    """Apply deterministic filtering before final LLM formatting."""

    survivors = [
        c
        for c in reranked_candidates
        if not _is_suppressed(c)
        and _passes_thresholds(
            c,
            direct_threshold=direct_threshold,
            pattern_threshold=pattern_threshold,
            broad_threshold=broad_threshold,
            downstream_exception_threshold=downstream_exception_threshold,
        )
    ]

    survivors.sort(
        key=lambda c: (
            BUCKET_PRIORITY.get(str(c.get("bucket", "no_evidence")), 99),
            -float(c.get("eligibility_score", 0.0)),
            -float(c.get("fused_score", 0.0)),
            -_support_strength(c),
            int(_is_broad(c)),
        )
    )

    if len(survivors) <= max_final_labels:
        return survivors

    return survivors[:max_final_labels]


def node_finalize_selection(state: Dict[str, Any]) -> Dict[str, Any]:
    """Node entrypoint: threshold reranked candidates and then finalize buckets."""
    reranked_candidates = state.get("taxonomy_reranked_candidates", [])
    candidates_for_prompt = filter_reranked_candidates_for_final_selection(
        reranked_candidates
    )
    final_selection = finalize_selection(candidates_for_prompt)
    return {
        **state,
        "final_selection_candidates": candidates_for_prompt,
        "final_selection": final_selection,
    }
