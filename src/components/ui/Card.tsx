import { cn } from '../../utils';

interface CardProps {
  children:  React.ReactNode;
  className?: string;
  onClick?:   () => void;
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-2xl shadow-sm p-4',
        onClick && 'cursor-pointer active:scale-[0.99] transition-transform',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
      {children}
    </p>
  );
}
