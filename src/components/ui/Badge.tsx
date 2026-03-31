import { cn } from '../../utils';

const variants = {
  primary:   'bg-primary-50 text-primary-500',
  easy:      'bg-easy-light text-easy',
  moderate:  'bg-moderate-light text-moderate',
  hard:      'bg-hard-light text-hard',
  tired:     'bg-violet-100 text-violet-600',
  normal:    'bg-blue-100 text-blue-600',
  energized: 'bg-amber-100 text-amber-600',
} as const;

interface BadgeProps {
  children:  React.ReactNode;
  variant?:  keyof typeof variants;
  className?: string;
}

export function Badge({ children, variant = 'primary', className }: BadgeProps) {
  return (
    <span className={cn('inline-block text-xs font-bold px-2.5 py-0.5 rounded-full', variants[variant], className)}>
      {children}
    </span>
  );
}
