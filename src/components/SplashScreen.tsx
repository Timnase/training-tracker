export function SplashScreen() {
  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center gap-4">
      <div className="text-6xl">💪</div>
      <p className="text-xl font-extrabold text-slate-900">Training Tracker</p>
      <div className="flex gap-1.5 mt-2">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-primary-400 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
