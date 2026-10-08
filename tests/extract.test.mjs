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

test('業務スーパー（外税・合計が読み違えられた実写レシート）', () => {
  // 実際のレシート写真をOCRした結果に近い文字列（合計の大きな数字が崩れ、数字だけの再読み取り結果が行末に付く）
  const text = `
    朱 芳 ズー /パー
    ys 046-259-8288
    登録番号 T1120901013120
    2026年09月26日(土)15:34 >*0002
    000219※8年産 千葉県産コ \\2.380
    000208※料亭の味 \\398
    000036※脈ロース切落し \\1.814
    小計 7.981 1 ¥9811
    (外8% 。 対象 が981) に
    外8 とみ 638
    外税肝 ニー ー-38 ¥38
    (税合計 38) ¥638
    合計 \\8ら. 6139 ¥8.619
  `;
  const r = extract(text, { today });
  assert.equal(r.amount, 8619);
  assert.equal(r.conf.amount, 'high');
  assert.equal(r.date, '2026-09-26');
  assert.equal(r.invoiceNo, 'T1120901013120');
  assert.equal(r.taxAmount, 638);
  assert.equal(r.phone, '0462598288');
});

test('合計の行がない場合は商品の金額を選ばず小計を使う', () => {
  const r = extract('りんご ¥2,380\nみかん ¥398\n小計 ¥2,778', { today });
  assert.equal(r.amount, 2778);
  assert.equal(r.conf.amount, 'low');
});

test('合計の読み取り結果が2通りに分かれたら「自信が低め」にする', () => {
  const r = extract('小計 981\n合計 \\\\ら. 6ら19 ¥8.613 ¥8.619', { today });
  assert.equal(r.conf.amount, 'low');
});

test('合計を3回読んで2回同じなら、その金額で確定', () => {
  const r = extract('合計 \\\\ら. 6ら19 ¥8.619 ¥8.613 ¥8.619', { today });
  assert.equal(r.amount, 8619);
  assert.equal(r.conf.amount, 'high');
});

test('合計の読み取りと「小計＋外税」が一致すれば確定', () => {
  const r = extract('小計 ¥7,981\n外税計 ¥638\n合計 ¥8.613 ¥8.619', { today });
  assert.equal(r.amount, 8619);
  assert.equal(r.conf.amount, 'high');
});

test('区切り方がおかしい数字（8.6139）は金額にしない', () => {
  const r = extract('合計 \\\\ら.、 8619 | ¥8.6139 ¥.19 ¥8.6139', { today });
  assert.equal(r.amount, 8619);
});

test('金額の欠片（19）は合計にしない', () => {
  const r = extract('合計 \\\\ら.、 8619 | ¥19\nお釣り 619', { today });
  assert.equal(r.amount, 8619);
});

test('消費税額の読み取りが割れても、合計から計算した税額に合うものを選ぶ', () => {
  const text = `外8% ¥638
(税合計 \\\\638) | ¥38 ¥6381
合計 ¥8,619`;
  const r = extract(text, { today });
  assert.equal(r.amount, 8619);
  assert.equal(r.taxRate, '8');
  assert.equal(r.taxAmount, 638);
  assert.equal(r.conf.taxAmount, 'high');
});

test('「登録」や「T」を読み落としてもインボイス番号を拾い、店名にはしない', () => {
  const r = extract('吸番号 1120901013120\n業務スーパー\n合計 ¥500', { today });
  assert.equal(r.invoiceNo, 'T1120901013120');
  assert.equal(r.vendor, '業務スーパー');
  const r2 = extract('吸番号 1120901013120\n相武台店\n合計 ¥500', { today });
  assert.equal(r2.vendor, '相武台店');
});

test('読み違いの文字の羅列は店名にしない', () => {
  const r = extract('ーー 0N0逢\n山田商店\n合計 ¥500', { today });
  assert.equal(r.vendor, '山田商店');
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
