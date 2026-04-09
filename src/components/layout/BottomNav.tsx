import { NavLink } from 'react-router-dom';
import { cn } from '../../utils';

const links = [
  {
    to: '/',
    label: 'Home',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-[22px] h-[22px]"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  },
  {
    to: '/plans',
    label: 'Plans',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-[22px] h-[22px]"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
  },
  {
    to: '/log',
    label: 'Log',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-6 h-6 text-white"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
    isLog: true,
  },
  {
    to: '/history',
    label: 'History',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-[22px] h-[22px]"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-[22px] h-[22px]"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>,
  },
] as const;

export function BottomNav() {
  return (
    <nav className="relative overflow-visible flex items-start pt-2 bg-white border-t border-slate-100 safe-bottom">
      {links.map(link => { const { to, label, icon } = link; const isLog = 'isLog' in link && link.isLog; return (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => cn(
            'flex-1 flex flex-col items-center gap-1 pb-2 text-[11px] font-medium transition-colors',
            isLog ? '-mt-4 z-10 relative' : '',
            !isLog && (isActive ? 'text-primary-500' : 'text-slate-400'),
          )}
        >
          {({ isActive }) =>
            isLog ? (
              <>
                <div className={cn('w-13 h-13 rounded-full flex items-center justify-center shadow-lg',
                  isActive ? 'bg-primary-600' : 'bg-primary-500'
                )} style={{ width: 52, height: 52 }}>
                  {icon}
                </div>
                <span className={isActive ? 'text-primary-500' : 'text-slate-400'}>{label}</span>
              </>
            ) : (
              <>
                {icon}
                <span>{label}</span>
              </>
            )
          }
        </NavLink>
      ); })}
    </nav>
  );
}
