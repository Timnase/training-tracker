import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProfileService } from '../services/profile.service';

const QUERY_KEY = ['profile'] as const;

export function useProfile() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn:  ProfileService.getProfile,
  });
}

export function useSetProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ProfileService.upsertProfile,
    onSuccess:  () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
