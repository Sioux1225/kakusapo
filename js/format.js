// 表示用の小さな関数

export const yen = (n) => (Number(n) || 0).toLocaleString('ja-JP') + '円';
export const num = (n) => (Number(n) || 0).toLocaleString('ja-JP');

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseISO(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return { y, m, d, dow: y ? WEEK[new Date(y, m - 1, d).getDay()] : '' };
}

export function longDate(iso) {
  if (!iso) return '日付なし';
  const p = parseISO(iso);
  return `${p.y}年${p.m}月${p.d}日（${p.dow}）`;
}

export const ym = (iso) => String(iso || '').slice(0, 7);

// HTML に埋め込む文字列のエスケープ
export function h(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 経費に入れる金額（家事按分後）
export const businessAmount = (r) => Math.round((Number(r.amount) || 0) * (r.businessRatio == null ? 100 : r.businessRatio) / 100);
