import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateInterventionBody,
  ExperimentReport,
  ExperimentSummary,
  Intervention,
  UpdateInterventionBody,
} from "@health-dashboard/shared";
import { apiFetch } from "../client";

/**
 * Interventions — the dated changes ("got an Eight Sleep", "halved the
 * dose") that before/after analysis is measured against.
 *
 * Mutating one changes what every experiment report says, so all of these
 * invalidate `["experiments"]` alongside their own key.
 */

function invalidateInterventions(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: ["interventions"] });
  qc.invalidateQueries({ queryKey: ["experiments"] });
}

export function useInterventions() {
  return useQuery<Intervention[]>({
    queryKey: ["interventions"],
    queryFn: () => apiFetch("/interventions"),
  });
}

export function useCreateIntervention() {
  const qc = useQueryClient();
  return useMutation<Intervention, Error, CreateInterventionBody>({
    mutationFn: (body) =>
      apiFetch("/interventions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateInterventions(qc),
  });
}

export function useUpdateIntervention() {
  const qc = useQueryClient();
  return useMutation<
    Intervention,
    Error,
    { id: number; body: UpdateInterventionBody }
  >({
    mutationFn: ({ id, body }) =>
      apiFetch(`/interventions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateInterventions(qc),
  });
}

export function useDeleteIntervention() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) => apiFetch(`/interventions/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateInterventions(qc),
  });
}

/** Re-infers interventions from logged data. Idempotent. */
export function useRefreshInterventions() {
  const qc = useQueryClient();
  return useMutation<{ derived: number }, Error, void>({
    mutationFn: () => apiFetch("/interventions/refresh", { method: "POST" }),
    onSuccess: () => invalidateInterventions(qc),
  });
}

/**
 * Headline verdicts across the most recent interventions, for the home
 * screen. Shares the `["experiments"]` key prefix so editing an
 * intervention invalidates this alongside any open report.
 */
export function useExperimentSummaries() {
  return useQuery<ExperimentSummary[]>({
    queryKey: ["experiments", "summary"],
    queryFn: () => apiFetch("/experiments/summary"),
  });
}

/**
 * The "did it work?" report for one intervention. Disabled until an id is
 * chosen, so selecting nothing doesn't fire a request.
 */
export function useExperimentReport(interventionId: number | null) {
  return useQuery<ExperimentReport>({
    queryKey: ["experiments", interventionId],
    queryFn: () => apiFetch(`/experiments/interventions/${interventionId}`),
    enabled: interventionId != null,
  });
}
