import { createPortal } from 'react-dom';

interface ModalProps {
  title:    string;
  onClose:  () => void;
  children: React.ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-full rounded-t-2xl max-h-[90dvh] overflow-y-auto safe-bottom">
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-4 border-b border-slate-100">
          <h2 className="text-[17px] font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
