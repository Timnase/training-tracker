import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  title:      string;
  showBack?:  boolean;
  backTo?:    string;
  action?:    React.ReactNode;
}

export function Header({ title, showBack, backTo, action }: HeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="h-[60px] bg-white border-b border-slate-100 flex-shrink-0">
      {/* grid-cols-[auto_1fr_auto] so the centre title is always truly centred
          regardless of how many buttons are in the left/right slots */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center h-full px-4 gap-2">
        <div className="flex items-center">
          {showBack && (
            <button
              onClick={() => backTo ? navigate(backTo) : navigate(-1)}
              className="w-9 h-9 flex items-center justify-center text-slate-500 rounded-xl"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
        </div>

        <h1 className="text-[17px] font-bold text-slate-900 text-center truncate">{title}</h1>

        <div className="flex items-center justify-end gap-1">
          {action}
        </div>
      </div>
    </header>
  );
}

/** Reusable + icon for the header action slot. */
export function HeaderAddButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-9 h-9 flex items-center justify-center text-slate-500 rounded-xl">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  );
}
