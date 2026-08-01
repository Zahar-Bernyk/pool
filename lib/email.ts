import { Resend } from 'resend';
import { isValidEmail } from './email-check';

export { isValidEmail };

// Листи гостям через Resend.
// Змінні середовища:
//   RESEND_API_KEY  — ключ із resend.com (обовʼязково)
//   EMAIL_FROM      — відправник, напр. 'Підгорецький Маєток <booking@pidgoretskyymaietok.com>'
//                     Домен має бути підтверджений у Resend.

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export interface MailRow {
  label: string;
  value: string;
}

interface SendArgs {
  to: string;
  subject: string;
  heading: string;
  intro: string;
  code: string;
  rows: MailRow[];
  amount?: number;
  footerNote?: string;
  /** Показати блок «Що змінилося» жовтим — для листів про зміни. */
  changed?: MailRow[];
}

/**
 * Надсилає лист гостю. Ніколи не кидає виняток назовні:
 * якщо пошта не налаштована або сервіс недоступний, бронювання все одно
 * має пройти — лист це приємне доповнення, а не умова оплати.
 */
export async function sendGuestEmail(args: SendArgs): Promise<{ ok: boolean; error?: string }> {
  if (!emailConfigured()) return { ok: false, error: 'EMAIL_NOT_CONFIGURED' };
  if (!isValidEmail(args.to)) return { ok: false, error: 'BAD_EMAIL' };

  try {
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to: args.to,
      subject: args.subject,
      html: renderHtml(args),
      text: renderText(args),
    });
    if (error) return { ok: false, error: String(error.message || error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Оформлення листа ────────────────────────────────────────────────
// Прості таблиці й інлайнові стилі — це єдине, що надійно виглядає
// однаково в Gmail, Apple Mail і Outlook.

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function renderHtml(a: SendArgs): string {
  const rows = a.rows
    .map(
      (r) => `<tr>
        <td style="padding:9px 0;color:#86868B;font-size:14px;width:42%">${esc(r.label)}</td>
        <td style="padding:9px 0;color:#1D1D1F;font-size:15px;font-weight:600">${esc(r.value)}</td>
      </tr>`,
    )
    .join('');

  const changedBlock = a.changed?.length
    ? `<div style="background:#FDF6E7;border:1px solid #EAD9AE;border-radius:12px;padding:16px;margin:0 0 20px">
         <div style="font-weight:700;color:#7A5C12;margin-bottom:8px">Що змінилося</div>
         <table width="100%" cellpadding="0" cellspacing="0">
           ${a.changed
             .map(
               (r) => `<tr>
                 <td style="padding:5px 0;color:#86868B;font-size:14px;width:42%">${esc(r.label)}</td>
                 <td style="padding:5px 0;color:#1D1D1F;font-size:15px;font-weight:600">${esc(r.value)}</td>
               </tr>`,
             )
             .join('')}
         </table>
       </div>`
    : '';

  const amountBlock =
    typeof a.amount === 'number'
      ? `<tr>
           <td style="padding:14px 0 0;border-top:1px solid #E8E8ED;color:#86868B;font-size:14px">Сплачено</td>
           <td style="padding:14px 0 0;border-top:1px solid #E8E8ED;color:#3B9B4E;font-size:20px;font-weight:700">${a.amount} ₴</td>
         </tr>`
      : '';

  return `<!doctype html>
<html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F7">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F7;padding:28px 12px">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      <tr><td align="center" style="padding-bottom:6px">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#1D1D1F">Підгорецький Маєток</div>
      </td></tr>
      <tr><td align="center" style="padding-bottom:24px">
        <div style="font-size:14px;color:#86868B">${esc(a.heading)}</div>
      </td></tr>

      <tr><td style="padding-bottom:20px;font-size:15px;line-height:1.6;color:#1D1D1F">${esc(a.intro)}</td></tr>

      ${changedBlock ? `<tr><td>${changedBlock}</td></tr>` : ''}

      <tr><td align="center" style="padding:4px 0 22px">
        <div style="font-size:11px;letter-spacing:1.5px;color:#86868B;text-transform:uppercase">Код бронювання</div>
        <div style="font-family:Georgia,serif;font-size:32px;font-weight:700;color:#1D1D1F;letter-spacing:1px;margin-top:4px">${esc(a.code)}</div>
      </td></tr>

      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E8E8ED">
          ${rows}
          ${amountBlock}
        </table>
      </td></tr>

      ${
        a.footerNote
          ? `<tr><td style="padding-top:22px;font-size:14px;line-height:1.6;color:#1D1D1F">${esc(a.footerNote)}</td></tr>`
          : ''
      }

      <tr><td align="center" style="padding-top:26px;border-top:1px solid #E8E8ED;margin-top:20px">
        <div style="font-size:13px;color:#86868B;line-height:1.7;padding-top:18px">
          с. Підгірці, вул. Лесі Українки, 4В<br>
          <a href="tel:+380970305301" style="color:#86868B;text-decoration:none">+380 97 030 53 01</a><br>
          <a href="https://www.pidgoretskyymaietok.com" style="color:#86868B">pidgoretskyymaietok.com</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function renderText(a: SendArgs): string {
  const lines = [
    'ПІДГОРЕЦЬКИЙ МАЄТОК',
    a.heading,
    '',
    a.intro,
    '',
  ];
  if (a.changed?.length) {
    lines.push('ЩО ЗМІНИЛОСЯ:');
    for (const r of a.changed) lines.push(`  ${r.label}: ${r.value}`);
    lines.push('');
  }
  lines.push(`Код бронювання: ${a.code}`, '');
  for (const r of a.rows) lines.push(`${r.label}: ${r.value}`);
  if (typeof a.amount === 'number') lines.push(`Сплачено: ${a.amount} грн`);
  if (a.footerNote) lines.push('', a.footerNote);
  lines.push('', 'с. Підгірці, вул. Лесі Українки, 4В', '+380 97 030 53 01', 'pidgoretskyymaietok.com');
  return lines.join('\n');
}
