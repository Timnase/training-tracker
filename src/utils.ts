import type { Exercise, ExerciseGroup } from './types';

// ─── IDs ──────────────────────────────────────────────────────────────────────

export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ─── Dates ────────────────────────────────────────────────────────────────────

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

export const formatDateShort = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const daysAgo = (iso: string): string => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${diff} days ago`;
};

export const todayLabel = (): string =>
  new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

// ─── Exercises ────────────────────────────────────────────────────────────────

export function groupExercises(exercises: Exercise[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  const seen = new Set<string>();

  for (const ex of exercises) {
    if (seen.has(ex.id)) continue;
    seen.add(ex.id);

    if (ex.supersetGroupId) {
      const partners = exercises.filter(e => e.supersetGroupId === ex.supersetGroupId);
      partners.forEach(p => seen.add(p.id));
      groups.push({ type: 'superset', exercises: partners });
    } else {
      groups.push({ type: 'single', exercises: [ex] });
    }
  }

  return groups;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

export const cn = (...classes: (string | undefined | null | false)[]): string =>
  classes.filter(Boolean).join(' ');
