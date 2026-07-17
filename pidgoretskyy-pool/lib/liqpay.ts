import crypto from 'crypto';

// ───────────────────────────────────────────────────────────────
// LiqPay (ПриватБанк) — формування даних і підпису.
// Документація: https://www.liqpay.ua/documentation/api
// ───────────────────────────────────────────────────────────────

export function liqpayConfigured(): boolean {
  return Boolean(process.env.LIQPAY_PUBLIC_KEY && process.env.LIQPAY_PRIVATE_KEY);
}

/** base64(JSON параметрів платежу). */
export function liqpayData(params: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(params)).toString('base64');
}

/** Підпис: base64( sha1( private_key + data + private_key ) ). */
export function liqpaySignature(data: string): string {
  const priv = process.env.LIQPAY_PRIVATE_KEY || '';
  return crypto
    .createHash('sha1')
    .update(priv + data + priv)
    .digest('base64');
}

/** Готує data+signature для checkout-форми LiqPay. */
export function buildLiqpayCheckout(opts: {
  amount: number;
  orderId: string;
  description: string;
  resultUrl: string;
  serverUrl: string;
}) {
  const params = {
    public_key: process.env.LIQPAY_PUBLIC_KEY,
    version: 3,
    action: 'pay',
    amount: opts.amount,
    currency: 'UAH',
    description: opts.description,
    order_id: opts.orderId,
    result_url: opts.resultUrl,
    server_url: opts.serverUrl,
  };
  const data = liqpayData(params);
  return { data, signature: liqpaySignature(data) };
}
