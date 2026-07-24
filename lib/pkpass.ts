import forge from 'node-forge';
import JSZip from 'jszip';
import { PASS_IMAGES } from './wallet-images';

// Генерація та підпис Apple Wallet (.pkpass) на сервері.
// Потрібні змінні середовища (див. README нижче):
//   PASS_TYPE_ID   — напр. pass.com.folditgroup.pmaietok
//   PASS_TEAM_ID   — Team ID з сертифіката (OU=...)
//   PASS_CERT_B64  — pass.pem у base64
//   PASS_KEY_B64   — pass.key у base64 (СЕКРЕТ)
//   PASS_WWDR_B64  — wwdr.pem у base64
//   PASS_KEY_PASSPHRASE — лише якщо ключ захищено паролем

export interface PassField {
  key: string;
  label: string;
  value: string;
}

export interface PassInput {
  kind: 'eventTicket' | 'generic';
  serialNumber: string;
  description: string;
  logoText?: string;
  headerFields?: PassField[];
  primaryFields?: PassField[];
  secondaryFields?: PassField[];
  auxiliaryFields?: PassField[];
  backFields?: PassField[];
  /** ISO-дата: коли квиток стає актуальним (Wallet підкаже його на екрані блокування). */
  relevantDate?: string;
}

export function walletConfigured(): boolean {
  return Boolean(
    process.env.PASS_TYPE_ID &&
      process.env.PASS_TEAM_ID &&
      process.env.PASS_CERT_B64 &&
      process.env.PASS_KEY_B64 &&
      process.env.PASS_WWDR_B64,
  );
}

/**
 * Відновлює правильну структуру PEM.
 * Панелі змінних часто «схлопують» переноси рядків у пробіли — тоді PEM стає
 * недійсним, хоча візуально виглядає цілим. Тут ми беремо мітку й тіло
 * і збираємо PEM заново з переносами через кожні 64 символи.
 */
function normalizePem(pem: string): string {
  const m = pem.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/);
  if (!m) return pem.trim();
  const label = m[1].trim();
  const body = m[2]
    .replace(/[^A-Za-z0-9+/=]/g, '')
    .replace(/(.{64})/g, '$1\n')
    .trim();
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

/**
 * Читає сертифікат/ключ зі змінної середовища.
 * Приймає БУДЬ-ЯКИЙ спосіб вставки, щоб не залежати від того, як його скопіювали:
 *   1) base64 від .pem   (рекомендовано: base64 -i pass.pem | pbcopy)
 *   2) сам текст PEM     (з рядками -----BEGIN/-----END)
 *   3) лише «тіло» base64 без рядків BEGIN/END — обгортаємо самі
 * Також розгортає екрановані \n, які деякі панелі підставляють замість переносів.
 */
export function readPem(value: string | undefined, varName: string, label = 'CERTIFICATE'): string {
  const raw = (value || '').trim().replace(/\\n/g, '\n');
  if (!raw) throw new Error(`${varName}: змінна порожня або не задана`);

  // 1) Вже готовий PEM
  if (raw.includes('-----BEGIN')) return normalizePem(raw);

  // 2) base64 від .pem-файлу → після декодування отримаємо текст PEM
  const decoded = Buffer.from(raw, 'base64').toString('utf8');
  if (decoded.includes('-----BEGIN')) return normalizePem(decoded);

  // 3) «Голий» base64 від DER (без BEGIN/END) → обгортаємо в PEM самі.
  //    DER завжди починається з байта 0x30 (SEQUENCE).
  const bytes = Buffer.from(raw.replace(/\s/g, ''), 'base64');
  if (bytes.length > 40 && bytes[0] === 0x30) {
    const body = bytes.toString('base64').replace(/(.{64})/g, '$1\n').trim();
    return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
  }

  throw new Error(
    `${varName}: значення не схоже на сертифікат або ключ. Вставте вивід команди ` +
      `«base64 -i <файл>» або весь вміст .pem разом із рядками -----BEGIN та -----END.`,
  );
}

/** Тип PEM у значенні — для діагностики, без розкриття вмісту. */
export function pemLabel(value: string | undefined): string {
  try {
    const m = readPem(value, 'x').match(/-----BEGIN ([A-Z ]+)-----/);
    return m ? m[1] : 'невідомо';
  } catch (e) {
    return e instanceof Error ? `помилка: ${e.message.replace('x: ', '')}` : 'помилка';
  }
}

export async function buildPkpass(input: PassInput): Promise<Buffer> {
  const passTypeIdentifier = process.env.PASS_TYPE_ID!;
  const teamIdentifier = process.env.PASS_TEAM_ID!;

  // ── 1. pass.json ──────────────────────────────────────────────────────
  const pass: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier,
    teamIdentifier,
    serialNumber: input.serialNumber,
    organizationName: 'Підгорецький Маєток',
    description: input.description,
    logoText: input.logoText ?? 'Підгорецький Маєток',
    backgroundColor: 'rgb(244,241,234)',
    foregroundColor: 'rgb(29,29,31)',
    labelColor: 'rgb(134,134,139)',
    barcodes: [
      {
        format: 'PKBarcodeFormatQR',
        message: input.serialNumber,
        messageEncoding: 'iso-8859-1',
      },
    ],
    [input.kind]: {
      headerFields: input.headerFields ?? [],
      primaryFields: input.primaryFields ?? [],
      secondaryFields: input.secondaryFields ?? [],
      auxiliaryFields: input.auxiliaryFields ?? [],
      backFields: input.backFields ?? [],
    },
  };
  if (input.relevantDate) pass.relevantDate = input.relevantDate;

  // ── 2. Файли пакета ───────────────────────────────────────────────────
  const files: Record<string, Buffer> = {
    'pass.json': Buffer.from(JSON.stringify(pass), 'utf8'),
  };
  for (const [name, b64] of Object.entries(PASS_IMAGES)) {
    // Логотип у шапку НЕ кладемо: Wallet показує його поруч із назвою,
    // і разом вони не вміщаються — назва наїжджала на поле «Дата».
    // Лишається лише текст logoText. Іконка (icon*.png) обовʼязкова — її лишаємо.
    if (name.startsWith('logo')) continue;
    files[name] = Buffer.from(b64, 'base64');
  }

  // ── 3. manifest.json — SHA-1 кожного файлу ────────────────────────────
  const manifest: Record<string, string> = {};
  for (const [name, buf] of Object.entries(files)) {
    const md = forge.md.sha1.create();
    md.update(buf.toString('binary'));
    manifest[name] = md.digest().toHex();
  }
  const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf8');

  // ── 4. signature — відокремлений підпис PKCS#7 ────────────────────────
  const certificate = forge.pki.certificateFromPem(readPem(process.env.PASS_CERT_B64, 'PASS_CERT_B64', 'CERTIFICATE'));
  const wwdr = forge.pki.certificateFromPem(readPem(process.env.PASS_WWDR_B64, 'PASS_WWDR_B64', 'CERTIFICATE'));
  const keyPem = readPem(process.env.PASS_KEY_B64, 'PASS_KEY_B64', 'PRIVATE KEY');
  const passphrase = process.env.PASS_KEY_PASSPHRASE;
  const key = passphrase
    ? forge.pki.decryptRsaPrivateKey(keyPem, passphrase)
    : forge.pki.privateKeyFromPem(keyPem);
  if (!key) throw new Error('PASS_KEY: не вдалося прочитати приватний ключ');

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifestBuf.toString('binary'));
  p7.addCertificate(certificate);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key: key as forge.pki.rsa.PrivateKey,
    certificate,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
    ],
  });
  p7.sign({ detached: true });
  const signature = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');

  // ── 5. Пакування у .pkpass (звичайний zip) ────────────────────────────
  const zip = new JSZip();
  for (const [name, buf] of Object.entries(files)) zip.file(name, buf);
  zip.file('manifest.json', manifestBuf);
  zip.file('signature', signature);

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
