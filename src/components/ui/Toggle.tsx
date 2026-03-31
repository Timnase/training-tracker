interface ToggleProps {
  checked:  boolean;
  onChange: (checked: boolean) => void;
  label:    string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-3">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-primary-500' : 'bg-slate-200'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}
