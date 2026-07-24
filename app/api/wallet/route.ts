import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildPkpass, walletConfigured, pemLabel, type PassField } from '@/lib/pkpass';
import { categoryById } from '@/lib/rooms';
import { fmtDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

// GET /api/wallet?code=PM-1234  або  ?code=HR-1234
// Віддає підписаний .pkpass для Apple Wallet. Лише для ОПЛАЧЕНИХ бронювань.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  // Діагностика налаштувань: /api/wallet?debug=1
  // Показує ЛИШЕ тип кожного значення, ніколи — сам сертифікат чи ключ.
  if (searchParams.get('debug') === '1') {
    return NextResponse.json({
      configured: walletConfigured(),
      PASS_TYPE_ID: process.env.PASS_TYPE_ID || '(не задано)',
      PASS_TEAM_ID: process.env.PASS_TEAM_ID || '(не задано)',
      PASS_CERT_B64: pemLabel(process.env.PASS_CERT_B64),
      PASS_KEY_B64: pemLabel(process.env.PASS_KEY_B64),
      PASS_WWDR_B64: pemLabel(process.env.PASS_WWDR_B64),
      hint: 'CERT має бути CERTIFICATE, WWDR — CERTIFICATE, KEY — PRIVATE KEY або RSA PRIVATE KEY',
    });
  }

  const code = (searchParams.get('code') || '').trim().toUpperCase();

  if (!/^(PM|HR)-[0-9A-Z]{3,12}$/.test(code)) {
    return NextResponse.json({ error: 'Bad code' }, { status: 400 });
  }
  if (!walletConfigured()) {
    return NextResponse.json({ error: 'WALLET_NOT_CONFIGURED' }, { status: 503 });
  }

  const supabase = createAdminClient();

  try {
    if (code.startsWith('PM-')) {
      // ── Басейн ────────────────────────────────────────────────────────
      const { data } = await supabase
        .from('bookings')
        .select('code, name, date, session, spots, adults, children, amount, paid, status')
        .eq('code', code)
        .maybeSingle();

      if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (!data.paid || data.status !== 'active') {
        return NextResponse.json({ error: 'NOT_PAID' }, { status: 403 });
      }

      const spots = (data.spots as number[]).slice().sort((a, b) => a - b).join(', ');
      const aux: PassField[] = [
        { key: 'spots', label: 'ШЕЗЛОНГИ', value: spots || '—' },
        {
          key: 'guests',
          label: 'ГОСТЕЙ',
          value: `${data.adults} дор.${data.children ? ` · ${data.children} діт.` : ''}`,
        },
      ];

      const buf = await buildPkpass({
        kind: 'eventTicket',
        serialNumber: data.code,
        description: 'Електронний квиток до басейну',
        headerFields: [{ key: 'date', label: 'ДАТА', value: fmtDate(data.date) }],
        primaryFields: [{ key: 'code', label: 'КОД БРОНЮВАННЯ', value: data.code }],
        secondaryFields: [{ key: 'guest', label: 'ГІСТЬ', value: data.name || '—' }],
        auxiliaryFields: aux,
        backFields: [
          { key: 'session', label: 'Сеанс', value: data.session === 'day' ? 'Цілий день · 10:00–20:00' : 'Вечірній · 17:00–20:00' },
          { key: 'paid', label: 'Сплачено', value: `${data.amount} ₴` },
          { key: 'addr', label: 'Адреса', value: 'с. Підгірці, вул. Лесі Українки, 4В' },
          { key: 'phone', label: 'Телефон', value: '+380 97 030 53 01' },
          { key: 'note', label: 'Пам’ятка', value: 'Покажіть цей квиток на вході.' },
        ],
        relevantDate: `${data.date}T10:00:00Z`,
      });

      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/vnd.apple.pkpass',
          'Content-Disposition': `attachment; filename="${data.code}.pkpass"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // ── Готель ──────────────────────────────────────────────────────────
    const { data } = await supabase
      .from('room_bookings')
      .select('code, name, room, category, check_in, check_out, nights, guests, extra_bed, amount, paid, status')
      .eq('code', code)
      .maybeSingle();

    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!data.paid || data.status !== 'active') {
      return NextResponse.json({ error: 'NOT_PAID' }, { status: 403 });
    }

    const cat = categoryById(data.category);
    const buf = await buildPkpass({
      kind: 'generic',
      serialNumber: data.code,
      description: 'Підтвердження бронювання номера',
      headerFields: [{ key: 'room', label: 'НОМЕР', value: `№${data.room}` }],
      primaryFields: [{ key: 'code', label: 'КОД БРОНЮВАННЯ', value: data.code }],
      secondaryFields: [{ key: 'guest', label: 'ГІСТЬ', value: data.name || '—' }],
      auxiliaryFields: [
        { key: 'in', label: 'ЗАЇЗД', value: fmtDate(data.check_in) },
        { key: 'out', label: 'ВИЇЗД', value: fmtDate(data.check_out) },
      ],
      backFields: [
        { key: 'cat', label: 'Категорія', value: cat ? cat.title : data.category },
        { key: 'nights', label: 'Ночей', value: String(data.nights) },
        { key: 'guests', label: 'Гостей', value: `${data.guests}${data.extra_bed ? ' · дод. ліжко' : ''}` },
        { key: 'paid', label: 'Сплачено', value: `${data.amount} ₴` },
        { key: 'addr', label: 'Адреса', value: 'с. Підгірці, вул. Лесі Українки, 4В' },
        { key: 'phone', label: 'Телефон', value: '+380 97 030 53 01' },
        { key: 'note', label: 'Пам’ятка', value: 'Покажіть це підтвердження на рецепції.' },
      ],
      relevantDate: `${data.check_in}T14:00:00Z`,
    });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="${data.code}.pkpass"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'PASS_ERROR', message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
