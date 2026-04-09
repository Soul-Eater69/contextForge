"""Summary generation primitives for preserving taxonomy-relevant operational signals."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List


SUMMARY_OUTPUT_FIELDS: List[str] = [
    "business_objective",
    "initiative_type",
    "target_users_or_actors",
    "product_or_offering_changes",
    "commercial_pricing_signals",
    "service_request_signals",
    "finance_payment_signals",
    "partner_onboarding_signals",
    "compliance_signals",
    "workflow_process_signals",
    "analytics_reporting_signals",
    "explicit_terms",
    "downstream_implications",
    "implementation_clues",
]


SUMMARY_PROMPT_TEMPLATE = """
When summarizing the card, do not only produce a broad business summary.

Also preserve operational and business-process cues that may later map to value streams.

Explicitly capture:
- commercial/pricing signals such as price changes, quote/bid language, market parity, offer packaging, sales enablement
- service/request signals such as inquiry handling, portal usage, self-service, secure messaging, case routing, omni-channel support
- finance/payment signals such as invoice, remittance, payment receipt, billing workflow, disbursement, reconciliation
- onboarding/partner signals such as vendor setup, partner onboarding, credentialing, contracting, implementation handoff
- compliance/governance signals such as audit, regulatory, privacy, risk, reporting
- any explicit workflow/process statements
- any downstream implications that are suggested by the initiative

Preserve important exact phrases from the source text.
Do not output final value stream labels.

Return JSON with these keys only:
{fields}
""".strip()


@dataclass(frozen=True)
class SummaryGenerator:
    """Builds the summary prompt and normalizes summary output shape."""

    prompt_template: str = SUMMARY_PROMPT_TEMPLATE

    def build_prompt(self, source_text: str) -> str:
        fields = ", ".join(SUMMARY_OUTPUT_FIELDS)
        return (
            f"{self.prompt_template.format(fields=fields)}\n\n"
            f"Source text:\n{source_text.strip()}"
        )

    def normalize_summary(self, llm_payload: Dict[str, Any]) -> Dict[str, Any]:
        """Ensure all structured fields are present and taxonomy labels are not emitted."""
        out: Dict[str, Any] = {}
        for field in SUMMARY_OUTPUT_FIELDS:
            value = llm_payload.get(field, [])
            if field in {"business_objective", "initiative_type"} and not isinstance(value, str):
                value = ""
            elif field not in {"business_objective", "initiative_type"} and not isinstance(value, list):
                value = []
            out[field] = value

        # Guardrail: summary layer should preserve cues, not decide taxonomy labels.
        out["explicit_terms"] = [
            term
            for term in out["explicit_terms"]
            if not str(term).lower().startswith("value_stream:")
        ]
        return out
