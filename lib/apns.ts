import 'server-only';
import crypto from 'node:crypto';
import http2 from 'node:http2';
import { createAdminClient } from './supabase/admin';

// ───────────────────────────────────────────────────────────────
// Надсилання iOS пуш-сповіщень через APNs (HTTP/2, токен-автентифікація).
// Змінні середовища (додаються у Vercel):
//   APNS_KEY_ID      — ID ключа APNs (.p8)
//   APNS_TEAM_ID     — Apple Team ID
//   APNS_BUNDLE_ID   — Bundle ID застосунку (напр. com.folditgroup.PidhoretskyyAdmin)
//   APNS_PRIVATE_KEY — вміст .p8 (з \n або справжніми переносами рядків)
//   APNS_ENV         — 'production' (default) або 'sandbox' (для запуску з Xcode на пристрій)
// Якщо змінні не задані — функції тихо нічого не роблять.
// ───────────────────────────────────────────────────────────────

function configured(): boolean {
  return Boolean(
    process.env.APNS_KEY_ID &&
      process.env.APNS_TEAM_ID &&
      process.env.APNS_BUNDLE_ID &&
      process.env.APNS_PRIVATE_KEY
  );
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

let cachedJwt = '';
let cachedAt = 0;

function providerToken(): string {
  // APNs дозволяє перевикористовувати токен до 60 хв — кешуємо на 45 хв.
  if (cachedJwt && Date.now() - cachedAt < 45 * 60 * 1000) return cachedJwt;

  const kid = process.env.APNS_KEY_ID!;
  const iss = process.env.APNS_TEAM_ID!;
  const key = (process.env.APNS_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  const header = b64url(Buffer.from(JSON.stringify({ alg: 'ES256', kid })));
  const claims = b64url(Buffer.from(JSON.stringify({ iss, iat: Math.floor(Date.now() / 1000) })));
  const signingInput = `${header}.${claims}`;
  const sig = crypto.sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });

  cachedJwt = `${signingInput}.${b64url(sig)}`;
  cachedAt = Date.now();
  return cachedJwt;
}

async function pushToTokens(tokens: string[], title: string, body: string): Promise<string[]> {
  const host =
    process.env.APNS_ENV === 'sandbox'
      ? 'https://api.sandbox.push.apple.com'
      : 'https://api.push.apple.com';

  const jwt = providerToken();
  const payload = JSON.stringify({ aps: { alert: { title, body }, sound: 'default', badge: 1 } });
  const invalid: string[] = [];

  const client = http2.connect(host);
  try {
    await Promise.all(
      tokens.map(
        (token) =>
          new Promise<void>((resolve) => {
            const req = client.request({
              ':method': 'POST',
              ':path': `/3/device/${token}`,
              authorization: `bearer ${jwt}`,
              'apns-topic': process.env.APNS_BUNDLE_ID!,
              'apns-push-type': 'alert',
              'apns-priority': '10',
              'content-type': 'application/json',
            });
            let status = 0;
            req.on('response', (h) => {
              status = Number(h[':status']) || 0;
            });
            req.on('data', () => {});
            req.on('end', () => {
              // 410 = токен більше не дійсний; 400 BadDeviceToken — прибираємо
              if (status === 410 || status === 400) invalid.push(token);
              resolve();
            });
            req.on('error', () => resolve());
            req.write(payload);
            req.end();
          })
      )
    );
  } finally {
    client.close();
  }
  return invalid;
}

/** Надіслати пуш усім зареєстрованим пристроям адмінів. */
export async function notifyDevices(title: string, body: string): Promise<void> {
  if (!configured()) return;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.from('device_tokens').select('token');
    const tokens = (data || []).map((r: { token: string }) => r.token);
    if (!tokens.length) return;

    const invalid = await pushToTokens(tokens, title, body);
    if (invalid.length) {
      await supabase.from('device_tokens').delete().in('token', invalid);
    }
  } catch {
    // пуш ніколи не має ламати основний потік
  }
}
