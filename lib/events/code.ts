// Код бронювання події: 'EV-' + 6 великих літер (26⁶ ≈ 309 млн комбінацій).
// Той самий підхід, що для басейну й готелю: crypto замість Math.random,
// лише літери — щоб «O» не плутали з нулем при диктуванні телефоном.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generateEventCode(): string {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let out = '';
  while (out.length < 6) {
    const buf = new Uint8Array(12);
    globalThis.crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < 6; i++) {
      if (buf[i] < max) out += ALPHABET[buf[i] % ALPHABET.length];
    }
  }
  return `EV-${out}`;
}
