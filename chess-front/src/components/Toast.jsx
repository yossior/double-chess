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
    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-emerald-500/30' 
    : 'bg-gradient-to-r from-indigo-600 to-purple-600 shadow-indigo-500/30';

  return (
    <div className="fixed top-20 right-4 z-50 animate-fade-in">
      <div className={`${bgColor} text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 border border-white/20`}>
        <span className="text-lg">✓</span>
        <span className="font-semibold">{toast.message}</span>
      </div>
    </div>
  );
}
