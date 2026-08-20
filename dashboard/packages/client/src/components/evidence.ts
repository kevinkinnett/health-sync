import type { PersonalEvidenceGrade } from "@health-dashboard/shared";

export const EVIDENCE_LABEL: Record<PersonalEvidenceGrade, string> = {
  exploratory_association: "Exploratory association",
  adjusted_association: "Adjusted association",
  observed_change: "Observed change",
  controlled_personal_experiment: "Controlled personal experiment",
};

export const EVIDENCE_EXPLANATION: Record<PersonalEvidenceGrade, string> = {
  exploratory_association: "Signals moved together; alternative explanations have not been adjusted away.",
  adjusted_association: "Comparable days were matched on measured context, but the exposure was not randomized.",
  observed_change: "A dated before/after change was observed, but other time-linked factors can still explain it.",
  controlled_personal_experiment: "The change followed a predefined personal protocol with a comparison condition.",
};
