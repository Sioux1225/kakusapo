// 実行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract, isValidInvoiceNo } from '../js/extract.js';
import { suggestCategory } from '../js/categories.js';

const today = new Date('2026-10-07T12:00:00+09:00');

test('ガソリンスタンドのレシート', () => {
  const text = `
    E N E O S
    港 北 S S
    TEL 045-123-4567
    登録番号 T1234567890123
    2026年10月 5日(月) 14:32
    レギュラー 40.25L
    単価 169
    合 計 ¥6,820
    (内消費税等 10% ¥620)
    お預り ¥10,000
    お釣り ¥3,180
  `;
  const r = extract(text, { today });
  assert.equal(r.date, '2026-10-05');
  assert.match(r.vendor, /ENEOS/);
  assert.equal(r.amount, 6820);
  assert.equal(r.taxRate, '10');
  assert.equal(r.taxAmount, 620);
  assert.equal(r.invoiceNo, 'T1234567890123');
  assert.equal(r.conf.amount, 'high');
  const s = suggestCategory(r.text, r.vendor);
  assert.equal(s.top, 'fuel');
});

test('コンビニ（軽減税率と標準税率が混在）', () => {
  const text = `
    ローソン 新横浜店
    2026/10/03 08:12
    おにぎり ※ 150
    ボールペン 220
    小計 ¥370
    (8%対象 ¥150 内消費税 ¥11)
    (10%対象 ¥220 内消費税 ¥20)
    合計 ¥370
    お預り ¥1,000
    お釣 ¥630
    登録番号 T 9876543210987
  `;
  const r = extract(text, { today });
  assert.equal(r.date, '2026-10-03');
  assert.match(r.vendor, /ローソン/);
  assert.equal(r.amount, 370);
  assert.equal(r.taxRate, 'mixed');
  assert.equal(r.taxAmount, 31);
  assert.equal(r.invoiceNo, 'T9876543210987');
});

test('コインパーキング（令和表記・合計が次の行）', () => {
  const text = `
    タイムズ新横浜第5
    領収書
    令和8年10月4日 9:40
    駐車料金
    お支払金額
    ¥880
  `;
  const r = extract(text, { today });
  assert.equal(r.date, '2026-10-04');
  assert.equal(r.amount, 880);
  assert.equal(suggestCategory(r.text, r.vendor).top, 'travel');
});

test('手書き領収書（キーワードなし・円表記）', () => {
  const text = `
    領収書
    山田商店
    26.10.01
    3,000円
    但 お品代として
  `;
  const r = extract(text, { today });
  assert.equal(r.date, '2026-10-01');
  assert.equal(r.vendor, '山田商店');
  assert.equal(r.amount, 3000);
  assert.equal(r.conf.amount, 'low');
  assert.equal(r.conf.date, 'low');
});

test('未来の日付は採用しない', () => {
  const r = extract('2027/05/01\n合計 ¥500', { today });
  assert.equal(r.date, null);
});

test('学習した店名の科目を優先する', () => {
  const s = suggestCategory('山田商店', '山田商店', { '山田商店': 'packing' });
  assert.equal(s.top, 'packing');
  assert.equal(s.confidence, 0.95);
});

test('当てはまらない場合は雑費を提案しない', () => {
  const s = suggestCategory('不明なお店', '不明なお店');
  assert.equal(s.top, null);
  assert.ok(!s.candidates.includes('misc'));
});

test('インボイス番号の形式チェック', () => {
  assert.ok(isValidInvoiceNo('T1234567890123'));
  assert.ok(!isValidInvoiceNo('T123'));
  assert.ok(!isValidInvoiceNo('1234567890123'));
});
