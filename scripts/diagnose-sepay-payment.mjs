/** Read-only payment evidence. No SePay calls, UPDATEs, migrations or settlement actions. */
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import pg from 'pg';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node scripts/diagnose-sepay-payment.mjs --booking LH... --reference FLS... --amount 480000 [--env-file PATH]');
  console.log('Requires SEPAY_DIAGNOSTIC_DATABASE_URL (prefer a read-only role). An explicitly supplied env file may instead contain DATABASE_URL. Never prints credentials or account numbers.');
  process.exit(0);
}
const allowed = new Set(['--booking', '--reference', '--amount', '--env-file']);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!allowed.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
    console.error('Invalid arguments. Use --help.'); process.exit(1);
  }
  options[args[i]] = args[i + 1];
}
const booking = options['--booking'];
const reference = options['--reference'];
const amount = Number(options['--amount']);
if (!/^LH[A-Z0-9]{1,10}$/.test(booking ?? '') || !/^[A-Z0-9]{3,32}$/.test(reference ?? '') || !Number.isSafeInteger(amount) || amount <= 0) {
  console.error('Booking, reference and positive integer amount are required. Use --help.'); process.exit(1);
}

let client;
try {
  const local = options['--env-file'] ? parse(readFileSync(options['--env-file'])) : {};
  const connectionString = process.env.SEPAY_DIAGNOSTIC_DATABASE_URL || local.SEPAY_DIAGNOSTIC_DATABASE_URL || local.DATABASE_URL;
  if (!connectionString || !/^postgres(ql)?:\/\//i.test(connectionString)) throw new Error('INVALID_CONFIGURATION');
  client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000, query_timeout: 10000 });
  await client.connect();
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout='10000ms'");
  await client.query("SET LOCAL lock_timeout='3000ms'");
  const payments = await client.query(`SELECT rtrim(t.MaThanhToan) AS id,rtrim(t.MaLichHen) AS booking,
    t.MaThamChieu AS reference,t.SoTienThanhToan::bigint AS amount,t.TrangThaiGiaoDich AS status,t.NhaCungCap AS provider,
    t.MaGiaoDichNhaCungCap AS "providerTxId",(COALESCE(t.SoTaiKhoanNhan,'')<>'') AS "storedAccountPresent",
    to_char(t.HanThanhToan,'YYYY-MM-DD HH24:MI:SS') AS "expiresAtVietnam",(t.HanThanhToan<dbo.vn_now()) AS expired,
    l.TrangThaiThanhToan AS "bookingPayment",l.TrangThaiLichHen AS "bookingStatus"
    FROM dbo.ThanhToan t JOIN dbo.LichHen l ON l.MaLichHen=t.MaLichHen
    WHERE t.MaLichHen=$1 OR t.MaThamChieu=$2 ORDER BY t.NgayGhiNhan`, [booking, reference]);
  const events = await client.query(`SELECT MaSuKien AS id,NhaCungCap AS provider,MaGiaoDichNhaCungCap AS "providerTxId",
    rtrim(MaThanhToan) AS "paymentId",SoTienNhan::bigint AS amount,LoaiGiaoDich AS "transferType",ThamChieu AS reference,
    KetQuaXuLy AS outcome,to_char(NgayNhan,'YYYY-MM-DD HH24:MI:SS') AS "receivedAtVietnam"
    FROM dbo.SePayWebhookEvent WHERE ThamChieu=$1 OR MaThanhToan IN (SELECT MaThanhToan FROM dbo.ThanhToan WHERE MaLichHen=$2)
      OR position($1 in DuLieuTho)>0 ORDER BY MaSuKien`, [reference, booking]);
  const exact = payments.rows.filter(p => p.booking === booking && p.reference === reference);
  console.log(JSON.stringify({ readOnly: true, requested: { booking, reference, amount },
    payments: payments.rows.map(p => ({ ...p, amount: Number(p.amount), requestedAmountMatches: Number(p.amount) === amount })),
    events: events.rows.map(e => ({ ...e, amount: e.amount == null ? null : Number(e.amount) })),
    verdict: exact.length === 0 ? 'NO_EXACT_PAYMENT_MATCH' : exact.length === 1 && exact[0].status === 'Thành công' ? 'ALREADY_RECORDED_SUCCESS' : 'REVIEW_REQUIRED',
    settlementPerformed: false }, null, 2));
} catch (error) {
  // pg errors can contain hostnames/connection strings. Never print the original exception.
  const code = typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? ` (${error.code})` : '';
  console.error(`Read-only diagnostic failed${code}. Check the supplied connection/permissions/schema locally; no settlement was attempted.`);
  process.exitCode = 1;
} finally {
  if (client) {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}
