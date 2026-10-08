// 実行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usedLife, lifeOf, methodOf, schedule, forYear } from '../js/depreciation.js';

test('中古資産の耐用年数（簡便法）', () => {
  assert.equal(usedLife(4, 2), 2);   // (4-2) + 2×0.2 = 2.4 → 2
  assert.equal(usedLife(6, 3), 3);   // (6-3) + 3×0.2 = 3.6 → 3
  assert.equal(usedLife(4, 5), 2);   // 全部経過：4×0.2 = 0.8 → 最低2年
  assert.equal(usedLife(3, 1), 2);   // (3-1) + 0.2 = 2.2 → 2
});

test('車両の耐用年数（ナンバーの色）', () => {
  assert.equal(lifeOf({ kind: 'car', plate: 'black' }), 3);
  assert.equal(lifeOf({ kind: 'car', plate: 'yellow' }), 4);
  assert.equal(lifeOf({ kind: 'car', plate: 'white' }), 6);
  assert.equal(lifeOf({ kind: 'pc' }), 4);
  assert.equal(lifeOf({ kind: 'other', life: 5 }), 5);
});

test('償却の方法', () => {
  assert.equal(methodOf({ cost: 90000 }, 'blue'), 'expense');
  assert.equal(methodOf({ cost: 180000 }, 'blue'), 'small');
  assert.equal(methodOf({ cost: 299999 }, 'blue'), 'small');
  assert.equal(methodOf({ cost: 180000 }, 'white'), 'lump3');
  assert.equal(methodOf({ cost: 250000 }, 'white'), 'straight');
  assert.equal(methodOf({ cost: 1250000 }, 'blue'), 'straight');
});

test('定額法：黒ナンバーの新車 125万円・4月から使用・事業割合80%', () => {
  const car = { kind: 'car', plate: 'black', cost: 1250000, acquiredOn: '2026-04-01', businessRatio: 80 };
  const y1 = forYear(car, 'blue', 2026);
  assert.equal(y1.depreciation, 313125);        // 1,250,000 × 0.334 × 9/12
  assert.equal(y1.expense, 250500);             // × 80%
  const rows = schedule(car, 'blue');
  assert.equal(rows[rows.length - 1].bookValue, 1); // 最後は1円を残す
  assert.equal(rows.reduce((s, r) => s + r.depreciation, 0), 1249999);
});

test('一括償却資産（白色・18万円）は3年で均等', () => {
  const pc = { kind: 'pc', cost: 180000, acquiredOn: '2026-11-15', businessRatio: 100 };
  const rows = schedule(pc, 'white');
  assert.deepEqual(rows.map((r) => r.depreciation), [60000, 60000, 60000]);
  assert.deepEqual(rows.map((r) => r.year), [2026, 2027, 2028]);
});

test('少額減価償却資産の特例（青色・18万円）は買った年にまとめて経費', () => {
  const pc = { kind: 'pc', cost: 180000, acquiredOn: '2026-11-15', businessRatio: 50 };
  assert.equal(forYear(pc, 'blue', 2026).expense, 90000);
  assert.equal(forYear(pc, 'blue', 2027).expense, 0);
});
