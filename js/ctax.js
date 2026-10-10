// 消費税の納付額の目安（インボイス登録をしている個人事業主向け）。DOMに依存しない純粋な関数。
//
// 比べる方法
// - 2割特例（〜2026年分）：売上の消費税 × 20%
// - 3割特例（2027・2028年分、個人事業者のみ）：売上の消費税 × 30%
// - 簡易課税：売上の消費税 ×（1 − みなし仕入率）。軽貨物の運送業は第5種（サービス業等）でみなし仕入率50%
// - 一般課税：売上の消費税 − 経費の消費税（インボイスがない経費は経過措置の割合だけ）
//
// どれも「目安」。端数処理や地方消費税の計算は作成コーナーに任せる。売上・経費はどちらも税込で記録している前提。

import { businessAmount } from './format.js';

// 消費税がかからない経費の科目（税金・保険料）
const NON_TAXABLE = new Set(['taxes', 'insurance']);

export const DEEMED_PURCHASE_RATE = 0.5; // 第5種（運送業）

// その年に使える特例（2割特例・3割特例）
export function specialRuleFor(year) {
  if (year <= 2026) return { id: 'special2', label: '2割特例', rate: 0.2 };
  if (year <= 2028) return { id: 'special3', label: '3割特例', rate: 0.3 };
  return null;
}

// インボイスのない仕入れのうち、控除できる割合（経過措置）
export function transitionalRate(dateIso) {
  if (dateIso < '2023-10-01') return 1;
  if (dateIso < '2026-10-01') return 0.8;
  if (dateIso < '2029-10-01') return 0.5;
  return 0;
}

const isInvoice = (v) => /^T\d{13}$/.test(v || '');
const taxIn = (amount, rate) => Math.floor((amount * rate) / (100 + rate));

// 1枚の領収書の、控除できる消費税（一般課税のとき）
export function receiptInputTax(r) {
  if (NON_TAXABLE.has(r.category)) return 0;
  const amount = businessAmount(r);
  if (!amount) return 0;
  let tax;
  if (r.taxAmount != null && r.taxAmount !== '' && Number(r.taxAmount) > 0) {
    const ratio = r.businessRatio == null ? 100 : Number(r.businessRatio);
    tax = Math.floor((Number(r.taxAmount) * ratio) / 100);
  } else {
    tax = taxIn(amount, r.taxRate === '8' ? 8 : 10);
  }
  return isInvoice(r.invoiceNo) ? tax : Math.floor(tax * transitionalRate(String(r.date)));
}

// その年の計算
export function compareMethods({ year, receipts = [], sales = [], assets = [], filingType }) {
  const yearSales = sales.filter((s) => String(s.month).startsWith(String(year)));
  const salesTotal = yearSales.reduce((t, s) => t + (Number(s.amount) || 0), 0);
  const outputTax = taxIn(salesTotal, 10);

  // 経費の消費税（一般課税）
  let receiptTax = 0;
  let noInvoiceCount = 0;
  for (const r of receipts) {
    if (!String(r.date).startsWith(String(year))) continue;
    receiptTax += receiptInputTax(r);
    if (!NON_TAXABLE.has(r.category) && !isInvoice(r.invoiceNo)) noInvoiceCount++;
  }
  // 車両などは、買った年にまとめて控除（事業で使う割合の分）
  let assetTax = 0;
  for (const a of assets) {
    if (Number(String(a.acquiredOn).slice(0, 4)) !== year) continue;
    const ratio = a.businessRatio == null ? 100 : Number(a.businessRatio);
    const tax = taxIn(Math.floor((Number(a.cost) || 0) * ratio / 100), 10);
    assetTax += isInvoice(a.invoiceNo) || a.invoiceNo === undefined ? tax : Math.floor(tax * transitionalRate(a.acquiredOn));
  }
  const inputTax = receiptTax + assetTax;

  const methods = [];
  const sp = specialRuleFor(year);
  if (sp) methods.push({ id: sp.id, label: sp.label, payable: Math.floor(outputTax * sp.rate), note: '届出は不要。申告書に「適用する」と書くだけ' });
  methods.push({ id: 'simple', label: '簡易課税', payable: Math.floor(outputTax * (1 - DEEMED_PURCHASE_RATE)), note: `運送業はみなし仕入率${DEEMED_PURCHASE_RATE * 100}%。使う年の前年12月31日までに届出が必要` });
  methods.push({ id: 'general', label: '一般課税', payable: Math.max(outputTax - inputTax, 0), refund: Math.max(inputTax - outputTax, 0), note: '届出は不要。経費のインボイス（領収書）の保存が必要' });

  const best = methods.reduce((a, b) => (b.payable - (b.refund || 0) < a.payable - (a.refund || 0) ? b : a));
  return { year, salesTotal, outputTax, inputTax, assetTax, noInvoiceCount, methods, best: best.id, filingType };
}

// 消費税の申告・納付の期限（個人事業者は翌年3月31日）
export const dueDate = (year) => `${year + 1}-03-31`;
