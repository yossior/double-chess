import { useEffect, useState } from 'react';

export function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  return { toast, showToast };
}

export function Toast({ toast }) {
  if (!toast) return null;

  const bgColor = toast.type === 'success' 
    ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 shadow-emerald-500/30' 
    : 'bg-gradient-to-r from-slate-700 to-slate-800 shadow-slate-500/30';

  return (
    <div className="fixed top-4 right-4 z-50 animate-fade-in">
      <div className={`${bgColor} text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/30 backdrop-blur-sm`}>
        <span className="text-2xl">✓</span>
        <span className="font-bold text-lg">{toast.message}</span>
      </div>
    </div>
  );
}
