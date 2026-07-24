'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { SERIF, SANS, fieldStyle, primaryBtnFull, ghostBtn } from '@/lib/ui';
import { fmtDate } from '@/lib/dates';

type Result = {
  found: boolean;
  reason?: string;
  kind?: 'pool' | 'hotel';
  code?: string;
  name?: string;
  phone?: string;
  date?: string;
  session?: string;
  spots?: number[];
  room?: number;
  category?: string;
  check_in?: string;
  check_out?: string;
  nights?: number;
  guests?: string;
  amount?: number;
  paid?: boolean;
  cancelled?: boolean;
};

export default function Scanner({ onToast }: { onToast: (m: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState('');
  const [manual, setManual] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [checking, setChecking] = useState(false);

  const lookup = useCallback(
    async (code: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setChecking(true);
      try {
        const r = await fetch(`/api/bookings/lookup?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
        const j = (await r.json()) as Result;
        setResult(j);
        if (navigator.vibrate) navigator.vibrate(j.found ? 60 : [40, 60, 40]);
      } catch {
        onToast('Не вдалося перевірити код.');
      } finally {
        setChecking(false);
        // невелика пауза, щоб та сама картка не зчитувалась поспіль
        setTimeout(() => {
          busyRef.current = false;
        }, 1500);
      }
    },
    [onToast],
  );

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const start = useCallback(async () => {
    setCamError('');
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();

      const jsQR = (await import('jsqr')).default;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

      const tick = () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA && !busyRef.current) {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (w && h) {
            // Скануємо центральний квадрат — швидше й точніше
            const side = Math.min(w, h);
            canvas.width = side;
            canvas.height = side;
            ctx.drawImage(video, (w - side) / 2, (h - side) / 2, side, side, 0, 0, side, side);
            const img = ctx.getImageData(0, 0, side, side);
            const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (qr?.data) lookup(qr.data.trim().toUpperCase());
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setScanning(false);
      const msg = e instanceof Error ? e.message : '';
      setCamError(
        /denied|NotAllowed/i.test(msg)
          ? 'Доступ до камери заборонено. Дозвольте його в налаштуваннях браузера й спробуйте знову.'
          : 'Не вдалося увімкнути камеру. Скористайтесь введенням коду вручну.',
      );
    }
  }, [lookup]);

  useEffect(() => stop, [stop]);

  // ── Картка результату ───────────────────────────────────────────────
  const card = (() => {
    if (!result) return null;

    if (!result.found) {
      return (
        <Verdict tone="bad" title="Квиток не знайдено">
          {result.reason === 'BAD_CODE' ? 'Код має невірний формат.' : `Коду ${result.code || ''} немає в системі.`}
        </Verdict>
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const wrongDay = result.kind === 'pool' && result.date !== today;

    if (result.cancelled) {
      return (
        <Verdict tone="bad" title="Скасовано" code={result.code}>
          Це бронювання скасоване — пропускати не можна.
        </Verdict>
      );
    }
    if (!result.paid) {
      return (
        <Verdict tone="warn" title="Не оплачено" code={result.code}>
          Бронювання не оплачене. Потрібна оплата на місці.
        </Verdict>
      );
    }

    return (
      <Verdict tone={wrongDay ? 'warn' : 'good'} title={wrongDay ? 'Інша дата!' : 'Дійсний'} code={result.code}>
        <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
          <Row k="Гість" v={result.name || '—'} />
          {result.phone ? <Row k="Телефон" v={result.phone} /> : null}
          {result.kind === 'pool' ? (
            <>
              <Row k="Дата" v={result.date ? fmtDate(result.date) : '—'} />
              <Row k="Шезлонги" v={result.spots?.join(', ') || '—'} />
              <Row k="Гостей" v={result.guests || '—'} />
            </>
          ) : (
            <>
              <Row k="Номер" v={`№${result.room} · ${result.category}`} />
              <Row k="Заїзд" v={result.check_in ? fmtDate(result.check_in) : '—'} />
              <Row k="Виїзд" v={result.check_out ? fmtDate(result.check_out) : '—'} />
              <Row k="Гостей" v={result.guests || '—'} />
            </>
          )}
          <Row k="Сплачено" v={`${result.amount} ₴`} />
        </div>
        {wrongDay ? (
          <div style={{ marginTop: 10, fontWeight: 600 }}>
            Увага: квиток на {result.date ? fmtDate(result.date) : '—'}, а не на сьогодні.
          </div>
        ) : null}
      </Verdict>
    );
  })();

  return (
    <div style={{ animation: 'fadeUp .4s ease', maxWidth: 560 }}>
      <h2 style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, margin: '0 0 6px' }}>Сканер квитків</h2>
      <p style={{ fontSize: 14, color: '#86868B', margin: '0 0 16px' }}>
        Наведіть камеру на QR-код із Wallet або паперового квитка. Можна також ввести код вручну.
      </p>

      <div
        style={{
          position: 'relative',
          background: '#000',
          borderRadius: 16,
          overflow: 'hidden',
          aspectRatio: '1 / 1',
          display: scanning ? 'block' : 'none',
        }}
      >
        <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div
          style={{
            position: 'absolute',
            inset: '18%',
            border: '3px solid rgba(255,255,255,.85)',
            borderRadius: 12,
            pointerEvents: 'none',
          }}
        />
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={{ display: 'flex', gap: 10, marginTop: scanning ? 12 : 0, flexWrap: 'wrap' }}>
        {!scanning ? (
          <button onClick={start} style={{ ...primaryBtnFull, flex: '1 1 200px' }}>
            Увімкнути камеру
          </button>
        ) : (
          <button onClick={stop} style={{ ...ghostBtn, flex: '1 1 160px' }}>
            Зупинити
          </button>
        )}
      </div>

      {camError ? (
        <div style={{ marginTop: 12, color: '#D9534F', fontSize: 14 }}>{camError}</div>
      ) : null}

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, color: '#86868B', marginBottom: 6 }}>Або введіть код вручну</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manual.trim()) {
                busyRef.current = false;
                lookup(manual.trim());
              }
            }}
            placeholder="PM-XXXXXX"
            style={{ ...fieldStyle, flex: 1, letterSpacing: 1 }}
          />
          <button
            onClick={() => {
              if (manual.trim()) {
                busyRef.current = false;
                lookup(manual.trim());
              }
            }}
            style={{ ...ghostBtn, whiteSpace: 'nowrap' }}
          >
            Перевірити
          </button>
        </div>
      </div>

      {checking ? <div style={{ marginTop: 14, color: '#86868B' }}>Перевіряю…</div> : null}
      <div style={{ marginTop: 14 }}>{card}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, fontSize: 15 }}>
      <span style={{ opacity: 0.7, fontSize: 13 }}>{k}</span>
      <span style={{ fontWeight: 500 }}>{v}</span>
    </div>
  );
}

function Verdict({
  tone,
  title,
  code,
  children,
}: {
  tone: 'good' | 'warn' | 'bad';
  title: string;
  code?: string;
  children: React.ReactNode;
}) {
  const c =
    tone === 'good'
      ? { bg: '#E7F4EA', bd: '#B7DFC2', fg: '#1E7A34' }
      : tone === 'warn'
      ? { bg: '#FDF3E4', bd: '#F0DCB4', fg: '#B7791F' }
      : { bg: '#FDECEC', bd: '#F0C9C9', fg: '#C0392B' };

  return (
    <div style={{ background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 16, padding: 18, fontFamily: SANS }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: c.fg }}>{title}</div>
        {code ? <div style={{ fontSize: 15, fontWeight: 600, color: c.fg }}>{code}</div> : null}
      </div>
      <div style={{ marginTop: 8, fontSize: 15, color: '#1D1D1F' }}>{children}</div>
    </div>
  );
}
