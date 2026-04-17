import type { ModelGateway } from "../../modules/data-plane/ports/repositories.ts";

export class DeterministicModelGateway implements ModelGateway {
  async compose(input: Parameters<ModelGateway["compose"]>[0]): Promise<{
    answer: string;
    plan: string[];
  }> {
    const topArtifacts = input.contextPackage.mustHave.map((item) => item.label).slice(0, 3);
    const topSupporting = input.contextPackage.supporting
      .map((item) => item.label)
      .slice(0, 2);

    const plan = [
      topArtifacts.length > 0
        ? `Inspect grounded evidence in ${topArtifacts.join(", ")}.`
        : "Inspect the latest grounded snapshot evidence.",
      topSupporting.length > 0
        ? `Cross-check supporting context from ${topSupporting.join(", ")}.`
        : "Cross-check graph and memory signals before changing code.",
      "Promote durable memory only if the outcome is evidence-backed and policy-allowed.",
    ];

    const answer = [
      `Grounded against ${input.contextPackage.snapshot.commitSha} on branch ${input.contextPackage.snapshot.branch}.`,
      topArtifacts.length > 0
        ? `Highest-signal evidence: ${topArtifacts.join(", ")}.`
        : "No strong artifact matches were retrieved.",
      `Session-local notes: ${input.sessionNotes.length}.`,
      input.contextPackage.uncertainties.join(" "),
    ].join(" ");

    return { answer, plan };
  }
}
