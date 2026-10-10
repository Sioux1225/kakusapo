// 実行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareMethods, specialRuleFor, transitionalRate, receiptInputTax } from '../js/ctax.js';

const sales = Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, amount: 440000 }));
// 年間売上 5,280,000円（税込）→ 売上の消費税 480,000円

test('年ごとに使える特例', () => {
  assert.equal(specialRuleFor(2026).id, 'special2');
  assert.equal(specialRuleFor(2027).id, 'special3');
  assert.equal(specialRuleFor(2028).id, 'special3');
  assert.equal(specialRuleFor(2029), null);
});

test('インボイスがない経費の経過措置（80% → 50%）', () => {
  assert.equal(transitionalRate('2026-09-30'), 0.8);
  assert.equal(transitionalRate('2026-10-01'), 0.5);
  assert.equal(transitionalRate('2029-10-01'), 0);
});

test('経費の消費税：インボイスあり・なし・税金や保険は対象外', () => {
  const base = { date: '2026-11-05', amount: 11000, businessRatio: 100, taxRate: '10', category: 'fuel' };
  assert.equal(receiptInputTax({ ...base, invoiceNo: 'T1234567890123' }), 1000);
  assert.equal(receiptInputTax({ ...base, invoiceNo: '' }), 500);              // 2026年10月以降は50%
  assert.equal(receiptInputTax({ ...base, businessRatio: 80, invoiceNo: 'T1234567890123' }), 800);
  assert.equal(receiptInputTax({ ...base, category: 'insurance', invoiceNo: 'T1234567890123' }), 0);
  assert.equal(receiptInputTax({ ...base, taxAmount: 990, invoiceNo: 'T1234567890123' }), 990); // 読み取った税額を優先
});

test('2026年分：2割特例・簡易課税・一般課税を比べ、一番少ないものを選ぶ', () => {
  const receipts = [{ date: '2026-05-01', amount: 1100000, businessRatio: 100, taxRate: '10', category: 'fuel', invoiceNo: 'T1234567890123' }];
  const r = compareMethods({ year: 2026, sales, receipts });
  assert.equal(r.outputTax, 480000);
  const by = Object.fromEntries(r.methods.map((m) => [m.id, m.payable]));
  assert.equal(by.special2, 96000);   // 480,000 × 20%
  assert.equal(by.simple, 240000);    // 480,000 × 50%
  assert.equal(by.general, 380000);   // 480,000 − 100,000
  assert.equal(r.best, 'special2');
});

test('車を買った年は一般課税が有利になることがある（2029年分：特例なし）', () => {
  const s2029 = sales.map((s) => ({ ...s, month: s.month.replace('2026', '2029') }));
  const assets = [{ cost: 3300000, acquiredOn: '2029-04-01', businessRatio: 100, kind: 'car' }];
  const r = compareMethods({ year: 2029, sales: s2029, assets });
  const by = Object.fromEntries(r.methods.map((m) => [m.id, m]));
  assert.equal(by.simple.payable, 240000);
  assert.equal(by.general.payable, 180000);   // 480,000 − 300,000
  assert.equal(r.best, 'general');
});
