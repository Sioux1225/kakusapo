// 自動仕訳：領収書・売上・固定資産から、その年の仕訳と総勘定元帳を作る（DOMに依存しない純粋な関数）
//
// 記帳のルール（簿記の知識がなくても使えるように単純にしている）
// - 経費：事業分（家事按分後）の金額を「経費の科目 ／ 事業主借」。
//         事業用の口座・カードを使っている設定で、支払方法が口座・カード・電子マネーなら「／ 普通預金」
// - 売上：対象月の末日に「売掛金 ／ 売上」、入金日に「普通預金（個人の口座なら事業主貸） ／ 売掛金」。
//         対象月の中で入金された場合は「普通預金 ／ 売上」の1本にまとめる
// - 固定資産：使い始めた日に「車両運搬具など ／ 事業主借（事業用の口座なら普通預金）」
// - 減価償却：12月31日に「減価償却費 ／ 車両運搬具など」、私用分は「事業主貸 ／ 減価償却費」で戻す
// - 期首（1月1日）の残高：普通預金・売掛金・固定資産の帳簿価額。元入金はその合計（負債はない前提）

import { CATEGORY_MAP } from './categories.js';
import { schedule, methodOf } from './depreciation.js';
import { businessAmount } from './format.js';

// 借方が増えると残高が増える科目（資産・費用・事業主貸）。それ以外は貸方で増える
const CREDIT_NORMAL = new Set(['売上', '事業主借', '元入金', '未払金']);
export const isCreditNormal = (account) => CREDIT_NORMAL.has(account);

const ASSET_ACCOUNT = { car: '車両運搬具', pc: '工具器具備品', other: '工具器具備品' };
export function assetAccount(asset, filingType) {
  if (methodOf(asset, filingType) === 'lump3') return '一括償却資産';
  return ASSET_ACCOUNT[asset.kind] || '工具器具備品';
}

const lastDayOf = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};
const yearOf = (iso) => Number(String(iso || '').slice(0, 4));

// 固定資産のある年の期首の帳簿価額
function bookValueAtStart(asset, filingType, year) {
  if (yearOf(asset.acquiredOn) >= year) return 0;
  const rows = schedule(asset, filingType, year - 1).filter((r) => r.year < year);
  return rows.length ? rows[rows.length - 1].bookValue : Number(asset.cost) || 0;
}

// 期首残高 { 普通預金, 売掛金, 車両運搬具…, 元入金 }
export function openingBalances({ year, sales = [], assets = [], settings = {} }) {
  const ft = settings.filingType;
  const bank = Number((settings.openingBank || {})[year]) || 0;
  const receivable = sales
    .filter((s) => yearOf(s.month + '-01') < year && yearOf(s.date) >= year && lastDayOf(s.month) < s.date)
    .reduce((t, s) => t + (Number(s.amount) || 0), 0);
  const out = {};
  if (bank) out['普通預金'] = bank;
  if (receivable) out['売掛金'] = receivable;
  for (const a of assets) {
    const v = bookValueAtStart(a, ft, year);
    if (v > 0) {
      const acc = assetAccount(a, ft);
      out[acc] = (out[acc] || 0) + v;
    }
  }
  const total = Object.values(out).reduce((x, y) => x + y, 0);
  if (total) out['元入金'] = total;
  return out;
}

// その年の仕訳 [{ date, memo, dr, cr, amount, source }]（日付順）
export function buildJournal({ year, receipts = [], sales = [], assets = [], settings = {}, categoryName }) {
  const ft = settings.filingType;
  const bizPay = Boolean(settings.bizAccount);
  const nameOf = categoryName || ((id) => (CATEGORY_MAP[id] ? CATEGORY_MAP[id].name : '雑費'));
  const entries = [];
  const add = (date, memo, dr, cr, amount, source) => {
    const v = Math.round(Number(amount) || 0);
    if (v > 0) entries.push({ date, memo, dr, cr, amount: v, source });
  };

  // 経費（領収書）
  for (const r of receipts) {
    if (yearOf(r.date) !== year) continue;
    const ratio = r.businessRatio == null ? 100 : Number(r.businessRatio);
    const memo = `${r.vendor || '（支払先なし）'}${ratio < 100 ? `（事業分${ratio}%）` : ''}${r.status !== 'confirmed' ? ' ※未確認' : ''}`;
    const fromBank = bizPay && ['bank', 'card', 'emoney'].includes(r.paymentMethod);
    add(r.date, memo, nameOf(r.category), fromBank ? '普通預金' : '事業主借', businessAmount(r), { type: 'receipt', id: r.id });
  }

  // 売上
  for (const s of sales) {
    const amount = Number(s.amount) || 0;
    const client = s.client || '取引先なし';
    const month = s.month;
    const end = lastDayOf(month);
    const paidTo = s.to === 'private' ? '事業主貸' : '普通預金';
    const sameMonth = s.date && s.date <= end && s.date.slice(0, 7) === month;
    if (yearOf(end) === year) {
      if (sameMonth) add(s.date, `${client} ${Number(month.slice(5))}月分`, paidTo, '売上', amount, { type: 'sale', id: s.id });
      else add(end, `${client} ${Number(month.slice(5))}月分（未入金）`, '売掛金', '売上', amount, { type: 'sale', id: s.id });
    }
    if (!sameMonth && s.date && yearOf(s.date) === year) {
      add(s.date, `${client} ${Number(month.slice(5))}月分の入金`, paidTo, '売掛金', amount, { type: 'sale', id: s.id });
    }
  }

  // 固定資産と減価償却
  for (const a of assets) {
    const acc = assetAccount(a, ft);
    const name = a.name || { car: '車両', pc: 'パソコン', other: '固定資産' }[a.kind] || '固定資産';
    if (yearOf(a.acquiredOn) === year) add(a.acquiredOn, `${name}の購入`, acc, bizPay ? '普通預金' : '事業主借', a.cost, { type: 'asset', id: a.id });
    const row = schedule(a, ft, year).find((x) => x.year === year);
    if (row && row.depreciation > 0) {
      add(`${year}-12-31`, `${name}の減価償却`, '減価償却費', acc, row.depreciation, { type: 'asset', id: a.id });
      add(`${year}-12-31`, `${name}の減価償却のうち私用分`, '事業主貸', '減価償却費', row.depreciation - row.expense, { type: 'asset', id: a.id });
    }
  }

  return entries.sort((x, y) => x.date.localeCompare(y.date));
}

// 総勘定元帳：科目ごとの { account, opening, rows:[{date, other, memo, dr, cr, balance}], debit, credit, closing }
export function buildLedger(entries, opening = {}) {
  const map = new Map();
  const get = (account) => {
    if (!map.has(account)) map.set(account, { account, opening: opening[account] || 0, rows: [], debit: 0, credit: 0 });
    return map.get(account);
  };
  Object.keys(opening).forEach(get);
  for (const e of entries) {
    const d = get(e.dr);
    d.rows.push({ date: e.date, other: e.cr, memo: e.memo, dr: e.amount, cr: 0 });
    d.debit += e.amount;
    const c = get(e.cr);
    c.rows.push({ date: e.date, other: e.dr, memo: e.memo, dr: 0, cr: e.amount });
    c.credit += e.amount;
  }
  for (const l of map.values()) {
    const sign = isCreditNormal(l.account) ? -1 : 1;
    let bal = l.opening;
    for (const r of l.rows) {
      bal += sign * (r.dr - r.cr);
      r.balance = bal;
    }
    l.closing = bal;
  }
  return [...map.values()];
}

// 借方と貸方の合計（一致していることの確認用）
export function totals(entries) {
  const sum = entries.reduce((t, e) => t + e.amount, 0);
  return { debit: sum, credit: sum };
}
