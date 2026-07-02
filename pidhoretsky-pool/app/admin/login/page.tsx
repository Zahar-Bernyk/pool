'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SERIF, SANS, fieldStyle, primaryBtnFull, eyebrow } from '@/lib/ui';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr('');
    setBusy(true);
    const supabase = createClient();
    // Дозволяємо вводити лише логін (без @) — домен додається автоматично.
    const raw = email.trim();
    const loginEmail = raw.includes('@') ? raw : `${raw}@pidgoretskyymaietok.com`;
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    setBusy(false);
    if (error) {
      setErr('Невірний логін або пароль.');
      return;
    }
    const next = params.get('next') || '/admin';
    router.replace(next);
    router.refresh();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FBFAF6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 22,
        fontFamily: SANS,
        color: '#3A322A',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600 }}>Підгорецький Маєток</div>
          <div style={{ ...eyebrow, marginTop: 4, letterSpacing: 3 }}>Адмін-панель басейну</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #EFE9DD', borderRadius: 18, padding: 26 }}>
          <label style={eyebrow}>Логін</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="text"
            autoComplete="username"
            placeholder="adminpoolpidgoretskyymaietok2004"
            style={fieldStyle}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <label style={{ ...eyebrow, display: 'block', marginTop: 16 }}>Пароль</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            style={fieldStyle}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {err && <div style={{ color: '#C07A6E', fontSize: 13, marginTop: 12 }}>{err}</div>}
          <button onClick={submit} disabled={busy} style={{ ...primaryBtnFull, marginTop: 20 }}>
            {busy ? 'Вхід…' : 'Увійти'}
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a href="/booking" style={{ fontSize: 13, color: '#9A8C7B' }}>
            ← До бронювання
          </a>
        </div>
      </div>
    </div>
  );
}
