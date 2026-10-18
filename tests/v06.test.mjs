import test from 'node:test';
import assert from 'node:assert/strict';
import { expandReceipt, deductionItems, expenseItems, splitsValid, monthEnd } from '../js/expenses.js';
import { dueDates, pendingReceipts } from '../js/recurring.js';
import { parseEtcCsv, receiptFromEtc, etcId } from '../js/etc.js';
import { buildJournal, buildLedger, openingBalances, totals } from '../js/journal.js';
import { compareMethods } from '../js/ctax.js';
import { suggestCategory, deductibilityWarning, CATEGORY_MAP } from '../js/categories.js';

test('車検の領収書を科目ごとに分ける', () => {
  const r = { id: 'a', date: '2026-05-10', amount: 100000, businessRatio: 80, category: 'repair',
    splits: [{ category: 'repair', amount: 60000 }, { category: 'taxes', amount: 25000 }, { category: 'insurance', amount: 15000 }] };
  const items = expandReceipt(r);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((x) => x.category), ['repair', 'taxes', 'insurance']);
  assert.ok(splitsValid(r));
  assert.ok(!splitsValid({ ...r, amount: 99999 }));
  const j = buildJournal({ year: 2026, receipts: [r], settings: {} });
  assert.deepEqual(j.map((e) => [e.dr, e.amount]), [['修繕費', 48000], ['租税公課', 20000], ['損害保険料', 12000]]);
});

test('天引き：経費になり、入金は差し引いた金額', () => {
  const sale = { id: 's1', client: 'A運送', month: '2026-04', date: '2026-05-10', amount: 400000, to: 'biz',
    deductions: [{ category: 'lease', amount: 40000 }, { category: 'fees', amount: 5500 }] };
  const settings = { ratios: { lease: 80, fees: 100 } };
  const items = deductionItems([sale], settings.ratios);
  assert.equal(items[0].date, '2026-04-30');
  assert.equal(items[0].businessRatio, 80);
  const j = buildJournal({ year: 2026, sales: [sale], settings });
  const find = (dr, cr) => j.filter((e) => e.dr === dr && e.cr === cr).reduce((t, e) => t + e.amount, 0);
  assert.equal(find('売掛金', '売上'), 400000);
  assert.equal(find('リース料', '売掛金'), 32000);
  assert.equal(find('事業主貸', '売掛金'), 8000);
  assert.equal(find('支払手数料', '売掛金'), 5500);
  assert.equal(find('普通預金', '売掛金'), 354500);
  const ledger = buildLedger(j);
  assert.equal(ledger.find((l) => l.account === '売掛金').closing, 0);
  assert.equal(totals(j).debit, totals(j).credit);
});

test('天引き：12月分が翌年入金なら期首の売掛金は差し引いた金額', () => {
  const sale = { id: 's', month: '2026-12', date: '2027-01-10', amount: 300000, deductions: [{ category: 'lease', amount: 30000 }] };
  assert.equal(openingBalances({ year: 2027, sales: [sale], settings: {} })['売掛金'], 270000);
});

test('天引き：同じ月に入金された場合', () => {
  const sale = { id: 's', month: '2026-04', date: '2026-04-30', amount: 100000, to: 'biz', deductions: [{ category: 'fees', amount: 1000 }] };
  const j = buildJournal({ year: 2026, sales: [sale], settings: {} });
  const credit = j.filter((e) => e.cr === '売上').reduce((t, e) => t + e.amount, 0);
  assert.equal(credit, 100000);
});

test('消費税：分割・天引きを含めて計算し、天引きはインボイス扱い', () => {
  const sale = { id: 's', month: '2026-11', date: '2026-12-10', amount: 110000, deductions: [{ category: 'fees', amount: 11000 }] };
  const r = compareMethods({ year: 2026, receipts: [], sales: [sale], assets: [], settings: { ratios: { fees: 100 } } });
  assert.equal(r.inputTax, 1000);
  assert.equal(r.noInvoiceCount, 0);
  const split = { id: 'k', date: '2026-06-01', amount: 33000, invoiceNo: '', splits: [{ category: 'repair', amount: 22000 }, { category: 'taxes', amount: 11000 }] };
  const r2 = compareMethods({ year: 2026, receipts: [split], sales: [], assets: [] });
  assert.equal(r2.inputTax, 1600); // 修繕費の2000円（インボイスなしは経過措置で80%）、税金は対象外
  assert.equal(r2.noInvoiceCount, 1);
});

test('毎月の固定費：開始月から今日までの支払日', () => {
  const rec = { id: 'r1', name: 'ドコモ', amount: 8800, category: 'comm', day: 31, startMonth: '2026-01', businessRatio: 50 };
  const d = dueDates(rec, '2026-03-15');
  assert.deepEqual(d, ['2026-01-31', '2026-02-28']);
  const p = pendingReceipts([rec], { 'r1:2026-01': true }, '2026-03-31', 'now');
  assert.equal(p.length, 2);
  assert.equal(p[0].receipt.date, '2026-02-28');
  assert.equal(p[1].receipt.id, 'rec-r1-2026-03');
  assert.equal(dueDates({ ...rec, endMonth: '2026-01' }, '2026-06-01').length, 1);
});

test('ETC利用明細のCSV', () => {
  const csv = [
    '利用年月日（自）,時分（自）,利用年月日（至）,時分（至）,利用ＩＣ（自）,利用ＩＣ（至）,割引前料金,ＥＴＣ割引額,通行料金,車種,車両番号,ＥＴＣカード番号,備考',
    '26/04/01,08:10,26/04/01,08:40,東京,横浜町田,"1,320",0,"1,320",1,品川480あ1234,****1234,',
    '26/04/02,18:00,26/04/02,18:20,横浜町田,東京,1320,330,990,1,,,',
    ',,,,,,,,0,,,,合計'
  ].join('\r\n');
  const rows = parseEtcCsv(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { date: '2026-04-01', time: '08:10', from: '東京', to: '横浜町田', amount: 1320 });
  assert.equal(rows[1].amount, 990);
  const r = receiptFromEtc(rows[0], 100, 'now');
  assert.equal(r.category, 'travel');
  assert.equal(r.id, etcId(rows[0]));
  assert.notEqual(etcId(rows[0]), etcId(rows[1]));
  assert.deepEqual(parseEtcCsv('a,b\n1,2'), []);
});

test('新しい科目と、経費にできないものの注意', () => {
  assert.equal(CATEGORY_MAP.fees.blueNo, '㉗');
  assert.equal(CATEGORY_MAP.training.blueNo, '㉘');
  assert.equal(suggestCategory('振込手数料 220円', '').top, 'fees');
  assert.equal(suggestCategory('', 'ワークマン 港北店').top, 'supplies');
  assert.equal(deductibilityWarning('神奈川県警', '駐車違反の反則金').level, 'ng');
  assert.equal(deductibilityWarning('国民健康保険料').level, 'deduction');
  assert.equal(deductibilityWarning('ENEOS', 'レギュラー'), null);
  assert.equal(deductibilityWarning('軽自動車税'), null);
  assert.equal(monthEnd('2028-02'), '2028-02-29');
  assert.equal(expenseItems({ receipts: [{ id: 'x' }], sales: [] }).length, 1);
});

test('展開した明細をもう一度展開しても増えない', () => {
  const r = { id: 'a', date: '2026-05-10', amount: 3000, splits: [{ category: 'repair', amount: 2000 }, { category: 'taxes', amount: 1000 }] };
  assert.equal(expandReceipt(r).flatMap(expandReceipt).length, 2);
});

test('差し引かれた消費税は売上の値引き（経費にしない）', async () => {
  const { netSales } = await import('../js/expenses.js');
  const sale = { id: 's', month: '2026-04', date: '2026-05-10', amount: 330000, to: 'biz',
    deductions: [{ category: 'discount', memo: '消費税', amount: 30000 }, { category: 'fuel', memo: 'ガソリン代', amount: 20000, businessRatio: 100 }] };
  assert.equal(netSales(sale), 300000);
  assert.equal(deductionItems([sale]).length, 1);
  const j = buildJournal({ year: 2026, sales: [sale], settings: {} });
  const ledger = buildLedger(j);
  assert.equal(ledger.find((l) => l.account === '売上').closing, 300000);
  assert.equal(ledger.find((l) => l.account === '売掛金').closing, 0);
  assert.equal(j.find((e) => e.dr === '普通預金').amount, 280000);
  const same = { ...sale, date: '2026-04-30' };
  const l2 = buildLedger(buildJournal({ year: 2026, sales: [same], settings: {} }));
  assert.equal(l2.find((l) => l.account === '売上').closing, 300000);
  assert.equal(compareMethods({ year: 2026, sales: [sale] }).salesTotal, 300000);
});
