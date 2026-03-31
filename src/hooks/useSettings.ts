import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SettingsService } from '../services/settings.service';

const QUERY_KEY = ['settings'] as const;

export function useActivePlanId() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn:  SettingsService.getActivePlanId,
  });
}

export function useSetActivePlanId() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: SettingsService.setActivePlanId,
    onSuccess:  () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
