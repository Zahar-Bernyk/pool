'use client';

export default function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#3A322A',
        color: '#fff',
        padding: '13px 22px',
        borderRadius: 999,
        fontSize: 14,
        zIndex: 80,
        boxShadow: '0 10px 30px -8px rgba(0,0,0,.4)',
        maxWidth: 'calc(100vw - 32px)',
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  );
}

/** Хук для керування тостом (автоприховування ~2.6с). */
import { useCallback, useRef, useState } from 'react';
export function useToast() {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 2600);
  }, []);
  return { message, show };
}
