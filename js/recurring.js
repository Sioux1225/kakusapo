// 毎月決まった支払い（スマホ代・月極駐車場・リース代・保険など）を、毎月の経費として自動で登録する
// DOMに依存しない純粋な関数。登録済みかどうかは呼び出し側（settings.recurringDone）で管理する。

const ymOf = (iso) => String(iso).slice(0, 7);
const addMonth = (ym, n = 1) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const lastDay = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

// その支払いの、今日までに来た支払日（YYYY-MM-DD）の一覧
export function dueDates(rec, todayIso) {
  if (!rec || !rec.startMonth || !(Number(rec.amount) > 0)) return [];
  const out = [];
  const end = rec.endMonth && rec.endMonth < ymOf(todayIso) ? rec.endMonth : ymOf(todayIso);
  for (let ym = rec.startMonth; ym <= end; ym = addMonth(ym)) {
    const day = Math.min(Math.max(1, Number(rec.day) || 1), lastDay(ym));
    const date = `${ym}-${String(day).padStart(2, '0')}`;
    if (date <= todayIso) out.push(date);
    if (out.length > 120) break;
  }
  return out;
}

// 支払日1回分の領収書データ
export function receiptFor(rec, date, nowIso) {
  return {
    id: `rec-${rec.id}-${date.slice(0, 7)}`,
    date,
    vendor: rec.name,
    amount: Number(rec.amount) || 0,
    taxRate: rec.taxRate || '10',
    taxAmount: null,
    invoiceNo: rec.invoiceNo || '',
    category: rec.category,
    categoryConfidence: 1,
    paymentMethod: rec.paymentMethod || 'bank',
    businessRatio: rec.businessRatio ?? 100,
    memo: '毎月の固定費から自動で登録',
    imageId: '',
    status: 'confirmed',
    recurringId: rec.id,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

// まだ登録していない分の領収書データ
export function pendingReceipts(list = [], done = {}, todayIso, nowIso) {
  const out = [];
  for (const rec of list) {
    for (const date of dueDates(rec, todayIso)) {
      const key = `${rec.id}:${date.slice(0, 7)}`;
      if (!done[key]) out.push({ key, receipt: receiptFor(rec, date, nowIso) });
    }
  }
  return out;
}
