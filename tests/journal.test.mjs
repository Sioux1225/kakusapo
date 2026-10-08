// 実行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJournal, buildLedger, openingBalances, isCreditNormal } from '../js/journal.js';

const settings = { filingType: 'blue', bizAccount: false, openingBank: { 2026: 200000 } };
const receipts = [
  { id: 'r1', date: '2026-10-05', vendor: 'ENEOS 港北SS', amount: 6820, businessRatio: 80, category: 'fuel', paymentMethod: 'cash', status: 'confirmed' },
  { id: 'r2', date: '2026-10-04', vendor: 'タイムズ', amount: 880, businessRatio: 100, category: 'travel', paymentMethod: 'card', status: 'unconfirmed' },
  { id: 'r3', date: '2025-12-30', vendor: '去年', amount: 1000, businessRatio: 100, category: 'travel', status: 'confirmed' }
];
const sales = [
  { id: 's1', client: 'A運送', month: '2025-12', date: '2026-01-10', amount: 400000, to: 'biz' },
  { id: 's2', client: 'A運送', month: '2026-09', date: '2026-10-10', amount: 426000, to: 'biz' },
  { id: 's3', client: 'A運送', month: '2026-12', date: '2027-01-10', amount: 443000, to: 'private' },
  { id: 's4', client: 'B便', month: '2026-10', date: '2026-10-31', amount: 30000, to: 'private' }
];
const assets = [{ id: 'a1', kind: 'car', name: '軽バン', plate: 'black', cost: 1250000, acquiredOn: '2026-04-01', businessRatio: 80 }];

// 試算表：資産・費用の残高合計 ＝ 負債・資本・収益の残高合計
function balanced(ledger) {
  let dr = 0;
  let cr = 0;
  for (const l of ledger) (isCreditNormal(l.account) ? (cr += l.closing) : (dr += l.closing));
  return [dr, cr];
}

test('経費は事業分の金額で、事業主借（または普通預金）を相手に記帳', () => {
  const j = buildJournal({ year: 2026, receipts, sales: [], assets: [], settings });
  assert.equal(j.length, 2);
  const fuel = j.find((e) => e.dr === '車両費');
  assert.equal(fuel.amount, 5456);
  assert.equal(fuel.cr, '事業主借');
  assert.match(fuel.memo, /事業分80%/);
  const j2 = buildJournal({ year: 2026, receipts, sales: [], assets: [], settings: { ...settings, bizAccount: true } });
  assert.equal(j2.find((e) => e.dr === '旅費交通費').cr, '普通預金');
});

test('売上は対象月の末日に売掛金、入金日に回収。同じ月の入金は1本', () => {
  const j = buildJournal({ year: 2026, receipts: [], sales, assets: [], settings });
  const s2 = j.filter((e) => e.source.id === 's2');
  assert.deepEqual(s2.map((e) => [e.date, e.dr, e.cr]), [['2026-09-30', '売掛金', '売上'], ['2026-10-10', '普通預金', '売掛金']]);
  const s1 = j.filter((e) => e.source.id === 's1');
  assert.deepEqual(s1.map((e) => [e.date, e.dr, e.cr]), [['2026-01-10', '普通預金', '売掛金']]); // 去年の売上の回収だけ
  const s3 = j.filter((e) => e.source.id === 's3');
  assert.deepEqual(s3.map((e) => [e.date, e.dr, e.cr]), [['2026-12-31', '売掛金', '売上']]); // 入金は来年
  const s4 = j.filter((e) => e.source.id === 's4');
  assert.deepEqual(s4.map((e) => [e.date, e.dr, e.cr]), [['2026-10-31', '事業主貸', '売上']]);
});

test('減価償却は年末に計上し、私用分を事業主貸で戻す', () => {
  const j = buildJournal({ year: 2026, receipts: [], sales: [], assets, settings });
  assert.deepEqual(j.map((e) => [e.dr, e.cr, e.amount]), [
    ['車両運搬具', '事業主借', 1250000],
    ['減価償却費', '車両運搬具', 313125],
    ['事業主貸', '減価償却費', 62625]
  ]);
});

test('期首残高と元入金（去年の未入金の売上・固定資産の帳簿価額）', () => {
  const o = openingBalances({ year: 2027, sales, assets, settings: { ...settings, openingBank: { 2027: 50000 } } });
  assert.equal(o['売掛金'], 443000);
  assert.equal(o['車両運搬具'], 1250000 - 313125);
  assert.equal(o['普通預金'], 50000);
  assert.equal(o['元入金'], 443000 + 936875 + 50000);
});

test('総勘定元帳の残高は、資産・費用側と負債・資本・収益側で一致する', () => {
  for (const year of [2026, 2027]) {
    const j = buildJournal({ year, receipts, sales, assets, settings });
    const o = openingBalances({ year, sales, assets, settings });
    const [dr, cr] = balanced(buildLedger(j, o));
    assert.equal(dr, cr, `${year}年`);
  }
});
