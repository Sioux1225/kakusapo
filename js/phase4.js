// Phase 4：貸借対照表と、確定申告書等作成コーナーへの転記ガイド

import { CATEGORIES } from './categories.js';
import { schedule, methodOf, lifeOf, STRAIGHT_LINE_RATE } from './depreciation.js';
import { isCreditNormal } from './journal.js';

// 貸借対照表の左側（資産）に並べる科目
const ASSET_ACCOUNTS = ['普通預金', '売掛金', '車両運搬具', '工具器具備品', '一括償却資産', '事業主貸'];

export function createPhase4(ctx) {
  const { state, svg, ICON, h, yen, num, db, toast } = ctx;

  /* ---------- 貸借対照表 ---------- */
  function balanceSheet(year) {
    const { ledger, opening } = ctx.books(year);
    const bal = (acc) => (ledger.find((l) => l.account === acc) || { closing: 0 }).closing;
    const assets = ASSET_ACCOUNTS
      .map((acc) => ({ account: acc, opening: acc === '事業主貸' ? 0 : opening[acc] || 0, closing: bal(acc) }))
      .filter((r) => r.opening || r.closing);
    const revenue = ledger.filter((l) => l.account === '売上').reduce((t, l) => t + l.closing, 0);
    const expenses = ledger
      .filter((l) => !isCreditNormal(l.account) && !ASSET_ACCOUNTS.includes(l.account))
      .reduce((t, l) => t + l.closing, 0);
    const before = revenue - expenses;
    const capital = opening['元入金'] || 0;
    const liabilities = [
      { account: '事業主借', opening: 0, closing: bal('事業主借') },
      { account: '元入金', opening: capital, closing: capital },
      { account: '青色申告特別控除前の所得金額', opening: 0, closing: before }
    ].filter((r) => r.opening || r.closing);
    const sum = (rows, k) => rows.reduce((t, r) => t + r[k], 0);
    const left = { opening: sum(assets, 'opening'), closing: sum(assets, 'closing') };
    const right = { opening: sum(liabilities, 'opening'), closing: sum(liabilities, 'closing') };
    return {
      assets, liabilities, left, right, before,
      balanced: left.closing === right.closing && left.opening === right.opening,
      negativeBank: bal('普通預金') < 0
    };
  }

  function bsHtml(year) {
    const bs = balanceSheet(year);
    const rows = (list) => list.map((r) => `<div class="bs-row"><span>${h(r.account)}</span><span>${num(r.opening)}</span><b>${num(r.closing)}</b></div>`).join('');
    return `<div class="${bs.balanced ? 'notice' : 'warn-box'}">${svg(bs.balanced ? ICON.check : ICON.alert, 18, 2.2)}<div>${bs.balanced
        ? '<b>左右の合計が一致しています</b>（帳簿に問題はありません）'
        : '<b>左右の合計が一致していません。</b>設定の「1月1日時点の事業用口座の残高」などを確認してください。'}</div></div>
      ${bs.negativeBank ? `<div class="warn-box">${svg(ICON.alert, 18, 2)}<div>事業用口座（普通預金）の残高がマイナスです。設定で「${year}年1月1日時点の事業用口座の残高」を入力してください。</div></div>` : ''}
      <section class="card bs">
        <div class="bs-row head"><span>資産の部</span><span>1月1日</span><span>12月31日</span></div>
        ${rows(bs.assets) || '<div class="empty">まだありません</div>'}
        <div class="bs-row total"><span>合計</span><span>${num(bs.left.opening)}</span><b>${num(bs.left.closing)}</b></div>
      </section>
      <section class="card bs">
        <div class="bs-row head"><span>負債・資本の部</span><span>1月1日</span><span>12月31日</span></div>
        ${rows(bs.liabilities) || '<div class="empty">まだありません</div>'}
        <div class="bs-row total"><span>合計</span><span>${num(bs.right.opening)}</span><b>${num(bs.right.closing)}</b></div>
      </section>
      <p class="muted small">「事業主貸・事業主借」は、事業と生活のお金のやりとりです。翌年の1月1日に自動で「元入金」にまとめます。</p>`;
  }

  function bsPrintHtml(year, who) {
    const bs = balanceSheet(year);
    const rows = (list) => list.map((r) => `<tr><td>${h(r.account)}</td><td class="r">${num(r.opening)}</td><td class="r">${num(r.closing)}</td></tr>`).join('');
    const table = (title, list, t) => `<table class="pr-table pr-narrow"><thead><tr><th>${title}</th><th class="r">1月1日（期首）</th><th class="r">12月31日（期末）</th></tr></thead>
      <tbody>${rows(list)}<tr class="pr-total"><td>合計</td><td class="r">${num(t.opening)}</td><td class="r">${num(t.closing)}</td></tr></tbody></table>`;
    return `<section class="pr-page"><div class="pr-head"><h2>貸借対照表</h2><span>${who} ・ ${year}年分</span></div>
      ${table('資産の部', bs.assets, bs.left)}<div style="height:16px"></div>${table('負債・資本の部', bs.liabilities, bs.right)}</section>`;
  }

  /* ---------- 転記ガイド ---------- */
  const isBlue = () => state.settings.filingType !== 'white';
  const with65 = () => isBlue() && Number(state.settings.deduction) !== 10;
  const doneMap = (year) => ((state.settings.transferDone || {})[year]) || {};

  function steps(year) {
    const f = ctx.figures(year);
    const blue = isBlue();
    const ft = state.settings.filingType;
    const expenseItems = CATEGORIES.filter((c) => f.byCat[c.id]).map((c) => ({
      key: `exp-${c.id}`, label: blue ? `${c.blueNo} ${c.name}` : c.name, value: f.byCat[c.id],
      hint: c.extra ? `空欄の科目に「${c.name}」と入力してから金額を入れます` : ''
    }));
    if (f.dep) expenseItems.push({ key: 'exp-dep', label: blue ? '⑱ 減価償却費' : '減価償却費', value: f.dep });
    expenseItems.sort((a, b) => a.label.localeCompare(b.label));
    expenseItems.push({ key: 'exp-total', label: blue ? '㉜ 経費の合計（自動計算と一致するか確認）' : '経費の合計（自動計算と一致するか確認）', value: f.expenses, check: true });

    const assetItems = [];
    for (const a of state.assets) {
      const row = schedule(a, ft, year).find((r) => r.year === year);
      if (!row) continue;
      const method = methodOf(a, ft);
      const name = a.name || { car: '車両', pc: 'パソコン', other: '固定資産' }[a.kind];
      const months = method === 'straight' && Number(String(a.acquiredOn).slice(0, 4)) === year ? 12 - Number(a.acquiredOn.slice(5, 7)) + 1 : 12;
      const life = method === 'straight' ? lifeOf(a) : method === 'lump3' ? 3 : '';
      const p = `asset-${a.id}`;
      assetItems.push(
        { key: `${p}-name`, label: '減価償却資産の名称', value: name, text: true, group: name },
        { key: `${p}-date`, label: '取得年月', value: `${a.acquiredOn.slice(0, 4)}年${Number(a.acquiredOn.slice(5, 7))}月`, text: true },
        { key: `${p}-cost`, label: '取得価額', value: Number(a.cost) },
        { key: `${p}-method`, label: '償却方法', value: { straight: '定額法', lump3: '一括償却', small: '少額特例（措法28の2）', expense: '—' }[method], text: true },
        ...(life ? [{ key: `${p}-life`, label: '耐用年数', value: `${life}年`, text: true }] : []),
        ...(method === 'straight' ? [{ key: `${p}-rate`, label: '償却率', value: String(STRAIGHT_LINE_RATE[life] || ''), text: true }, { key: `${p}-months`, label: '本年中の償却期間', value: `${months}か月`, text: true }] : []),
        { key: `${p}-dep`, label: '本年分の償却費', value: row.depreciation },
        { key: `${p}-ratio`, label: '事業専用割合', value: `${a.businessRatio ?? 100}%`, text: true },
        { key: `${p}-exp`, label: '本年分の必要経費算入額', value: row.expense },
        { key: `${p}-book`, label: '未償却残高（期末残高）', value: row.bookValue }
      );
    }

    const bsItems = [];
    if (with65()) {
      const bs = balanceSheet(year);
      for (const r of [...bs.assets, ...bs.liabilities]) {
        if (r.opening) bsItems.push({ key: `bs-o-${r.account}`, label: `${r.account}（1月1日）`, value: r.opening });
        if (r.closing) bsItems.push({ key: `bs-c-${r.account}`, label: `${r.account}（12月31日）`, value: r.closing });
      }
    }

    const list = [
      { id: 'sales', title: '収入', intro: '作成コーナーの「収入金額」の入力画面で、売上の金額を入力します。', items: [{ key: 'sales', label: blue ? '① 売上（収入）金額' : '売上（収入）金額', value: f.sales }] },
      { id: 'expenses', title: '経費', intro: '「必要経費」の入力画面で、上から順に金額を入力してください。', items: expenseItems },
      { id: 'assets', title: '減価償却', intro: assetItems.length ? '「減価償却費の計算」の入力画面で、資産ごとに入力します。' : 'この年に計上する減価償却はありません。このステップは飛ばしてください。', items: assetItems },
      ...(with65() ? [{ id: 'bs', title: '貸借対照表', intro: '「貸借対照表」の入力画面で、1月1日（期首）と12月31日（期末）の金額を入力します。', items: bsItems }] : []),
      {
        id: 'deductions', title: '所得控除', intro: '確サポでは記録していない項目です。手元の控除証明書や領収書を見て、作成コーナーに入力してください。',
        items: [
          { key: 'd-social', label: '社会保険料（国民年金・国民健康保険など）', checkOnly: true },
          { key: 'd-life', label: '生命保険料・地震保険料（控除証明書）', checkOnly: true },
          { key: 'd-small', label: '小規模企業共済・iDeCo の掛金', checkOnly: true },
          { key: 'd-medical', label: '医療費（10万円を超えた場合など）', checkOnly: true },
          { key: 'd-family', label: '配偶者・扶養家族', checkOnly: true }
        ]
      },
      {
        id: 'submit', title: '送信', intro: blue && with65() ? '65万円控除を受けるには、期限内に e-Tax で送信する必要があります。' : 'e-Tax で送信するか、印刷して税務署に提出します。',
        items: [
          { key: 's-income', label: `作成コーナーの所得金額が ${yen(f.income)} と一致している`, checkOnly: true },
          { key: 's-etax', label: 'マイナンバーカードとスマホで e-Tax 送信した', checkOnly: true },
          { key: 's-copy', label: '申告書の控え（PDF）を保存した', checkOnly: true },
          { key: 's-books', label: '確サポの帳簿を PDF で保存した', checkOnly: true, href: '#/export' }
        ]
      }
    ];
    return list;
  }

  function viewTransfer() {
    const year = state.taxYear;
    const all = steps(year);
    if (!all.some((s) => s.id === state.transferStep)) state.transferStep = all[0].id;
    const idx = all.findIndex((s) => s.id === state.transferStep);
    const step = all[idx];
    const done = doneMap(year);
    const count = step.items.filter((i) => done[i.key]).length;

    const item = (it) => {
      if (it.checkOnly) {
        return `<button type="button" class="tr-check" data-action="transfer-toggle" data-value="${h(it.key)}" role="checkbox" aria-checked="${Boolean(done[it.key])}">
          <span class="box">${done[it.key] ? svg(ICON.check, 14, 3) : ''}</span><span class="grow">${h(it.label)}</span></button>`;
      }
      const shown = it.text ? h(it.value) : yen(it.value);
      return `${it.group ? `<div class="tr-group">${h(it.group)}</div>` : ''}<div class="tr-row${done[it.key] ? ' is-done' : ''}">
        <span class="grow"><span class="tr-label">${h(it.label)}</span>${it.hint ? `<span class="muted small">${h(it.hint)}</span>` : ''}</span>
        <button type="button" class="tr-copy" data-action="transfer-copy" data-value="${h(it.key)}" data-copy="${h(it.text ? it.value : String(it.value))}" aria-label="${h(it.label)} ${shown} ${done[it.key] ? '入力済み' : 'をコピー'}">
          <span>${shown}</span>${done[it.key] ? svg(ICON.check, 16, 2.6) : svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>', 15, 2)}
        </button></div>`;
    };

    return `<main class="screen form">
      <header class="form-head"><a class="icon-btn plain" href="#/tax" aria-label="戻る">${svg(ICON.back, 22, 2)}</a>
        <div><h1>作成コーナーへの転記</h1><span class="muted small">${year}年分 ・ ${isBlue() ? `青色申告（${with65() ? 65 : 10}万円）` : '白色申告'}</span></div></header>
      <div class="tr-steps" role="tablist">${all.map((s, i) => `<button type="button" role="tab" class="tr-step${i === idx ? ' is-current' : ''}${i < idx ? ' is-past' : ''}" data-action="transfer-step" data-value="${s.id}" aria-selected="${i === idx}">
        <span class="bar"></span><span>${i + 1}. ${s.title}</span></button>`).join('')}</div>
      <div class="row-between"><b>ステップ ${idx + 1} / ${all.length}　${h(step.title)}</b><span class="muted small">${step.items.length ? `${count} / ${step.items.length} 完了` : ''}</span></div>
      <div class="notice"><div>${h(step.intro)}${step.items.some((i) => !i.checkOnly) ? '<br>金額をタップするとコピーでき、入力済みの印が付きます。' : ''}</div></div>
      ${step.items.length ? `<section class="card list">${step.items.map(item).join('')}</section>` : ''}
      <div class="tr-actions">
        <a class="btn-outline" href="https://www.keisan.nta.go.jp/" target="_blank" rel="noopener">作成コーナーを開く ${svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', 15, 2)}</a>
        ${idx < all.length - 1
          ? `<button type="button" class="btn-primary" data-action="transfer-step" data-value="${all[idx + 1].id}">次へ：${h(all[idx + 1].title)}</button>`
          : '<a class="btn-primary link" href="#/tax">申告の手順に戻る</a>'}
      </div>
      <p class="muted small">※ 作成コーナーの画面や項目名は年によって変わることがあります。名前が少し違う場合は、近い項目に入力してください。</p>
    </main>`;
  }

  async function setDone(key, value) {
    const year = state.taxYear;
    const all = { ...(state.settings.transferDone || {}) };
    all[year] = { ...(all[year] || {}), [key]: value };
    state.settings.transferDone = all;
    await db.saveSettings(state.settings);
  }

  const actions = {
    'transfer-step': (el) => { state.transferStep = el.dataset.value; state.scrollTop = true; ctx.render(); },
    'transfer-toggle': async (el) => { await setDone(el.dataset.value, !doneMap(state.taxYear)[el.dataset.value]); ctx.rerender(); },
    'transfer-copy': async (el) => {
      const key = el.dataset.value;
      const wasDone = Boolean(doneMap(state.taxYear)[key]);
      if (!wasDone) {
        try {
          await navigator.clipboard.writeText(el.dataset.copy);
          toast(`「${el.dataset.copy}」をコピーしました`);
        } catch (e) {
          toast('入力済みにしました');
        }
      }
      await setDone(key, !wasDone);
      ctx.rerender();
    }
  };

  return { views: { transfer: viewTransfer }, actions, balanceSheet, bsHtml, bsPrintHtml };
}
