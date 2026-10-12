// 経費の明細をまとめる（DOMに依存しない純粋な関数）
// - 1枚の領収書を科目ごとに分けた場合（車検など）は、科目ごとの明細に展開する
// - 委託料から差し引かれた費用（天引き）は、売上の記録から経費の明細を作る
// 集計・帳簿・消費税の計算は、すべてこの明細を使う。

import { businessAmount } from './format.js';

export const monthEnd = (ym) => {
  const [y, m] = String(ym).split('-').map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};

// 分けた領収書を科目ごとに展開する（分けていなければそのまま）
export function expandReceipt(r) {
  if (!Array.isArray(r.splits) || r.splits.length < 2) return [r];
  return r.splits.map((s, i) => ({
    ...r,
    id: `${r.id}#${i}`,
    parentId: r.id,
    category: s.category,
    amount: Number(s.amount) || 0,
    taxAmount: null,
    splits: undefined // 展開した明細をもう一度展開しない
  }));
}

// 売上から差し引かれた金額の合計
export const deductionTotal = (sale) => (sale.deductions || []).reduce((t, d) => t + (Number(d.amount) || 0), 0);

// 天引きの経費の明細（対象月の末日の経費として扱う）
export function deductionItems(sales = [], ratios = {}) {
  const out = [];
  for (const s of sales) {
    (s.deductions || []).forEach((d, i) => {
      const amount = Number(d.amount) || 0;
      if (!amount || !d.category) return;
      out.push({
        id: `ded-${s.id}-${i}`,
        source: 'deduction',
        saleId: s.id,
        date: monthEnd(s.month),
        vendor: `${s.client || '取引先'}（委託料から天引き）`,
        amount,
        category: d.category,
        businessRatio: d.businessRatio ?? ratios[d.category] ?? 100,
        taxRate: '10',
        taxAmount: null,
        invoiceOk: true, // 委託元の支払通知書をインボイスとして扱う
        paymentMethod: 'deduct',
        status: 'confirmed',
        memo: d.memo || ''
      });
    });
  }
  return out;
}

// 集計に使う経費の明細すべて
export function expenseItems({ receipts = [], sales = [], settings = {} }) {
  return [...receipts.flatMap(expandReceipt), ...deductionItems(sales, settings.ratios || {})];
}

// 分けた金額が合っているか
export function splitsValid(r) {
  if (!Array.isArray(r.splits) || r.splits.length < 2) return true;
  const sum = r.splits.reduce((t, s) => t + (Number(s.amount) || 0), 0);
  return sum === (Number(r.amount) || 0) && r.splits.every((s) => s.category && Number(s.amount) > 0);
}

export { businessAmount };
