// Phase 3：帳簿（仕訳帳・総勘定元帳）の自動作成・閲覧・保存（印刷して PDF ／ CSV）

import { buildJournal, buildLedger, openingBalances, totals } from './journal.js';
import { CATEGORIES, categoryName } from './categories.js';
import { saveFile, exportCsv as receiptsCsv } from './backup.js';
import { businessAmount } from './format.js';

export function createPhase3(ctx) {
  const { state, svg, ICON, h, yen, num, segmented, toast } = ctx;

  /* ---------- 帳簿のデータ ---------- */
  function books(year) {
    const data = { year, receipts: state.receipts, sales: state.sales, assets: state.assets, settings: state.settings };
    const entries = buildJournal(data);
    const opening = openingBalances(data);
    const ledger = buildLedger(entries, opening);
    // 科目の並び：資産 → 負債・資本 → 売上 → 経費（決算書の順）→ その他
    const order = ['普通預金', '売掛金', '車両運搬具', '工具器具備品', '一括償却資産', '事業主貸', '事業主借', '元入金', '売上',
      ...CATEGORIES.map((c) => c.name), '減価償却費'];
    ledger.sort((a, b) => (order.indexOf(a.account) + 1 || 99) - (order.indexOf(b.account) + 1 || 99));
    return { entries, opening, ledger, sum: totals(entries) };
  }
  const journalCount = (year) => books(year).entries.length;

  const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  const back = (href) => `<header class="form-head"><a class="icon-btn plain" href="${href}" aria-label="戻る">${svg(ICON.back, 22, 2)}</a>`;
  const yearSelect = () => `<select class="select-inline" data-action="tax-year" aria-label="年">${ctx.yearsWithData().map((y) => `<option value="${y}"${y === state.taxYear ? ' selected' : ''}>${y}年分</option>`).join('')}</select>`;

  /* ---------- 帳簿の画面 ---------- */
  function viewLedger() {
    const year = state.taxYear;
    const b = books(year);
    const months = [...new Set(b.entries.map((e) => e.date.slice(0, 7)))];
    if (!months.includes(state.ledgerMonth)) state.ledgerMonth = months[months.length - 1] || '';
    const accounts = b.ledger.filter((l) => l.rows.length || l.opening);
    if (!accounts.some((l) => l.account === state.ledgerAccount)) state.ledgerAccount = (accounts.find((l) => l.rows.length) || accounts[0] || {}).account || '';
    const isJournal = state.ledgerView !== 'ledger';

    let body;
    if (!b.entries.length) {
      body = '<div class="card empty">この年の取引はまだありません。領収書や売上を登録すると、自動で帳簿ができます。</div>';
    } else if (isJournal) {
      const list = b.entries.filter((e) => e.date.startsWith(state.ledgerMonth));
      const monthTotal = list.reduce((t, e) => t + e.amount, 0);
      body = `<div class="row-between">
          <select class="select-inline" data-action="ledger-month" aria-label="月">${months.map((m) => `<option value="${m}"${m === state.ledgerMonth ? ' selected' : ''}>${Number(m.slice(5))}月</option>`).join('')}</select>
          <span class="muted small">${list.length}件 ・ 合計 ${yen(monthTotal)}</span></div>
        <section class="card list">${list.map((e) => `<div class="jr-row">
          <div class="jr-head"><span>${md(e.date)}</span><span>${h(e.memo)}</span></div>
          <div class="jr-line"><span class="jr-side">借方</span><span class="grow">${h(e.dr)}</span><b>${num(e.amount)}</b></div>
          <div class="jr-line cr"><span class="jr-side">貸方</span><span class="grow">${h(e.cr)}</span><span>${num(e.amount)}</span></div>
        </div>`).join('')}</section>`;
    } else {
      const l = accounts.find((x) => x.account === state.ledgerAccount);
      body = `<div class="chips">${accounts.map((x) => `<button type="button" class="chip small" data-action="ledger-account" data-value="${h(x.account)}" aria-pressed="${x.account === state.ledgerAccount}">${h(x.account)}</button>`).join('')}</div>
        ${l ? `<section class="card ledger-table">
          <div class="lg-row head"><span>日付</span><span>相手科目</span><span>金額</span><span>残高</span></div>
          ${l.opening ? `<div class="lg-row muted"><span>1/1</span><span>前年から繰越</span><span></span><span>${num(l.opening)}</span></div>` : ''}
          ${l.rows.map((r) => `<div class="lg-row"><span>${md(r.date)}</span><span>${h(r.other)}</span><span>${r.dr ? num(r.dr) : `(${num(r.cr)})`}</span><b>${num(r.balance)}</b></div>`).join('')}
          <div class="lg-row total"><span></span><span>年間の合計</span><span>${num(l.debit || l.credit)}</span><b>${num(l.closing)}</b></div>
        </section><p class="muted small">金額の（ ）は貸方です。</p>` : ''}`;
    }

    return `<main class="screen">
      ${back('#/tax')}<h1>帳簿</h1></header>
      <div class="row-between"><span class="muted">${year}年分 ・ 仕訳 ${b.entries.length}件</span>${yearSelect()}</div>
      <div class="notice"><div>${svg(ICON.check, 16, 2.4)} 領収書・売上・固定資産の登録から、<b>自動で作成</b>しています。自分で入力する必要はありません。</div></div>
      ${segmented('帳簿の種類', [['journal', '仕訳帳'], ['ledger', '総勘定元帳']], isJournal ? 'journal' : 'ledger', 'ledger-view')}
      ${body}
      <a class="btn-outline" href="#/export">${svg(ICON.download, 18, 2)}PDF・CSVで保存</a>
    </main>`;
  }

  /* ---------- 保存の画面 ---------- */
  const PARTS = [
    ['cover', '表紙', '氏名・対象の年・作成日'],
    ['journal', '仕訳帳', '日付順のすべての取引'],
    ['ledger', '総勘定元帳', '科目ごとの取引と残高'],
    ['statement', '決算書・収支内訳書の金額', '売上・経費・所得'],
    ['receipts', '領収書の一覧', '日付・支払先・金額・科目']
  ];

  function viewExport() {
    const year = state.taxYear;
    const p = state.exportParts;
    const pdf = state.exportFormat !== 'csv';
    return `<main class="screen form">
      ${back('#/ledger')}<h1>帳簿の保存</h1></header>
      <div class="row-between card pad"><b>対象の年</b>${yearSelect()}</div>
      <section class="section"><h2>保存する内容</h2>
        <div class="card list">${PARTS.filter(([id]) => pdf || id === 'journal' || id === 'receipts').map(([id, title, sub]) => `<button type="button" class="check-item" role="checkbox" aria-checked="${Boolean(p[id])}" data-action="export-part" data-value="${id}">
          <span class="box">${p[id] ? svg(ICON.check, 14, 3) : ''}</span>
          <span class="grow"><b>${title}</b><span class="muted small">${sub}</span></span></button>`).join('')}</div></section>
      <section class="section"><h2>形式</h2>
        ${segmented('形式', [['pdf', 'PDF（保存・提示用）'], ['csv', 'CSV（表計算用）']], pdf ? 'pdf' : 'csv', 'export-format')}
        <p class="muted small">${pdf
          ? 'A4サイズの印刷用の画面を開きます。「印刷・PDFで保存」を押し、iPhone ではプリント画面の右上の共有ボタン →「"ファイル"に保存」で PDF になります。'
          : '表計算ソフトで開けます。税理士に渡すときや、会計ソフトに取り込むときに使います。'}</p></section>
      <div class="form-actions">
        <button type="button" class="btn-primary" data-action="do-export">${svg(ICON.download, 20, 2.2)} ${pdf ? '印刷用の画面を開く' : 'CSVを保存する'}</button>
        <p class="muted small center">iCloud Drive や Google ドライブに保存すると、7年間の保管も安心です</p>
      </div>
    </main>`;
  }

  /* ---------- 印刷用（A4） ---------- */
  function viewPrint() {
    const year = state.taxYear;
    const b = books(year);
    const p = state.exportParts;
    const s = state.settings;
    const blue = s.filingType !== 'white';
    const f = ctx.figures(year);
    const today = ctx.todayISO();
    const jp = (iso) => `${Number(iso.slice(0, 4))}年${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`;
    const who = h(s.ownerName || '（氏名未設定）');
    const head = (title) => `<div class="pr-head"><h2>${title}</h2><span>${who} ・ ${year}年分</span></div>`;

    const cover = `<section class="pr-page pr-cover">
      <div class="pr-bar"></div>
      <p class="pr-year">${year}年分（令和${year - 2018}年分）</p>
      <h1>帳簿</h1>
      <p class="pr-sub">${[p.journal && '仕訳帳', p.ledger && '総勘定元帳', p.statement && (blue ? '決算書の金額' : '収支内訳書の金額'), p.receipts && '領収書の一覧'].filter(Boolean).join(' ・ ')}</p>
      <table class="pr-info"><tbody>
        <tr><th>氏名</th><td>${who}</td></tr>
        <tr><th>屋号</th><td>${h(s.businessName || '—')}</td></tr>
        <tr><th>対象期間</th><td>${year}年1月1日 〜 ${year}年12月31日</td></tr>
        <tr><th>申告の種類</th><td>${blue ? `青色申告（${Number(s.deduction) === 10 ? '10' : '65'}万円控除）` : '白色申告'}</td></tr>
        <tr><th>作成日</th><td>${jp(today)}</td></tr>
      </tbody></table>
      <p class="pr-foot">確定申告サポート（確サポ）で作成</p>
    </section>`;

    const months = [...new Set(b.entries.map((e) => e.date.slice(0, 7)))];
    const journal = `<section class="pr-page">${head('仕訳帳')}
      <table class="pr-table"><thead><tr><th>日付</th><th>摘要</th><th>借方科目</th><th class="r">借方金額</th><th>貸方科目</th><th class="r">貸方金額</th></tr></thead>
      <tbody>${months.map((m) => {
        const list = b.entries.filter((e) => e.date.startsWith(m));
        const t = list.reduce((x, e) => x + e.amount, 0);
        return list.map((e) => `<tr><td>${md(e.date)}</td><td>${h(e.memo)}</td><td>${h(e.dr)}</td><td class="r">${num(e.amount)}</td><td>${h(e.cr)}</td><td class="r">${num(e.amount)}</td></tr>`).join('')
          + `<tr class="pr-sum"><td></td><td>${Number(m.slice(5))}月 合計（${list.length}件）</td><td></td><td class="r">${num(t)}</td><td></td><td class="r">${num(t)}</td></tr>`;
      }).join('')}
      <tr class="pr-total"><td></td><td>年間 合計（${b.entries.length}件）</td><td></td><td class="r">${num(b.sum.debit)}</td><td></td><td class="r">${num(b.sum.credit)}</td></tr>
      </tbody></table></section>`;

    const ledger = `<section class="pr-page">${head('総勘定元帳')}
      ${b.ledger.filter((l) => l.rows.length || l.opening).map((l) => `<div class="pr-account">
        <h3>${h(l.account)}</h3>
        <table class="pr-table"><thead><tr><th>日付</th><th>相手科目</th><th>摘要</th><th class="r">借方</th><th class="r">貸方</th><th class="r">残高</th></tr></thead><tbody>
        <tr class="pr-muted"><td>1/1</td><td></td><td>前年から繰越</td><td></td><td></td><td class="r">${num(l.opening)}</td></tr>
        ${l.rows.map((r) => `<tr><td>${md(r.date)}</td><td>${h(r.other)}</td><td>${h(r.memo)}</td><td class="r">${r.dr ? num(r.dr) : ''}</td><td class="r">${r.cr ? num(r.cr) : ''}</td><td class="r">${num(r.balance)}</td></tr>`).join('')}
        <tr class="pr-sum"><td></td><td></td><td>年間 合計</td><td class="r">${num(l.debit)}</td><td class="r">${num(l.credit)}</td><td class="r">${num(l.closing)}</td></tr>
        </tbody></table></div>`).join('')}</section>`;

    const statementRows = CATEGORIES.filter((c) => f.byCat[c.id]).map((c) => [blue ? c.blueNo : '', c.name, f.byCat[c.id]]);
    if (f.dep) statementRows.push([blue ? '⑱' : '', '減価償却費', f.dep]);
    statementRows.sort((a, b2) => String(a[0]).localeCompare(String(b2[0])));
    const statement = `<section class="pr-page">${head(blue ? '決算書の金額（損益計算書）' : '収支内訳書の金額')}
      <table class="pr-table pr-narrow"><tbody>
        <tr class="pr-sum"><td>${blue ? '①' : ''}</td><td>売上（収入）金額</td><td class="r">${num(f.sales)}</td></tr>
        ${statementRows.map(([no, name, v]) => `<tr><td>${no}</td><td>${h(name)}</td><td class="r">${num(v)}</td></tr>`).join('')}
        <tr class="pr-sum"><td>${blue ? '㉜' : ''}</td><td>経費の合計</td><td class="r">${num(f.expenses)}</td></tr>
        <tr><td></td><td>差引金額</td><td class="r">${num(f.before)}</td></tr>
        ${blue ? `<tr><td></td><td>青色申告特別控除</td><td class="r">${num(f.deduction)}</td></tr>` : ''}
        <tr class="pr-total"><td></td><td>所得金額</td><td class="r">${num(f.income)}</td></tr>
      </tbody></table></section>`;

    const recs = state.receipts.filter((r) => String(r.date).startsWith(String(year))).sort((a, c) => String(a.date).localeCompare(String(c.date)));
    const receipts = `<section class="pr-page">${head('領収書の一覧')}
      <table class="pr-table"><thead><tr><th>日付</th><th>支払先</th><th>勘定科目</th><th class="r">金額</th><th class="r">事業分</th><th>インボイス</th></tr></thead><tbody>
      ${recs.map((r) => `<tr><td>${md(r.date)}</td><td>${h(r.vendor)}${r.status !== 'confirmed' ? '（未確認）' : ''}</td><td>${h(categoryName(r.category))}</td><td class="r">${num(r.amount)}</td><td class="r">${num(businessAmount(r))}</td><td>${h(r.invoiceNo || '')}</td></tr>`).join('')}
      </tbody></table></section>`;

    return `<div class="print-toolbar no-print">
        <a class="icon-btn plain" href="#/export" aria-label="戻る">${svg(ICON.back, 22, 2)}</a>
        <span class="grow">${year}年分の帳簿（A4）</span>
        <button type="button" class="btn-small" data-action="print-now">印刷・PDFで保存</button>
      </div>
      <div class="print-doc">
        ${p.cover ? cover : ''}${p.journal ? journal : ''}${p.ledger ? ledger : ''}${p.statement ? statement : ''}${p.receipts ? receipts : ''}
      </div>`;
  }

  /* ---------- CSV ---------- */
  const cell = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = (rows) => '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');

  async function exportCsv() {
    const year = state.taxYear;
    const p = state.exportParts;
    let saved = 0;
    if (p.journal) {
      const b = books(year);
      const rows = [['日付', '借方科目', '借方金額', '貸方科目', '貸方金額', '摘要'], ...b.entries.map((e) => [e.date, e.dr, e.amount, e.cr, e.amount, e.memo])];
      if (await saveFile(new Blob([csv(rows)], { type: 'text/csv' }), `kakusapo-${year}-仕訳帳.csv`)) saved++;
    }
    if (p.receipts) {
      if (await receiptsCsv(year)) saved++;
    }
    if (!saved) toast('保存する内容を選んでください');
  }

  /* ---------- 操作 ---------- */
  const actions = {
    'ledger-view': (el) => { state.ledgerView = el.dataset.value; ctx.rerender(); },
    'ledger-account': (el) => { state.ledgerAccount = el.dataset.value; ctx.rerender(); },
    'export-part': (el) => { state.exportParts[el.dataset.value] = !state.exportParts[el.dataset.value]; ctx.rerender(); },
    'export-format': (el) => { state.exportFormat = el.dataset.value; ctx.rerender(); },
    'do-export': () => {
      if (!Object.values(state.exportParts).some(Boolean)) { toast('保存する内容を選んでください'); return; }
      if (state.exportFormat === 'csv') exportCsv();
      else location.hash = '#/print';
    },
    'print-now': () => window.print()
  };

  return { views: { ledger: viewLedger, export: viewExport, print: viewPrint }, actions, books, journalCount };
}
