import { forwardRef } from 'react';
import { cn } from '../../utils';

const variants = {
  primary: 'bg-primary-500 text-white hover:bg-primary-600 active:scale-95',
  outline: 'border border-primary-500 text-primary-500 hover:bg-primary-50',
  ghost:   'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200',
  danger:  'bg-red-50 text-red-500 hover:bg-red-100',
} as const;

const sizes = {
  sm: 'px-3 py-2 text-sm rounded-lg',
  md: 'px-4 py-3 text-sm rounded-xl',
  lg: 'px-4 py-4 text-base rounded-xl',
} as const;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:   keyof typeof variants;
  size?:      keyof typeof sizes;
  fullWidth?: boolean;
  loading?:   boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', fullWidth, loading, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold transition-all disabled:opacity-50',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> : children}
    </button>
  )
);

Button.displayName = 'Button';
