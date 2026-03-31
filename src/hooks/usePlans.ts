import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlansService } from '../services/plans.service';
import type { Plan } from '../types';

const QUERY_KEY = ['plans'] as const;

export function usePlans() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn:  PlansService.getAll,
  });
}

export function useUpsertPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: PlansService.upsert,
    onSuccess:  () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: PlansService.remove,
    onSuccess:  () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

/** Convenience: find one plan from the cache without a new request. */
export function usePlan(planId: string): Plan | undefined {
  const { data } = usePlans();
  return data?.find(p => p.id === planId);
}
