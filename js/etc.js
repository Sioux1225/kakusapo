// ETC利用照会サービスの利用明細（CSV）を読み取る。DOMに依存しない純粋な関数。
// 列の並びはサービスや時期で変わることがあるので、見出しの名前で列を探す。

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const norm = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, '');

function toIsoDate(s) {
  const m = norm(s).match(/^(\d{2,4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})/);
  if (!m) return '';
  let y = Number(m[1]);
  if (y < 100) y += 2000;
  return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
}

// 戻り値：[{ date, time, from, to, amount }]（通行料金が0円の行や合計の行は除く）
export function parseEtcCsv(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const headIdx = lines.findIndex((l) => /通行料金/.test(norm(l)) && /(利用年月日|年月日)/.test(norm(l)));
  if (headIdx < 0) return [];
  const head = splitCsvLine(lines[headIdx]).map(norm);
  const find = (re, from = 0) => head.findIndex((h, i) => i >= from && re.test(h));
  const iDate = find(/利用年月日/);
  const iTime = find(/時分/);
  const iFrom = find(/利用IC.*自|入口|^利用IC$/);
  const iTo = find(/利用IC.*至|出口/, iFrom + 1);
  const iAmount = find(/^通行料金/);
  if (iDate < 0 || iAmount < 0) return [];
  const out = [];
  for (const line of lines.slice(headIdx + 1)) {
    const c = splitCsvLine(line);
    const date = toIsoDate(c[iDate]);
    const amount = parseInt(norm(c[iAmount]).replace(/[^\d-]/g, ''), 10);
    if (!date || !(amount > 0)) continue;
    out.push({ date, time: iTime >= 0 ? norm(c[iTime]) : '', from: iFrom >= 0 ? c[iFrom] : '', to: iTo >= 0 ? c[iTo] : '', amount });
  }
  return out;
}

// 同じ利用を二重に取り込まないためのID
export function etcId(row) {
  const key = `${row.date}|${row.time}|${row.from}|${row.to}|${row.amount}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return `etc-${row.date}-${(h >>> 0).toString(36)}`;
}

export function receiptFromEtc(row, ratio, nowIso) {
  return {
    id: etcId(row),
    date: row.date,
    vendor: `ETC ${row.from || ''}${row.to ? ` → ${row.to}` : ''}`.trim(),
    amount: row.amount,
    taxRate: '10',
    taxAmount: null,
    invoiceNo: '',
    category: 'travel',
    categoryConfidence: 1,
    paymentMethod: 'card',
    businessRatio: ratio ?? 100,
    memo: `ETC利用明細から取り込み${row.time ? `（${row.time}）` : ''}`,
    imageId: '',
    status: 'confirmed',
    createdAt: nowIso,
    updatedAt: nowIso
  };
}
