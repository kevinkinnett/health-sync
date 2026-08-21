/**
 * What kind of claim an analysis is allowed to support. This is deliberately
 * separate from estimate confidence: a very precise observational estimate
 * is still not a controlled causal experiment.
 */
export type PersonalEvidenceGrade =
  | "exploratory_association"
  | "adjusted_association"
  | "observed_change"
  | "controlled_personal_experiment";
