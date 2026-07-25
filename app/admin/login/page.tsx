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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr('');
    if (!name.trim()) {
      setErr('Вкажіть імʼя та прізвище.');
      return;
    }
    setBusy(true);
    const supabase = createClient();
    // Дозволяємо вводити лише логін (без @) — домен додається автоматично.
    const raw = email.trim();
    const loginEmail = raw.includes('@') ? raw : `${raw}@pidgoretskyymaietok.com`;
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    if (error) {
      setBusy(false);
      setErr('Невірний логін або пароль.');
      return;
    }
    // Запис у журнал входів (хто + коли). Не блокуємо вхід, якщо не вдалося.
    try {
      await supabase.from('login_log').insert({ name: name.trim() });
    } catch {
      /* ignore */
    }
    const next = params.get('next') || '/admin';
    router.replace(next);
    router.refresh();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 22,
        fontFamily: SANS,
        color: '#1D1D1F',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600 }}>Підгорецький Маєток</div>
          <div style={{ ...eyebrow, marginTop: 4, letterSpacing: '0.2em' }}>Адмін-панель басейну</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, padding: 26 }}>
          <label style={eyebrow}>Імʼя та прізвище</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            type="text"
            autoComplete="name"
            placeholder="Ваше імʼя та прізвище"
            style={fieldStyle}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <label style={{ ...eyebrow, display: 'block', marginTop: 16 }}>Логін</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="text"
            autoComplete="username"
            placeholder="login"
            style={fieldStyle}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <label style={{ ...eyebrow, display: 'block', marginTop: 16 }}>Пароль</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            placeholder="password"
            style={fieldStyle}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {err && <div style={{ color: '#C07A6E', fontSize: 13, marginTop: 12 }}>{err}</div>}
          <button onClick={submit} disabled={busy} style={{ ...primaryBtnFull, marginTop: 20 }}>
            {busy ? 'Вхід…' : 'Увійти'}
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a href="/booking" style={{ fontSize: 13, color: '#86868B' }}>
            ← До бронювання
          </a>
        </div>
      </div>
    </div>
  );
}
