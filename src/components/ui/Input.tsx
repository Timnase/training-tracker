import { forwardRef } from 'react';
import { cn } from '../../utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, className, id, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={id} className="text-xs font-semibold text-slate-500">{label}</label>}
      <input
        ref={ref}
        id={id}
        className={cn(
          'w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-[15px] text-slate-900',
          'bg-white focus:outline-none focus:border-primary-500 transition-colors placeholder:text-slate-300',
          className,
        )}
        {...props}
      />
    </div>
  )
);

Input.displayName = 'Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, className, id, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={id} className="text-xs font-semibold text-slate-500">{label}</label>}
      <textarea
        ref={ref}
        id={id}
        className={cn(
          'w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-[15px] text-slate-900',
          'bg-white focus:outline-none focus:border-primary-500 transition-colors placeholder:text-slate-300 resize-none',
          className,
        )}
        {...props}
      />
    </div>
  )
);

Textarea.displayName = 'Textarea';
