from graph.nodes import filter_reranked_candidates_for_final_selection


def _candidate(**overrides):
    base = {
        "entity_name": "Candidate",
        "bucket": "directly_supported",
        "confidence": 0.7,
        "fused_score": 0.7,
        "eligibility_score": 0.7,
        "historical_support_present": False,
        "bundle_support_present": False,
        "downstream_support_present": False,
        "downstream_promoted": False,
        "decision_reason": "supported",
    }
    base.update(overrides)
    return base


def test_direct_candidate_above_threshold_survives():
    survivors = filter_reranked_candidates_for_final_selection([
        _candidate(entity_name="Direct", bucket="directly_supported", eligibility_score=0.50),
    ])
    assert [c["entity_name"] for c in survivors] == ["Direct"]


def test_pattern_candidate_below_threshold_dropped():
    survivors = filter_reranked_candidates_for_final_selection([
        _candidate(entity_name="Pattern", bucket="pattern_inferred", eligibility_score=0.57),
    ])
    assert survivors == []


def test_broad_candidate_below_broad_threshold_dropped():
    survivors = filter_reranked_candidates_for_final_selection([
        _candidate(entity_name="Broad", bucket="directly_supported", eligibility_score=0.61, broad=True),
    ])
    assert survivors == []


def test_downstream_exception_survives():
    survivors = filter_reranked_candidates_for_final_selection([
        _candidate(
            entity_name="Issue Payment",
            bucket="no_evidence",
            eligibility_score=0.47,
            downstream_support_present=True,
            historical_support_present=True,
        ),
    ])
    assert [c["entity_name"] for c in survivors] == ["Issue Payment"]


def test_suppressed_candidate_never_survives():
    survivors = filter_reranked_candidates_for_final_selection([
        _candidate(entity_name="Suppressed", suppressed=True, eligibility_score=0.99),
    ])
    assert survivors == []


def test_top_n_guardrail_applies_after_thresholds():
    candidates = [
        _candidate(entity_name=f"Direct {i}", bucket="directly_supported", eligibility_score=0.9 - i * 0.01)
        for i in range(8)
    ] + [
        _candidate(entity_name="Pattern low", bucket="pattern_inferred", eligibility_score=0.5)
    ]

    survivors = filter_reranked_candidates_for_final_selection(candidates, max_final_labels=6)
    assert len(survivors) == 6
    assert all(c["entity_name"].startswith("Direct") for c in survivors)
