// 実行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPhase3 } from '../js/phase3.js';
import { createPhase4 } from '../js/phase4.js';

function setup(year, settings) {
  const state = {
    taxYear: year,
    settings: { filingType: 'blue', deduction: 65, ...settings },
    receipts: [
      { id: 'r1', date: '2026-10-05', vendor: 'ENEOS', amount: 6820, businessRatio: 80, category: 'fuel', paymentMethod: 'card', status: 'confirmed' },
      { id: 'r2', date: '2026-11-02', vendor: 'ダイソー', amount: 1320, businessRatio: 100, category: 'supplies', paymentMethod: 'cash', status: 'confirmed' }
    ],
    sales: [
      { id: 's1', client: 'A運送', month: '2026-09', date: '2026-10-10', amount: 426000, to: 'biz' },
      { id: 's2', client: 'A運送', month: '2026-12', date: '2027-01-10', amount: 443000, to: 'biz' },
      { id: 's3', client: 'A運送', month: '2026-10', date: '2026-11-10', amount: 438000, to: 'private' }
    ],
    assets: [{ id: 'a1', kind: 'car', name: '軽バン', plate: 'black', cost: 1250000, acquiredOn: '2026-04-01', businessRatio: 80 }]
  };
  const ctx = { state, svg: () => '', ICON: {}, h: String, yen: String, num: String, toast: () => {} };
  const p3 = createPhase3(ctx);
  return createPhase4({ ...ctx, books: p3.books });
}

test('貸借対照表の左右が一致する（事業用口座あり・なし、年をまたぐ）', () => {
  for (const settings of [{ bizAccount: false }, { bizAccount: true, openingBank: { 2026: 300000, 2027: 100000 } }]) {
    for (const year of [2026, 2027]) {
      const bs = createBs(year, settings);
      assert.equal(bs.left.closing, bs.right.closing, `${year}年 期末`);
      assert.equal(bs.left.opening, bs.right.opening, `${year}年 期首`);
      assert.ok(bs.balanced);
    }
  }
});

test('期末の資産：売掛金（12月分の未入金）と車両の帳簿価額', () => {
  const bs = createBs(2026, { bizAccount: false });
  const get = (acc) => (bs.assets.find((r) => r.account === acc) || {}).closing;
  assert.equal(get('売掛金'), 443000);
  assert.equal(get('車両運搬具'), 1250000 - 313125);
  // 控除前の所得 ＝ 売上 1,307,000 − 経費（5,456 + 1,320 + 減価償却 250,500）
  assert.equal(bs.before, 1307000 - 5456 - 1320 - 250500);
});

function createBs(year, settings) {
  return setup(year, settings).balanceSheet(year);
}
