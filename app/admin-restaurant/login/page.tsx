'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SERIF, SANS, fieldStyle, primaryBtnFull } from '@/lib/ui';

/**
 * Вхід до панелі подій.
 * Окрім пошти й пароля, співробітник вказує імʼя та прізвище —
 * вони потрапляють у журнал входів і підставляються в його бронювання.
 */
export default function EventsLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (fullName.trim().length < 3) {
      setError('Вкажіть імʼя та прізвище.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Введіть пошту й пароль.');
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authErr) {
        setError('Невірна пошта або пароль.');
        setBusy(false);
        return;
      }

      // Перевіряємо роль і пишемо в журнал
      const res = await fetch('/api/events/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName.trim() }),
      });

      if (res.status === 401) {
        await supabase.auth.signOut();
        setError('Ця пошта не має доступу до панелі подій.');
        setBusy(false);
        return;
      }
      if (!res.ok) {
        setError('Не вдалося увійти. Спробуйте ще раз.');
        setBusy(false);
        return;
      }

      router.replace('/admin-restaurant');
      router.refresh();
    } catch {
      setError('Помилка мережі.');
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F5F5F7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: SANS,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: '#fff',
          border: '1px solid #E8E8ED',
          borderRadius: 20,
          padding: 32,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600 }}>Підгорецький Маєток</div>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#86868B', marginTop: 4 }}>
            Події та банкети
          </div>
        </div>

        <label style={{ fontSize: 13, color: '#6E6E73' }}>Імʼя та прізвище</label>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Марія Коваленко"
          style={{ ...fieldStyle, marginTop: 4, marginBottom: 14 }}
          autoComplete="name"
        />

        <label style={{ fontSize: 13, color: '#6E6E73' }}>Пошта</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="username"
          style={{ ...fieldStyle, marginTop: 4, marginBottom: 14 }}
        />

        <label style={{ fontSize: 13, color: '#6E6E73' }}>Пароль</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          type="password"
          autoComplete="current-password"
          style={{ ...fieldStyle, marginTop: 4, marginBottom: 18 }}
        />

        {error && <div style={{ color: '#C0392B', fontSize: 14, marginBottom: 12 }}>{error}</div>}

        <button onClick={submit} disabled={busy} style={{ ...primaryBtnFull, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Входимо…' : 'Увійти'}
        </button>

        <div style={{ fontSize: 12, color: '#A0A0A5', marginTop: 14, textAlign: 'center', lineHeight: 1.5 }}>
          Імʼя фіксується в журналі входів і показується біля внесених вами бронювань.
        </div>
      </div>
    </div>
  );
}
