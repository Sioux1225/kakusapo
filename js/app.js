// 確サポ 本体：画面の切り替え・撮影から保存までの流れ

import { db, requestPersist, newId } from './db.js';
import { extract, isValidInvoiceNo } from './extract.js';
import { CATEGORIES, CATEGORY_MAP, categoryName, suggestCategory, vendorKey } from './categories.js';
import { recognize, warmUp, loadImage, resize, prepareForOcr, toJpeg } from './ocr.js';
import { exportBackup, importBackup, exportCsv, PAY_LABEL, TAX_LABEL } from './backup.js';
import { yen, num, h, todayISO, parseISO, longDate, ym, businessAmount } from './format.js';

export const APP_VERSION = '0.1.5';

const state = {
  receipts: [],
  settings: null,
  draft: null,
  queue: [],
  processing: false,
  listFilter: 'all',
  listQuery: '',
  listMonth: '',
  summaryView: 'month',
  summaryYear: new Date().getFullYear(),
  taxYear: new Date().getFullYear()
};

const $ = (sel) => document.querySelector(sel);
const app = () => $('#app');

/* ---------- アイコン（線で描くSVG） ---------- */
const svg = (d, size = 24, w = 1.8) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  tax: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13l2 2 4-4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  next: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  warn: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>'
};

const LOGO = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 160 160" aria-hidden="true">
  <rect x="2" y="2" width="156" height="156" rx="34" fill="#FFFFFF" stroke="#E6E6E6" stroke-width="4"/>
  <path d="M46 28 H106 V122 L98.5 115 L91 122 L83.5 115 L76 122 L68.5 115 L61 122 L53.5 115 L46 122 Z" fill="none" stroke="#F39801" stroke-width="11" stroke-linejoin="round"/>
  <circle cx="64" cy="58" r="7" fill="#7D7D7D"/><circle cx="88" cy="58" r="7" fill="#7D7D7D"/>
  <path d="M62 79 Q76 93 90 79" fill="none" stroke="#7D7D7D" stroke-width="8" stroke-linecap="round"/>
  <circle cx="118" cy="116" r="23" fill="#F39801" stroke="#FFFFFF" stroke-width="6"/>
  <path d="M108 116 L115.5 123.5 L129 109" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/* ---------- データ ---------- */
async function reload() {
  state.receipts = (await db.allReceipts()).sort((a, b) =>
    String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  state.settings = await db.getSettings();
}

const monthTotal = (key) => state.receipts.filter((r) => ym(r.date) === key).reduce((s, r) => s + businessAmount(r), 0);
const pending = () => state.receipts.filter((r) => r.status !== 'confirmed');

function monthKey(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function yearsWithData() {
  const ys = new Set(state.receipts.map((r) => Number(String(r.date).slice(0, 4))).filter(Boolean));
  ys.add(new Date().getFullYear());
  return [...ys].sort((a, b) => b - a);
}

/* ---------- 共通の部品 ---------- */
function nav(active) {
  const item = (href, key, icon, label) => `<a href="${href}" class="nav-item${active === key ? ' is-active' : ''}"${active === key ? ' aria-current="page"' : ''}>${svg(ICON[icon], 24, active === key ? 2 : 1.8)}<span>${label}</span></a>`;
  return `<nav class="tabbar" aria-label="メインメニュー">
    ${item('#/home', 'home', 'home', 'ホーム')}
    ${item('#/list', 'list', 'list', '一覧')}
    ${item('#/summary', 'summary', 'chart', '集計')}
    ${item('#/tax', 'tax', 'tax', '申告')}
  </nav>`;
}

function segmented(name, options, value, action) {
  return `<div class="segmented" role="group" aria-label="${h(name)}">${options.map(([v, label]) =>
    `<button type="button" data-action="${action}" data-value="${h(v)}" aria-pressed="${v === value}">${h(label)}</button>`).join('')}</div>`;
}

function receiptRow(r, showDay = false) {
  const p = parseISO(r.date);
  const left = showDay
    ? `<div class="row-day"><b>${p.d || '-'}</b><span>${p.dow}</span></div>`
    : `<div class="row-tag">${h(categoryName(r.category).slice(0, 2))}</div>`;
  return `<a class="row" href="#/edit/${encodeURIComponent(r.id)}">
    ${left}
    <div class="row-main">
      <span class="row-title">${h(r.vendor || '（支払先なし）')}</span>
      <span class="row-sub">${showDay ? '' : `${p.m}/${p.d}　`}${h(categoryName(r.category))}${isValidInvoiceNo(r.invoiceNo) ? ' <span class="badge">インボイス</span>' : ''}</span>
    </div>
    <div class="row-end">
      <span class="row-amount">${yen(r.amount)}</span>
      ${r.status !== 'confirmed' ? '<span class="badge warn">未確認</span>' : ''}
    </div>
  </a>`;
}

/* ---------- ホーム ---------- */
function viewHome() {
  const now = monthKey(0);
  const total = monthTotal(now);
  const diff = total - monthTotal(monthKey(-1));
  const monthItems = state.receipts.filter((r) => ym(r.date) === now);
  const confirmed = monthItems.filter((r) => r.status === 'confirmed').length;
  const pend = pending();
  const [y, m] = now.split('-').map(Number);
  const s = state.settings;
  const needBackup = state.receipts.length >= 5 &&
    (!s.lastBackupAt || Date.now() - new Date(s.lastBackupAt).getTime() > 30 * 86400000);
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  return `<main class="screen">
    <header class="home-head">
      <div class="brand">${LOGO(40)}<span class="wordmark" aria-label="確定申告サポート"><span class="g">確定申告</span><span class="o">サポート</span></span></div>
      <a class="icon-btn" href="#/settings" aria-label="設定">${svg(ICON.gear, 20)}</a>
    </header>

    ${isIos && !standalone && !s.installGuideDismissed ? `<div class="notice">
      <div><b>ホーム画面に追加すると、アプリとして使えます</b><br>Safari の共有ボタン ${svg(ICON.share, 14, 2)} →「ホーム画面に追加」</div>
      <button type="button" class="notice-close" data-action="dismiss-install" aria-label="閉じる">${svg(ICON.close, 18)}</button>
    </div>` : ''}

    <section class="hero">
      <div class="hero-label">${y}年${m}月の経費</div>
      <div class="hero-amount"><span>${num(total)}</span><small>円</small></div>
      <div class="hero-sub">${monthItems.length ? `先月より <b>${diff >= 0 ? '+' : '−'}${yen(Math.abs(diff))}</b>　・　確定 ${confirmed}件` : 'まだ今月の領収書はありません'}</div>
    </section>

    <button type="button" class="btn-capture" data-action="capture">${svg(ICON.camera, 26, 2)}領収書を撮影</button>
    <p class="capture-tip">きれいに読み取るコツ：<b>暗めの机の上</b>に置き、レシートが<b>画面いっぱい</b>になるように真上から撮影</p>
    <div class="sub-actions">
      <button type="button" class="btn-ghost" data-action="gallery">${svg(ICON.image, 18)}写真から選ぶ</button>
      <button type="button" class="btn-ghost" data-action="manual">${svg(ICON.pen, 18)}手入力</button>
    </div>

    ${pend.length ? `<a class="alert-card" href="#/list?pending">
      <span class="alert-count">${pend.length}</span>
      <span class="alert-text"><b>未確認の領収書が${pend.length}件</b><br>申告前にまとめて確認できます</span>
      ${svg(ICON.next, 18, 2)}
    </a>` : ''}

    ${needBackup ? `<div class="notice">
      <div><b>バックアップをおすすめします</b><br>${s.lastBackupAt ? '前回から30日以上たっています' : 'まだ一度もバックアップしていません'}</div>
      <button type="button" class="btn-small" data-action="export-backup">今すぐ</button>
    </div>` : ''}

    <section class="section">
      <div class="section-head"><h2>最近の領収書</h2>${state.receipts.length ? '<a href="#/list">すべて見る</a>' : ''}</div>
      ${state.receipts.length ? `<div class="card list">${state.receipts.slice(0, 3).map((r) => receiptRow(r)).join('')}</div>`
        : '<div class="card empty">撮影した領収書がここに表示されます</div>'}
    </section>
  </main>${nav('home')}`;
}

/* ---------- 一覧 ---------- */
function viewList() {
  const q = state.listQuery.trim().toLowerCase();
  let items = state.receipts;
  if (state.listFilter === 'pending') items = items.filter((r) => r.status !== 'confirmed');
  if (state.listMonth) items = items.filter((r) => ym(r.date) === state.listMonth);
  if (q) items = items.filter((r) => `${r.vendor} ${r.amount} ${r.date} ${categoryName(r.category)} ${r.memo}`.toLowerCase().includes(q));

  const months = [...new Set(state.receipts.map((r) => ym(r.date)).filter(Boolean))].sort().reverse();
  const groups = [];
  for (const r of items) {
    const key = ym(r.date) || '日付なし';
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push(g = { key, items: [] });
    g.items.push(r);
  }
  const label = (key) => (key === '日付なし' ? key : `${Number(key.slice(0, 4))}年${Number(key.slice(5, 7))}月`);

  return `<main class="screen">
    <header class="page-head">
      <h1>領収書一覧</h1>
      <select class="select-inline" data-action="list-month" aria-label="表示する月">
        <option value="">すべての月</option>
        ${months.map((k) => `<option value="${k}"${k === state.listMonth ? ' selected' : ''}>${label(k)}</option>`).join('')}
      </select>
    </header>
    <label class="search">${svg(ICON.search, 18, 2)}<input type="search" data-action="list-query" value="${h(state.listQuery)}" placeholder="店名・金額で検索" aria-label="店名・金額で検索"></label>
    ${segmented('表示の切り替え', [['all', `すべて（${state.receipts.length}）`], ['pending', `未確認（${pending().length}）`]], state.listFilter, 'list-filter')}
    ${groups.length ? groups.map((g) => `<section class="section">
      <div class="section-head"><h2>${label(g.key)}</h2><span class="muted">${yen(g.items.reduce((s, r) => s + businessAmount(r), 0))}</span></div>
      <div class="card list">${g.items.map((r) => receiptRow(r, true)).join('')}</div>
    </section>`).join('') : `<div class="card empty">${state.receipts.length ? '条件に合う領収書はありません' : 'まだ領収書がありません'}</div>`}
  </main>
  <button type="button" class="fab" data-action="capture" aria-label="領収書を撮影">${svg(ICON.camera, 26, 2)}</button>
  ${nav('list')}`;
}

/* ---------- 集計 ---------- */
function yearReceipts(year) {
  return state.receipts.filter((r) => String(r.date).startsWith(String(year)));
}

function categoryTotals(items) {
  const totals = {};
  for (const r of items) totals[r.category || 'none'] = (totals[r.category || 'none'] || 0) + businessAmount(r);
  return totals;
}

function viewSummary() {
  const year = state.summaryYear;
  const items = yearReceipts(year);
  const total = items.reduce((s, r) => s + businessAmount(r), 0);
  const pend = items.filter((r) => r.status !== 'confirmed');
  const pendTotal = pend.reduce((s, r) => s + businessAmount(r), 0);
  const months = Array.from({ length: 12 }, (_, i) => monthTotal(`${year}-${String(i + 1).padStart(2, '0')}`));
  const max = Math.max(1, ...months);
  const current = monthKey(0);
  const activeMonths = months.filter((v) => v > 0).length;

  const totals = categoryTotals(items);
  const cats = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const top = Math.max(1, ...Object.values(totals));

  const body = state.summaryView === 'month'
    ? `<div class="card chart">
        <div class="bars">${months.map((v, i) => {
          const key = `${year}-${String(i + 1).padStart(2, '0')}`;
          return `<div class="bar-col${key === current ? ' is-current' : ''}">
            <span class="bar-val">${v ? Math.round(v / 1000) + 'k' : ''}</span>
            <div class="bar" style="height:${Math.round((v / max) * 120)}px"></div>
            <span class="bar-label">${i + 1}月</span>
          </div>`;
        }).join('')}</div>
        <div class="kv"><span>月平均（記録のある月）</span><b>${yen(activeMonths ? Math.round(total / activeMonths) : 0)}</b></div>
      </div>`
    : `<div class="card cats">${cats.length ? cats.map((id) => `<div class="cat-row">
        <div class="cat-top"><span>${h(categoryName(id))}${id === 'misc' ? ' <span class="badge warn">要確認</span>' : ''}</span>
          <span><b>${yen(totals[id])}</b> <small>${total ? (totals[id] / total * 100).toFixed(1) : 0}%</small></span></div>
        <div class="meter"><div class="${id === 'misc' ? 'is-misc' : ''}" style="width:${(totals[id] / top * 100).toFixed(1)}%"></div></div>
      </div>`).join('') : '<div class="empty">この年の領収書はまだありません</div>'}</div>`;

  return `<main class="screen">
    <header class="page-head">
      <h1>集計</h1>
      <select class="select-inline" data-action="summary-year" aria-label="年">${yearsWithData().map((y) => `<option value="${y}"${y === year ? ' selected' : ''}>${y}年</option>`).join('')}</select>
    </header>
    <section class="card total-card">
      <span class="muted">${year}年の経費合計（家事按分後）</span>
      <div class="total-amount"><span>${num(total)}</span><small>円</small></div>
      ${pend.length ? `<span class="warn-text">うち未確認 ${yen(pendTotal)}（${pend.length}件）</span>` : ''}
    </section>
    ${segmented('集計の切り替え', [['month', '月別'], ['category', '科目別']], state.summaryView, 'summary-view')}
    ${body}
    <button type="button" class="btn-outline" data-action="export-csv">${svg(ICON.download, 18, 2)}CSVで書き出す</button>
  </main>${nav('summary')}`;
}

/* ---------- 申告（Phase 1：科目ごとの金額と申告前チェック） ---------- */
function viewTax() {
  const year = state.taxYear;
  const blue = state.settings.filingType !== 'white';
  const items = yearReceipts(year);
  const totals = categoryTotals(items);
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  const rows = CATEGORIES.filter((c) => totals[c.id]).map((c) => ({ c, v: totals[c.id] }));
  const pend = items.filter((r) => r.status !== 'confirmed').length;
  const miscShare = total ? (totals.misc || 0) / total * 100 : 0;
  const s = state.settings;

  const check = (ok, text, href) => `<${href ? `a href="${href}"` : 'div'} class="check-row ${ok ? 'ok' : 'ng'}">${svg(ok ? ICON.check : ICON.alert, 18, ok ? 2.4 : 2)}<span>${text}</span>${href ? svg(ICON.next, 16, 2) : ''}</${href ? 'a' : 'div'}>`;

  return `<main class="screen">
    <header class="page-head">
      <div><h1>確定申告ガイド</h1><span class="muted">${year}年分 ・ 申告期間 ${year + 1}年2月16日〜3月15日</span></div>
      <select class="select-inline" data-action="tax-year" aria-label="年">${yearsWithData().map((y) => `<option value="${y}"${y === year ? ' selected' : ''}>${y}年分</option>`).join('')}</select>
    </header>
    ${segmented('申告の種類', [['blue', '青色申告'], ['white', '白色申告']], blue ? 'blue' : 'white', 'filing-type')}
    <section class="card form-card">
      <div class="form-card-head">
        <b>${blue ? '青色申告決算書（一般用）1ページ目「経費」' : '収支内訳書（一般用）1ページ目「経費」'}</b>
        <span>${blue ? '丸数字は決算書の欄番号です。㉕・㉖は空欄に科目名を書いて追加します' : '同じ名前の欄に金額を書き写します'}</span>
      </div>
      ${rows.length ? rows.map(({ c, v }) => `<div class="form-row">
        <span class="no${blue ? '' : ' plain'}">${blue ? c.blueNo : '・'}</span>
        <span class="form-name">${h(c.name)}${c.extra ? '<small>（追加する科目）</small>' : ''}</span>
        <b>${yen(v)}</b>
      </div>`).join('') : '<div class="empty">この年の領収書はまだありません</div>'}
      <div class="form-total"><span>${blue ? '㉜ ' : ''}経費の合計</span><b>${yen(total)}</b></div>
    </section>
    <section class="card checks">
      <h2>申告前チェック</h2>
      ${check(pend === 0, pend ? `未確認の領収書が${pend}件あります` : '未確認の領収書はありません', pend ? '#/list?pending' : '')}
      ${check(miscShare <= 10, `雑費は全体の${miscShare.toFixed(1)}%（目安10%以下）`)}
      ${check(Boolean(s.lastBackupAt), s.lastBackupAt ? `バックアップ済み（${longDate(s.lastBackupAt.slice(0, 10))}）` : 'まだバックアップしていません', s.lastBackupAt ? '' : '#/settings')}
    </section>
    <div class="info">売上・減価償却・帳簿（仕訳帳・総勘定元帳）・作成コーナーへの転記ガイドは、次のアップデートで追加します。</div>
  </main>${nav('tax')}`;
}

/* ---------- 入力・確認画面 ---------- */
function field(label, name, input, conf) {
  const low = conf === 'low' || conf === 'none';
  return `<label class="field${low ? ' is-low' : ''}">
    <span class="field-label">${low ? svg(ICON.warn, 14, 2.2) : ''}${label}</span>
    ${input}
  </label>`;
}

function viewForm() {
  const d = state.draft;
  if (!d) { location.hash = '#/home'; return ''; }
  const fromOcr = d.isNew && d.hasImage && !d.ocrError;
  const conf = (k) => (fromOcr ? d.conf[k] : 'high');
  const anyLow = fromOcr && ['date', 'vendor', 'amount'].some((k) => d.conf[k] !== 'high');
  const cands = [...d.candidates];
  if (d.category && !cands.includes(d.category)) cands.unshift(d.category);

  let message = '内容を入力してください';
  if (d.ocrError) message = `読み取りできませんでした（${h(d.ocrError)}）。手入力してください。`;
  else if (fromOcr) message = anyLow ? '印の付いた項目は自信が低めです。<br>確認してから確定してください。' : '内容を確認して確定してください。';
  else if (!d.isNew) message = d.status === 'confirmed' ? '確定済みの領収書です。修正できます。' : '未確認の領収書です。確認して確定してください。';

  const taxOptions = [['10', '10%'], ['8', '8%（軽減税率）'], ['mixed', '10%と8%が混在'], ['unknown', 'わからない']];
  return `<main class="screen form">
    <header class="form-head">
      <button type="button" class="icon-btn plain" data-action="form-cancel" aria-label="戻る">${svg(ICON.back, 22, 2)}</button>
      <h1>${d.isNew ? (d.hasImage ? '読取結果の確認' : '手入力') : '領収書の詳細'}</h1>
    </header>

    <div class="form-intro">
      ${d.imageUrl ? `<button type="button" class="thumb" data-action="open-image" aria-label="画像を拡大"><img src="${d.imageUrl}" alt=""></button>` : ''}
      <div class="form-intro-text">
        <p>${message}</p>
        ${d.isNew && d.hasImage ? `<button type="button" class="btn-small ghost" data-action="retake">${svg(ICON.camera, 16, 2)}撮り直す</button>` : ''}
      </div>
    </div>

    <div class="card fields">
      ${field('日付', 'date', `<input type="date" data-field="date" value="${h(d.date)}" max="${todayISO()}">`, conf('date'))}
      ${field('支払先', 'vendor', `<input type="text" data-field="vendor" value="${h(d.vendor)}" placeholder="例：ENEOS 港北SS" autocomplete="off">`, conf('vendor'))}
      ${field('金額（税込）', 'amount', `<span class="yen-input"><input type="text" inputmode="numeric" data-field="amount" value="${d.amount ? num(d.amount) : ''}" placeholder="0"><span>円</span></span>`, conf('amount'))}
      ${field('税率', 'taxRate', `<select data-field="taxRate">${taxOptions.map(([v, l]) => `<option value="${v}"${d.taxRate === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`, 'high')}
      ${field('消費税額', 'taxAmount', `<span class="yen-input"><input type="text" inputmode="numeric" data-field="taxAmount" value="${d.taxAmount ? num(d.taxAmount) : ''}" placeholder="わかれば"><span>円</span></span>`, d.taxAmount != null ? conf('taxAmount') : 'high')}
      ${field('インボイス登録番号', 'invoiceNo', `<span class="invoice-input"><input type="text" data-field="invoiceNo" value="${h(d.invoiceNo)}" placeholder="T＋13桁" autocapitalize="characters" autocomplete="off">${isValidInvoiceNo(d.invoiceNo) ? `<span class="ok-mark" aria-label="形式OK">${svg(ICON.check, 16, 2.6)}</span>` : ''}</span>`, 'high')}
    </div>

    <section class="section">
      <div class="section-head"><h2>勘定科目</h2>${d.matched ? `<span class="muted">「${h(d.matched)}」から提案</span>` : ''}</div>
      <div class="chips">${cands.map((id) => `<button type="button" class="chip" data-action="pick-cat" data-value="${id}" aria-pressed="${d.category === id}">${h(categoryName(id))}${id === d.suggested ? '（おすすめ）' : ''}</button>`).join('')}</div>
      <select class="select-full" data-field="category" aria-label="その他の科目から選ぶ">
        <option value="">その他の科目から選ぶ</option>
        ${CATEGORIES.map((c) => `<option value="${c.id}"${d.category === c.id ? ' selected' : ''}>${h(c.name)}（${h(c.hint)}）</option>`).join('')}
      </select>
      ${d.category === 'misc' ? `<div class="warn-box">${svg(ICON.alert, 18, 2)}<div><b>雑費にする前に確認</b><br>ほかの科目（車両費・消耗品費・通信費など）に当てはまりませんか？雑費が多いと税務署から確認されやすくなります。</div></div>` : ''}
      ${d.amount >= 100000 ? `<div class="warn-box">${svg(ICON.alert, 18, 2)}<div><b>10万円以上の買い物です</b><br>車両やパソコンなどの長く使うものは「減価償却」が必要になる場合があります（次のアップデートで対応予定）。</div></div>` : ''}
    </section>

    <div class="card fields">
      ${field('仕事で使った割合（家事按分）', 'businessRatio', `<span class="yen-input"><input type="number" inputmode="numeric" min="0" max="100" step="5" data-field="businessRatio" value="${h(d.businessRatio)}"><span>%</span></span>`, 'high')}
      ${field('支払方法', 'paymentMethod', `<select data-field="paymentMethod">${Object.entries(PAY_LABEL).map(([v, l]) => `<option value="${v}"${d.paymentMethod === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`, 'high')}
      ${field('メモ', 'memo', `<textarea data-field="memo" rows="2" placeholder="何に使ったか（任意）">${h(d.memo)}</textarea>`, 'high')}
    </div>

    <div class="form-actions">
      <button type="button" class="btn-primary" data-action="save-confirm">この内容で確定</button>
      <button type="button" class="btn-text" data-action="save-later">${d.isNew ? 'あとで確認する' : '未確認として保存'}</button>
      ${d.isNew ? '' : '<button type="button" class="btn-text danger" data-action="delete">この領収書を削除</button>'}
    </div>

    ${d.isNew && d.hasImage ? `<details class="debug">
      <summary>読み取りの詳細（うまく読めないときの確認用）</summary>
      ${d.debug ? `<p class="small muted">元の画像 ${h(d.debug.source)} ／ 紙の範囲 ${h(d.debug.paper)} ／ 読み取り用 ${h(d.debug.prepared)} ／ ${h(d.debug.seconds)}秒 ／ v${APP_VERSION}</p>
      <img src="${d.debug.image}" alt="読み取り用に加工した画像">` : ''}
      <pre>${h(d.ocrRaw || '（文字を読み取れませんでした）')}</pre>
    </details>` : ''}
  </main>`;
}

/* ---------- 設定 ---------- */
function viewSettings() {
  const s = state.settings;
  return `<main class="screen">
    <header class="form-head">
      <a class="icon-btn plain" href="#/home" aria-label="戻る">${svg(ICON.back, 22, 2)}</a>
      <h1>設定</h1>
    </header>

    <section class="section">
      <h2>申告の種類</h2>
      ${segmented('申告の種類', [['blue', '青色申告'], ['white', '白色申告']], s.filingType, 'filing-type')}
    </section>

    <section class="section">
      <h2>バックアップ</h2>
      <div class="card pad">
        <p class="muted small">データはこのスマホの中だけに保存されています。機種変更や故障に備えて、月に1回はバックアップを保存してください（iCloud Drive や Google ドライブに保存すると安心です）。</p>
        <p class="small">前回のバックアップ：<b>${s.lastBackupAt ? longDate(s.lastBackupAt.slice(0, 10)) : 'まだありません'}</b></p>
        <div class="btn-row">
          <button type="button" class="btn-outline" data-action="export-backup">${svg(ICON.download, 18, 2)}バックアップを保存</button>
          <button type="button" class="btn-outline" data-action="import-backup">${svg(ICON.upload, 18, 2)}バックアップから復元</button>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>仕事で使った割合の初期値</h2>
      <div class="card list">
        ${CATEGORIES.map((c) => `<label class="ratio-row"><span>${h(c.name)}<small>${h(c.hint)}</small></span>
          <span class="yen-input small"><input type="number" inputmode="numeric" min="0" max="100" step="5" data-ratio="${c.id}" value="${s.ratios[c.id]}"><span>%</span></span></label>`).join('')}
      </div>
      <p class="muted small">新しく登録する領収書に使われます。仕事専用の車なら車両費・修繕費などは100%にしてください。</p>
    </section>

    <section class="section">
      <h2>このアプリについて</h2>
      <div class="card pad small">
        <p>確サポ バージョン ${APP_VERSION}</p>
        <p class="muted">領収書の画像と内容はこのスマホの中で処理・保存され、外部には送信されません（読み取り用のプログラムと日本語データのみ、初回にダウンロードします）。</p>
        <p class="muted">紙の領収書は捨てずに保管してください。申告内容の最終確認はご自身で行い、迷ったときは税務署の無料相談をご利用ください。</p>
      </div>
      <button type="button" class="btn-text danger" data-action="clear-all">すべてのデータを削除</button>
    </section>
  </main>`;
}

/* ---------- 画面の切り替え ---------- */
function route() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const [view, param] = path.split('/');
  return { view: view || 'home', param: param ? decodeURIComponent(param) : '', query: query || '' };
}

async function render() {
  const { view, param, query } = route();
  if (view === 'list' && query === 'pending') state.listFilter = 'pending';
  if (view === 'edit' && (!state.draft || state.draft.id !== param)) {
    await loadDraftFromReceipt(param);
    if (!state.draft) { location.hash = '#/list'; return; }
  }
  if ((view === 'form' || view === 'edit') && !state.draft) { location.hash = '#/home'; return; }
  if (view !== 'form' && view !== 'edit') discardDraft();

  const views = { home: viewHome, list: viewList, summary: viewSummary, tax: viewTax, settings: viewSettings, form: viewForm, edit: viewForm };
  app().innerHTML = (views[view] || viewHome)();
  document.title = '確サポ';
  if (state.scrollTop === false) state.scrollTop = true;
  else window.scrollTo(0, 0);
}

/* ---------- 撮影 → 読み取り → 下書き ---------- */
function showOverlay(label, progress) {
  const o = $('#overlay');
  o.hidden = false;
  o.querySelector('.overlay-label').textContent = label;
  o.querySelector('.overlay-bar > div').style.width = `${Math.round((progress || 0) * 100)}%`;
}
const hideOverlay = () => { $('#overlay').hidden = true; };

function baseDraft() {
  return {
    id: newId(), isNew: true, hasImage: false, imageBlob: null, imageUrl: '', imageId: '',
    date: todayISO(), vendor: '', amount: 0, taxRate: 'unknown', taxAmount: null, invoiceNo: '',
    category: '', suggested: '', categoryConfidence: 0, candidates: suggestCategory('', '').candidates, matched: '',
    paymentMethod: 'cash', businessRatio: 100, ratioTouched: false, memo: '', status: 'unconfirmed',
    ocrRaw: '', ocrError: '', conf: {}, createdAt: '', phone: ''
  };
}

async function buildDraft(file) {
  const d = baseDraft();
  showOverlay('画像を準備しています', 0.02);
  const img = await loadImage(file);
  d.imageBlob = await toJpeg(resize(img, 1600), 0.8);
  d.imageUrl = URL.createObjectURL(d.imageBlob);
  d.hasImage = true;
  let text = '';
  const started = Date.now();
  try {
    const prepared = prepareForOcr(img);
    // 不具合の調査用：OCRに渡した画像（縮小）と処理の情報
    const preview = resize(prepared, 900);
    d.debug = { ...prepared.info, image: preview.toDataURL('image/jpeg', 0.6) };
    const result = await recognize(prepared, (p, label) => showOverlay(label, p));
    text = result.text;
  } catch (e) {
    d.ocrError = e && e.message ? e.message : '読み取りエラー';
  }
  if (d.debug) d.debug.seconds = ((Date.now() - started) / 1000).toFixed(1);
  const ex = extract(text);
  if (location.hostname === 'localhost') window.__lastOcr = text; // 開発時の確認用
  // 前に確定した店なら、電話番号から店名を補う（大きな店名は読み違えやすいため）
  const known = ex.phone && state.settings.phoneMap[ex.phone];
  if (known) {
    ex.vendor = known;
    ex.conf.vendor = 'high';
  }
  const sug = suggestCategory(ex.text, ex.vendor, state.settings.vendorMap);
  Object.assign(d, {
    date: ex.date || todayISO(),
    vendor: ex.vendor,
    amount: ex.amount || 0,
    taxRate: ex.taxRate,
    taxAmount: ex.taxAmount,
    invoiceNo: ex.invoiceNo,
    conf: { ...ex.conf, date: ex.date ? ex.conf.date : 'none' },
    category: sug.top || '',
    suggested: sug.top || '',
    categoryConfidence: sug.confidence,
    candidates: sug.candidates,
    matched: sug.matched,
    businessRatio: sug.top ? state.settings.ratios[sug.top] ?? 100 : 100,
    ocrRaw: text,
    phone: ex.phone
  });
  return d;
}

async function nextInQueue() {
  const file = state.queue.shift();
  if (!file) return;
  state.processing = true;
  try {
    state.draft = await buildDraft(file);
  } catch (e) {
    toast(e && e.message ? e.message : '画像を読み込めませんでした');
    state.draft = null;
  } finally {
    hideOverlay();
    state.processing = false;
  }
  if (state.draft) {
    if (location.hash === '#/form') render();
    else location.hash = '#/form';
  } else if (state.queue.length) {
    nextInQueue();
  }
}

function handleFiles(fileList) {
  const files = [...fileList].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name));
  if (!files.length) return;
  if (state.retake) {
    state.retake = false;
    discardDraft();
  }
  state.queue.push(...files);
  if (files.length > 1) toast(`${files.length}枚を順番に読み取ります`);
  if (!state.processing && !state.draft) nextInQueue();
}

async function loadDraftFromReceipt(id) {
  const r = await db.getReceipt(id);
  if (!r) { state.draft = null; return; }
  const d = { ...baseDraft(), ...r, isNew: false, hasImage: Boolean(r.imageId), conf: {}, ratioTouched: true };
  const sug = suggestCategory(r.ocrRaw || '', r.vendor, {});
  d.candidates = sug.candidates;
  d.suggested = '';
  d.matched = '';
  if (r.imageId) {
    const blob = await db.getImage(r.imageId);
    if (blob) d.imageUrl = URL.createObjectURL(blob);
  }
  state.draft = d;
}

function discardDraft() {
  if (state.draft && state.draft.imageUrl) URL.revokeObjectURL(state.draft.imageUrl);
  state.draft = null;
}

async function saveDraft(final) {
  const d = state.draft;
  if (!d) return;
  if (final) {
    const missing = [];
    if (!d.date) missing.push('日付');
    if (!String(d.vendor).trim()) missing.push('支払先');
    if (!(d.amount > 0)) missing.push('金額');
    if (!d.category) missing.push('勘定科目');
    if (missing.length) { toast(`${missing.join('・')}を入力してください`); return; }
    if (d.category === 'misc' && !window.confirm('雑費で確定しますか？\nほかの科目に当てはまらない場合だけ雑費にしてください。')) return;
  }
  const now = new Date().toISOString();
  let imageId = d.imageId;
  if (d.imageBlob && !imageId) {
    imageId = newId();
    await db.putImage(imageId, d.imageBlob);
  }
  const record = {
    id: d.id,
    date: d.date,
    vendor: String(d.vendor).trim(),
    amount: Number(d.amount) || 0,
    taxRate: d.taxRate,
    taxAmount: d.taxAmount == null || d.taxAmount === '' ? null : Number(d.taxAmount),
    invoiceNo: String(d.invoiceNo || '').trim(),
    category: d.category,
    categoryConfidence: d.categoryConfidence,
    paymentMethod: d.paymentMethod,
    businessRatio: Math.max(0, Math.min(100, Number(d.businessRatio))),
    memo: d.memo,
    imageId,
    status: final ? 'confirmed' : 'unconfirmed',
    ocrRaw: d.ocrRaw,
    phone: d.phone || '',
    createdAt: d.createdAt || now,
    updatedAt: now
  };
  await db.putReceipt(record);
  if (final && record.vendor && record.category) {
    state.settings.vendorMap[vendorKey(record.vendor)] = record.category;
    if (record.phone) state.settings.phoneMap[record.phone] = record.vendor;
    await db.saveSettings(state.settings);
  }
  requestPersist();
  await reload();
  discardDraft();
  toast(final ? '確定しました' : '未確認として保存しました');
  if (state.queue.length) nextInQueue();
  else location.hash = d.isNew ? '#/home' : '#/list';
}

/* ---------- 入力の反映 ---------- */
const toInt = (v) => {
  const n = parseInt(String(v).normalize('NFKC').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

function setCategory(id) {
  const d = state.draft;
  d.category = id;
  if (!d.ratioTouched && id) d.businessRatio = state.settings.ratios[id] ?? 100;
  state.scrollTop = false;
  render();
}

function onFieldInput(el) {
  const d = state.draft;
  if (!d) return;
  const f = el.dataset.field;
  if (f === 'amount') {
    d.amount = toInt(el.value);
  } else if (f === 'taxAmount') {
    d.taxAmount = el.value.trim() ? toInt(el.value) : null;
  } else if (f === 'businessRatio') {
    d.businessRatio = el.value === '' ? 0 : Math.max(0, Math.min(100, toInt(el.value)));
    d.ratioTouched = true;
  } else if (f === 'invoiceNo') {
    d.invoiceNo = el.value.normalize('NFKC').toUpperCase().replace(/\s/g, '');
  } else if (f === 'category') {
    if (el.value) setCategory(el.value);
  } else {
    d[f] = el.value;
  }
}

/* ---------- 操作 ---------- */
const actions = {
  capture: () => { warmUp(); $('#camera-input').click(); },
  // 撮り直し：新しい写真が選ばれた時点で今の下書きを捨てる（キャンセルした場合はそのまま）
  retake: () => { state.retake = true; $('#camera-input').click(); },
  gallery: () => { warmUp(); $('#gallery-input').click(); },
  manual: () => { state.draft = baseDraft(); location.hash = '#/form'; },
  'list-filter': (el) => { state.listFilter = el.dataset.value; state.scrollTop = false; if (location.hash !== '#/list') location.hash = '#/list'; else render(); },
  'summary-view': (el) => { state.summaryView = el.dataset.value; state.scrollTop = false; render(); },
  'filing-type': async (el) => { state.settings.filingType = el.dataset.value; await db.saveSettings(state.settings); state.scrollTop = false; render(); },
  'pick-cat': (el) => setCategory(el.dataset.value),
  'save-confirm': () => saveDraft(true),
  'save-later': () => saveDraft(false),
  'form-cancel': () => {
    const d = state.draft;
    if (d && d.isNew && !window.confirm('入力した内容を破棄しますか？')) return;
    state.queue = [];
    discardDraft();
    location.hash = d && !d.isNew ? '#/list' : '#/home';
  },
  delete: async () => {
    const d = state.draft;
    if (!window.confirm('この領収書を削除しますか？\n（元に戻せません）')) return;
    await db.deleteReceipt(d);
    await reload();
    discardDraft();
    toast('削除しました');
    location.hash = '#/list';
  },
  'open-image': () => {
    const v = $('#viewer');
    v.querySelector('img').src = state.draft.imageUrl;
    v.hidden = false;
  },
  'close-viewer': () => { $('#viewer').hidden = true; },
  'export-backup': async () => {
    try {
      showOverlay('バックアップを作成しています', 0.5);
      const r = await exportBackup();
      hideOverlay();
      await reload();
      if (r.saved) toast(`${r.count}件をバックアップしました`);
      render();
    } catch (e) {
      hideOverlay();
      toast('バックアップに失敗しました');
    }
  },
  'import-backup': () => $('#import-input').click(),
  'export-csv': () => exportCsv(state.summaryYear),
  'dismiss-install': async () => { state.settings.installGuideDismissed = true; await db.saveSettings(state.settings); render(); },
  'clear-all': async () => {
    if (!window.confirm('すべての領収書と設定を削除します。よろしいですか？')) return;
    if (!window.confirm('本当に削除しますか？バックアップがない場合は元に戻せません。')) return;
    await db.clearAll();
    await reload();
    toast('すべてのデータを削除しました');
    location.hash = '#/home';
  }
};

let toastTimer = null;
function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function bindEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el); }
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.field && el.dataset.field !== 'category') onFieldInput(el);
    if (el.dataset.action === 'list-query') {
      state.listQuery = el.value;
      const pos = el.selectionStart;
      state.scrollTop = false;
      render();
      const again = document.querySelector('[data-action="list-query"]');
      again.focus();
      again.setSelectionRange(pos, pos);
    }
  });
  document.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.field === 'category') onFieldInput(el);
    else if (el.dataset.field === 'amount' || el.dataset.field === 'invoiceNo') { onFieldInput(el); state.scrollTop = false; render(); }
    else if (el.dataset.action === 'list-month') { state.listMonth = el.value; state.scrollTop = false; render(); }
    else if (el.dataset.action === 'summary-year') { state.summaryYear = Number(el.value); state.scrollTop = false; render(); }
    else if (el.dataset.action === 'tax-year') { state.taxYear = Number(el.value); state.scrollTop = false; render(); }
    else if (el.dataset.ratio) {
      state.settings.ratios[el.dataset.ratio] = Math.max(0, Math.min(100, toInt(el.value)));
      await db.saveSettings(state.settings);
      toast('保存しました');
    }
  });
  $('#camera-input').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
  $('#gallery-input').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
  $('#import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      showOverlay('バックアップを読み込んでいます', 0.5);
      const r = await importBackup(file);
      await reload();
      toast(`${r.added}件を復元しました`);
      render();
    } catch (err) {
      toast(err.message);
    } finally {
      hideOverlay();
    }
  });
  $('#viewer').addEventListener('click', () => { $('#viewer').hidden = true; });
  window.addEventListener('hashchange', render);
}

async function start() {
  await reload();
  bindEvents();
  await render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

start();
