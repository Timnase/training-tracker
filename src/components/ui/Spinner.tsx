import { cn } from '../../utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-16', className)}>
      <div className="h-9 w-9 rounded-full border-[3px] border-slate-200 border-t-primary-500 animate-spin" />
    </div>
  );
}
