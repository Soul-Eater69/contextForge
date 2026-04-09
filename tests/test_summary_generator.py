from ingestion.summary_generator import SUMMARY_OUTPUT_FIELDS, SummaryGenerator


def test_build_prompt_includes_operational_signal_guidance():
    prompt = SummaryGenerator().build_prompt("Example source text")
    assert "price changes" in prompt
    assert "inquiry handling" in prompt
    assert "invoice" in prompt
    assert "partner onboarding" in prompt
    assert "downstream implications" in prompt


def test_normalize_summary_preserves_shape_and_blocks_taxonomy_labels():
    generator = SummaryGenerator()
    payload = {
        "business_objective": "Improve quoting and billing",
        "commercial_pricing_signals": ["quote/bid language"],
        "explicit_terms": ["market parity", "value_stream:Configure, Price, and Quote"],
    }
    normalized = generator.normalize_summary(payload)

    assert set(SUMMARY_OUTPUT_FIELDS) == set(normalized.keys())
    assert normalized["commercial_pricing_signals"] == ["quote/bid language"]
    assert normalized["downstream_implications"] == []
    assert normalized["explicit_terms"] == ["market parity"]
