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

function pemFromB64(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf8');
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
  const certificate = forge.pki.certificateFromPem(pemFromB64(process.env.PASS_CERT_B64!));
  const wwdr = forge.pki.certificateFromPem(pemFromB64(process.env.PASS_WWDR_B64!));
  const keyPem = pemFromB64(process.env.PASS_KEY_B64!);
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
