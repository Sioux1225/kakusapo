// Phase 2：売上・固定資産（減価償却）・申告の手順・決算書（収支内訳書）の金額
// app.js から共通の部品（ctx）を受け取って画面と操作を返す。

import { schedule, forYear, methodOf, lifeOf, METHOD_LABEL } from './depreciation.js';
import { CATEGORIES } from './categories.js';

export function createPhase2(ctx) {
  const { state, svg, ICON, h, yen, num, segmented, nav, db, toast, newId, todayISO, longDate } = ctx;

  /* ---------- 計算 ---------- */
  const isBlue = () => state.settings.filingType !== 'white';
  const deductionLimit = () => (isBlue() ? (Number(state.settings.deduction) === 10 ? 100000 : 650000) : 0);
  const salesOf = (year) => state.sales.filter((s) => String(s.month).startsWith(String(year)));
  const salesTotal = (year) => salesOf(year).reduce((t, s) => t + (Number(s.amount) || 0), 0);
  const depreciationOf = (year) => state.assets.reduce((t, a) => t + forYear(a, state.settings.filingType, year).expense, 0);

  function figures(year) {
    const receipts = ctx.yearReceipts(year);
    const byCat = ctx.categoryTotals(receipts);
    const expenseReceipts = Object.values(byCat).reduce((a, b) => a + b, 0);
    const dep = depreciationOf(year);
    const sales = salesTotal(year);
    const expenses = expenseReceipts + dep;
    const before = sales - expenses;
    const deduction = Math.min(deductionLimit(), Math.max(0, before));
    return { byCat, dep, sales, expenses, before, deduction, income: before - deduction, pending: receipts.filter((r) => r.status !== 'confirmed').length };
  }

  const ymAdd = (ym, n) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const thisMonth = () => todayISO().slice(0, 7);
  const monthName = (ym) => `${Number(ym.slice(5, 7))}月`;

  // 記録が必要な月（今年は先月まで、過去の年は12月まで）
  function expectedMonths(year) {
    const now = thisMonth();
    const last = String(year) < now.slice(0, 4) ? 12 : String(year) === now.slice(0, 4) ? Number(now.slice(5, 7)) - 1 : 0;
    return Array.from({ length: Math.max(0, last) }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  }

  /* ---------- 共通の部品 ---------- */
  const back = (href) => `<header class="form-head"><a class="icon-btn plain" href="${href}" aria-label="戻る">${svg(ICON.back, 22, 2)}</a>`;
  const chip = (action, value, label, on) => `<button type="button" class="chip" data-action="${action}" data-value="${h(value)}" aria-pressed="${on}">${h(label)}</button>`;
  const yearSelect = (action) => `<select class="select-inline" data-action="${action}" aria-label="年">${ctx.yearsWithData().map((y) => `<option value="${y}"${y === state.taxYear ? ' selected' : ''}>${y}年分</option>`).join('')}</select>`;

  /* ---------- 申告の手順 ---------- */
  function viewTax() {
    const year = state.taxYear;
    const blue = isBlue();
    const f = figures(year);
    const ded = Number(state.settings.deduction) === 10 ? 10 : 65;
    const expected = expectedMonths(year);
    const recorded = new Set(salesOf(year).map((s) => s.month));
    const missing = expected.filter((m) => !recorded.has(m));
    const assetsThisYear = state.assets.filter((a) => forYear(a, state.settings.filingType, year).expense > 0);

    const steps = [
      {
        title: '売上を記録する', href: '#/sales',
        status: recorded.size === 0 ? 'todo' : missing.length ? 'warn' : 'done',
        sub: recorded.size === 0 ? '毎月の委託料の入金を記録します'
          : missing.length ? `未入力の月があります（${missing.slice(0, 3).map(monthName).join('・')}${missing.length > 3 ? 'など' : ''}）` : `${recorded.size}か月分 入力済み ・ ${yen(f.sales)}`
      },
      {
        title: '経費（領収書）を確認する', href: f.pending ? '#/list?pending' : '#/list',
        status: f.pending ? 'warn' : 'done',
        sub: f.pending ? `未確認の領収書が${f.pending}件あります` : `確認済み ・ ${yen(f.expenses - f.dep)}`
      },
      {
        title: '減価償却を確認する', href: '#/assets',
        status: state.assets.length ? 'done' : 'todo',
        sub: state.assets.length ? `${state.assets.length}件 ・ 今年の経費 ${yen(f.dep)}` : '10万円以上の車両・パソコンなどを買ったら登録'
      },
      (() => {
        const n = ctx.journalCount ? ctx.journalCount(year) : 0;
        return { title: '帳簿を確認する', href: '#/ledger', status: n ? 'done' : 'todo', sub: n ? `仕訳 ${n}件 ・ 自動で作成済み` : '領収書や売上を登録すると自動で作成します' };
      })(),
      {
        title: blue ? '決算書の金額を確認する' : '収支内訳書の金額を確認する', href: '#/statement', status: 'todo',
        sub: blue ? (ded === 65 ? '損益計算書・貸借対照表' : '損益計算書') : '収入・経費の欄ごとの金額'
      },
      {
        title: '作成コーナーで申告書を作る', href: '#/transfer', status: 'todo',
        sub: blue && ded === 65 ? 'e-Tax で送信（65万円には必須）' : 'e-Tax で送信、または印刷して提出'
      },
      // インボイス登録をしている人だけ：消費税の申告
      ...(ctx.ctaxStep && ctx.ctaxStep(year) ? [ctx.ctaxStep(year)] : [])
    ];
    const left = steps.filter((s) => s.status !== 'done').length;

    const stepRow = (s, i) => {
      const mark = s.status === 'done' ? svg(ICON.check, 16, 3) : s.status === 'warn' ? '!' : String(i + 1);
      const inner = `<span class="step-mark ${s.status}">${mark}</span>
        <span class="step-text"><b>${h(s.title)}</b><span class="${s.status === 'warn' ? 'warn-text' : 'muted'}">${h(s.sub)}</span></span>
        ${s.href ? svg(ICON.next, 16, 2) : ''}`;
      if (!s.href) return `<div class="step-row is-disabled">${inner}</div>`;
      return `<a class="step-row" href="${s.href}"${s.external ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>`;
    };

    return `<main class="screen">
      <header class="page-head">
        <div><h1>確定申告</h1><span class="muted">${year}年分 ・ 申告期間 ${year + 1}年2月16日〜3月15日</span></div>
        ${yearSelect('tax-year')}
      </header>
      ${segmented('申告の種類', [['blue', '青色申告'], ['white', '白色申告']], blue ? 'blue' : 'white', 'filing-type')}
      ${blue ? `<div class="deduction">
        <div class="chips two" role="group" aria-label="青色申告特別控除">${chip('set-deduction', 65, '65万円', ded === 65)}${chip('set-deduction', 10, '10万円', ded === 10)}</div>
        <div class="req-box"><b>${ded}万円の条件</b><br>${ded === 65
          ? '複式簿記で記帳し、貸借対照表をつけて、期限内に e-Tax で提出'
          : '簡単な帳簿でOK。貸借対照表は不要で、紙の提出や期限後の提出でも受けられます'}</div>
        <p class="note">${svg(ICON.alert, 16, 2)}<span>2027年分から始まる<b>75万円控除</b>は、このアプリでは受けられません（優良な電子帳簿などの条件があるため）。</span></p>
      </div>` : ''}
      <section class="card figures">
        <div><span class="muted">売上</span><b>${num(f.sales)}</b></div>
        <div><span class="muted">経費</span><b>${num(f.expenses)}</b></div>
        <div><span class="muted">${blue ? '所得（控除後）' : '所得（見込み）'}</span><b class="accent">${num(f.income)}</b></div>
      </section>
      <div class="section-head"><h2>上から順に進めてください</h2><span class="muted">${left ? `あと${left}ステップ` : 'すべて完了'}</span></div>
      <section class="card list">${steps.map(stepRow).join('')}</section>
    </main>${nav('tax')}`;
  }

  /* ---------- 決算書・収支内訳書の金額 ---------- */
  function viewStatement() {
    const year = state.taxYear;
    const blue = isBlue();
    const f = figures(year);
    const rows = CATEGORIES.filter((c) => f.byCat[c.id]).map((c) => ({ no: c.blueNo, name: c.name, extra: c.extra, v: f.byCat[c.id] }));
    if (f.dep) rows.push({ no: '⑱', name: '減価償却費', v: f.dep });
    rows.sort((a, b) => a.no.localeCompare(b.no));
    const miscShare = f.expenses ? ((f.byCat.misc || 0) / f.expenses) * 100 : 0;
    const s = state.settings;
    const check = (ok, text, href) => `<${href ? `a href="${href}"` : 'div'} class="check-row ${ok ? 'ok' : 'ng'}">${svg(ok ? ICON.check : ICON.alert, 18, ok ? 2.4 : 2)}<span>${text}</span>${href ? svg(ICON.next, 16, 2) : ''}</${href ? 'a' : 'div'}>`;
    const line = (label, v, cls = '') => `<div class="st-row ${cls}"><span>${label}</span><b>${v < 0 ? '− ' + yen(-v) : yen(v)}</b></div>`;

    const with65 = blue && Number(s.deduction) !== 10;
    const bsView = with65 && state.statementView === 'bs';
    const bs = with65 && ctx.balanceSheet ? ctx.balanceSheet(year) : null;
    return `<main class="screen">
      ${back('#/tax')}<h1>${blue ? '決算書の金額' : '収支内訳書の金額'}</h1></header>
      <p class="muted">${year}年分 ・ ${blue ? `青色申告（${Number(s.deduction) === 10 ? 10 : 65}万円控除）` : '白色申告'}</p>
      ${with65 ? segmented('決算書の種類', [['pl', '損益計算書'], ['bs', '貸借対照表']], bsView ? 'bs' : 'pl', 'statement-view') : ''}
      ${bsView ? ctx.bsHtml(year) : `<section class="card form-card">
        <div class="form-card-head"><b>${blue ? '青色申告決算書（一般用）1ページ目' : '収支内訳書（一般用）1ページ目'}</b>
          <span>${blue ? '丸数字は決算書の欄番号です。㉕・㉖は空欄に科目名を書いて追加します' : '同じ名前の欄に金額を書き写します'}</span></div>
        ${line(blue ? '① 売上（収入）金額' : '売上（収入）金額', f.sales, 'strong')}
        ${rows.length ? rows.map((r) => `<div class="form-row">
          <span class="no${blue ? '' : ' plain'}">${blue ? r.no : '・'}</span>
          <span class="form-name">${h(r.name)}${r.extra ? '<small>（追加する科目）</small>' : ''}</span>
          <b>${yen(r.v)}</b></div>`).join('') : '<div class="empty">この年の経費はまだありません</div>'}
        ${line(blue ? '㉜ 経費の合計' : '経費の合計', f.expenses, 'total')}
        ${line('差引金額（売上 − 経費）', f.before)}
        ${blue ? line(`青色申告特別控除（${Number(s.deduction) === 10 ? 10 : 65}万円）`, -f.deduction) : ''}
        ${line('所得金額', f.income, 'result')}
      </section>`}
      <a class="btn-outline" href="#/ledger">帳簿（仕訳帳・総勘定元帳）を見る</a>
      <section class="card checks">
        <h2>申告前チェック</h2>
        ${check(f.pending === 0, f.pending ? `未確認の領収書が${f.pending}件あります` : '未確認の領収書はありません', f.pending ? '#/list?pending' : '')}
        ${check(f.sales > 0, f.sales > 0 ? `売上 ${yen(f.sales)} を記録済み` : '売上がまだ記録されていません', f.sales > 0 ? '' : '#/sales')}
        ${bs ? check(bs.balanced, bs.balanced ? '貸借対照表の左右の合計が一致しています' : '貸借対照表の左右の合計が一致していません') : ''}
        ${check(miscShare <= 10, `雑費は経費全体の${miscShare.toFixed(1)}%（目安10%以下）`)}
        ${check(Boolean(s.lastBackupAt), s.lastBackupAt ? `バックアップ済み（${longDate(s.lastBackupAt.slice(0, 10))}）` : 'まだバックアップしていません', s.lastBackupAt ? '' : '#/settings')}
      </section>
    </main>`;
  }

  /* ---------- 売上 ---------- */
  function lastSale() {
    return [...state.sales].sort((a, b) => String(b.month).localeCompare(String(a.month)) || String(b.date).localeCompare(String(a.date)))[0];
  }

  function newSaleDraft(month) {
    const last = lastSale();
    const target = month || (last ? ymAdd(last.month, 1) : ymAdd(thisMonth(), -1));
    const day = last && last.date ? Number(last.date.slice(8, 10)) : 10;
    const pay = ymAdd(target, 1);
    const lastDay = new Date(Number(pay.slice(0, 4)), Number(pay.slice(5, 7)), 0).getDate();
    return {
      id: newId(), isNew: true,
      client: last ? last.client : '',
      month: target,
      date: `${pay}-${String(Math.min(day, lastDay)).padStart(2, '0')}`,
      amount: last ? last.amount : 0,
      to: last ? last.to : 'biz',
      memo: '',
      prefilled: Boolean(last)
    };
  }

  function viewSales() {
    const year = state.taxYear;
    const items = salesOf(year);
    const byMonth = {};
    for (const s of items) (byMonth[s.month] = byMonth[s.month] || []).push(s);
    const expected = new Set(expectedMonths(year));
    const next = newSaleDraft();
    const clients = new Set(items.map((s) => s.client).filter(Boolean));
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

    return `<main class="screen">
      ${back('#/tax')}<h1>売上の記録</h1></header>
      <section class="card total-card">
        <div class="row-between"><span class="muted">${year}年の売上合計</span>${yearSelect('tax-year')}</div>
        <div class="total-amount"><span>${num(salesTotal(year))}</span><small>円</small></div>
        <span class="muted">${clients.size ? `取引先 ${clients.size}社 ・ ` : ''}${items.length}件</span>
      </section>
      <a class="btn-primary link" href="#/sale/new?month=${next.month}">${svg('<path d="M12 5v14M5 12h14"/>', 20, 2.2)}${monthName(next.month)}分を入力${next.prefilled ? '（先月と同じ取引先）' : ''}</a>
      <section class="card list">
        ${months.map((m) => {
          const list = byMonth[m] || [];
          if (!list.length) {
            return `<a class="sale-row" href="#/sale/new?month=${m}"><span class="sale-month">${monthName(m)}</span><span class="muted grow"></span>${expected.has(m) ? '<span class="badge warn">未入力</span>' : '<span class="muted small">—</span>'}</a>`;
          }
          return list.map((s, i) => `<a class="sale-row" href="#/sale/${encodeURIComponent(s.id)}"><span class="sale-month">${i === 0 ? monthName(m) : ''}</span><span class="muted grow">${h(s.client || '取引先なし')}</span><b>${yen(s.amount)}</b></a>`).join('');
        }).join('')}
      </section>
    </main>`;
  }

  function viewSaleForm() {
    const d = state.saleDraft;
    const clients = [...new Set(state.sales.map((s) => s.client).filter(Boolean))];
    const biz = d.to !== 'private';
    return `<main class="screen form">
      ${back('#/sales')}<h1>${d.isNew ? '売上の入力' : '売上の詳細'}</h1></header>
      ${d.isNew && d.prefilled ? `<div class="notice"><div>先月と同じ取引先・金額を入れています。<b>入金額が違えば直してください。</b></div></div>` : ''}
      <div class="card fields">
        <label class="field"><span class="field-label">取引先</span>
          <input type="text" data-sale="client" value="${h(d.client)}" list="client-list" placeholder="例：A運送" autocomplete="off">
          <datalist id="client-list">${clients.map((c) => `<option value="${h(c)}">`).join('')}</datalist></label>
        <div class="field two-col">
          <label><span class="field-label">何月分の売上か</span><input type="month" data-sale="month" value="${h(d.month)}"></label>
          <label><span class="field-label">入金日</span><input type="date" data-sale="date" value="${h(d.date)}"></label>
        </div>
        <label class="field"><span class="field-label">売上の金額（税込）</span>
          <span class="yen-input"><input type="text" inputmode="numeric" data-sale="amount" value="${d.amount ? num(d.amount) : ''}" placeholder="0"><span>円</span></span></label>
      </div>
      <section class="section">
        <h2>どこに入金されましたか？</h2>
        ${segmented('入金先', [['biz', '事業用の口座'], ['private', '個人の口座・現金']], biz ? 'biz' : 'private', 'sale-to')}
        <p class="muted small">${biz ? '事業用の口座：帳簿には「普通預金 ／ 売上」と記録します。' : '個人の口座・現金：帳簿には「事業主貸 ／ 売上」と記録します。簿記の知識がなくても大丈夫です。'}</p>
      </section>
      <div class="card fields">
        <label class="field"><span class="field-label">メモ（任意）</span><textarea data-sale="memo" rows="2">${h(d.memo)}</textarea></label>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-primary" data-action="save-sale">保存する</button>
        ${d.isNew ? '' : '<button type="button" class="btn-text danger" data-action="delete-sale">この売上を削除</button>'}
      </div>
    </main>`;
  }

  /* ---------- 固定資産 ---------- */
  const KIND_LABEL = { car: '車両', pc: 'パソコン・スマホ', other: 'その他' };

  function newAssetDraft() {
    return {
      id: newId(), isNew: true, kind: 'car', name: '', used: false, plate: 'black', elapsedYears: 2, life: 5,
      acquiredOn: todayISO(), cost: 0, businessRatio: state.settings.ratios.fuel ?? 80
    };
  }

  function viewAssets() {
    const year = state.taxYear;
    const ft = state.settings.filingType;
    return `<main class="screen">
      ${back('#/tax')}<h1>減価償却（固定資産）</h1></header>
      <p class="muted small">10万円以上の車両・パソコンなど、何年も使うものを登録すると、毎年の経費（減価償却費）を自動で計算します。</p>
      <a class="btn-primary link" href="#/asset/new">${svg('<path d="M12 5v14M5 12h14"/>', 20, 2.2)}固定資産を登録</a>
      ${state.assets.length ? `<section class="card list">${state.assets.map((a) => {
        const y = forYear(a, ft, year);
        return `<a class="row" href="#/asset/${encodeURIComponent(a.id)}">
          <div class="row-tag">${h(KIND_LABEL[a.kind].slice(0, 2))}</div>
          <div class="row-main"><span class="row-title">${h(a.name || KIND_LABEL[a.kind])}</span>
            <span class="row-sub">${h(longDate(a.acquiredOn))}購入 ・ ${yen(a.cost)}</span></div>
          <div class="row-end"><span class="row-amount">${yen(y.expense)}</span><span class="muted small">${year}年の経費</span></div>
        </a>`;
      }).join('')}</section>` : '<div class="card empty">まだ登録されていません</div>'}
    </main>`;
  }

  function viewAssetForm() {
    const d = state.assetDraft;
    const ft = state.settings.filingType;
    const method = methodOf(d, ft);
    const year = Number(String(d.acquiredOn).slice(0, 4)) || state.taxYear;
    const first = forYear(d, ft, year);
    const startMonth = Number(String(d.acquiredOn).slice(5, 7)) || 1;
    const rows = schedule(d, ft).slice(0, 8);
    const isCar = d.kind === 'car';
    const resultNote = {
      expense: '10万円未満のものは固定資産にせず、領収書として「消耗品費」で登録してください。',
      small: '青色申告で30万円未満なので、「少額減価償却資産の特例」で買った年にまとめて経費にします。',
      lump3: '10万円以上20万円未満なので、「一括償却資産」として3年で均等に経費にします。',
      straight: d.used ? '中古は、法定の耐用年数から経過した年数を差し引く「簡便法」で耐用年数を決めています。' : '来年以降も、残りの金額を毎年自動で経費にします。'
    }[method];

    return `<main class="screen form">
      ${back('#/assets')}<h1>${d.isNew ? '固定資産の登録' : '固定資産の詳細'}</h1></header>
      <section class="section"><h2>1. 何を買いましたか？</h2>
        <div class="chips">${Object.entries(KIND_LABEL).map(([k, l]) => chip('asset-kind', k, l, d.kind === k)).join('')}</div></section>
      ${isCar ? `<section class="section"><h2>2. 新車ですか、中古車ですか？</h2>
          <div class="chips">${chip('asset-used', 'new', '新車', !d.used)}${chip('asset-used', 'used', '中古車', d.used)}</div>
          ${d.used ? `<label class="inline-field">前の持ち主が使っていた年数 <input type="number" inputmode="numeric" min="0" max="30" data-asset="elapsedYears" value="${h(d.elapsedYears)}"> 年</label>` : ''}</section>
        <section class="section"><h2>3. ナンバープレートの色は？</h2>
          <div class="chips">${chip('asset-plate', 'black', '黒（運送事業用）', d.plate === 'black')}${chip('asset-plate', 'yellow', '黄色（軽・自家用）', d.plate === 'yellow')}${chip('asset-plate', 'white', '白（普通車・自家用）', d.plate === 'white')}</div></section>`
        : d.kind === 'other' ? `<section class="section"><h2>2. 耐用年数</h2>
          <label class="inline-field">国税庁の耐用年数表の年数 <input type="number" inputmode="numeric" min="2" max="50" data-asset="life" value="${h(d.life)}"> 年</label>
          <p class="muted small">わからない場合は、税務署や国税庁のホームページで確認してください。</p></section>` : ''}
      <div class="card fields">
        <label class="field"><span class="field-label">名前（任意）</span><input type="text" data-asset="name" value="${h(d.name)}" placeholder="例：配送用の軽バン"></label>
        <div class="field two-col">
          <label><span class="field-label">使い始めた日</span><input type="date" data-asset="acquiredOn" value="${h(d.acquiredOn)}"></label>
          <label><span class="field-label">購入金額（税込）</span><input type="text" inputmode="numeric" data-asset="cost" value="${d.cost ? num(d.cost) : ''}" placeholder="0"></label>
        </div>
        <label class="field"><span class="field-label">仕事で使った割合（家事按分）</span>
          <span class="yen-input"><input type="number" inputmode="numeric" min="0" max="100" step="5" data-asset="businessRatio" value="${h(d.businessRatio)}"><span>%</span></span></label>
      </div>
      ${d.cost >= 100000 ? `<section class="calc-box">
        <b class="calc-title">自動で計算しました</b>
        <div class="calc-row"><span>計算の方法</span><b>${h(method === 'straight' ? `定額法（耐用年数 ${lifeOf(d)}年）` : METHOD_LABEL[method])}</b></div>
        <div class="calc-row"><span>${year}年の減価償却費${method === 'straight' ? `（${startMonth}月〜12月）` : ''}</span><b>${yen(first.depreciation)}</b></div>
        <div class="calc-row"><span>仕事で使った割合</span><b>${h(d.businessRatio)}%</b></div>
        <div class="calc-row total"><span>${year}年の経費になる金額</span><b>${yen(first.expense)}</b></div>
        <p>${h(resultNote)}</p>
        ${rows.length > 1 ? `<details><summary>毎年の金額を見る</summary>${rows.map((r) => `<div class="calc-row small"><span>${r.year}年</span><span>経費 ${yen(r.expense)} ・ 残り ${yen(r.bookValue)}</span></div>`).join('')}</details>` : ''}
      </section>` : d.cost ? `<div class="warn-box">${svg(ICON.alert, 18, 2)}<div>${h(resultNote)}</div></div>` : ''}
      <div class="form-actions">
        <button type="button" class="btn-primary" data-action="save-asset">${d.isNew ? 'この内容で登録' : '保存する'}</button>
        ${d.isNew ? '' : '<button type="button" class="btn-text danger" data-action="delete-asset">この固定資産を削除</button>'}
      </div>
    </main>`;
  }

  /* ---------- 入力と操作 ---------- */
  const toInt = (v) => {
    const n = parseInt(String(v).normalize('NFKC').replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  };

  function onSaleInput(el) {
    const d = state.saleDraft;
    if (!d) return;
    const f = el.dataset.sale;
    d[f] = f === 'amount' ? toInt(el.value) : el.value;
    d.touched = true;
  }

  // 計算結果が変わる項目は、入力を確定したとき（change）に描き直す
  function onAssetInput(el, committed) {
    const d = state.assetDraft;
    if (!d) return false;
    const f = el.dataset.asset;
    if (['cost'].includes(f)) d[f] = toInt(el.value);
    else if (['businessRatio', 'elapsedYears', 'life'].includes(f)) d[f] = Math.max(0, Math.min(f === 'businessRatio' ? 100 : 50, toInt(el.value)));
    if (f === 'businessRatio') d.ratioTouched = true;
    else d[f] = el.value;
    return committed && f !== 'name';
  }

  const actions = {
    'set-deduction': async (el) => {
      state.settings.deduction = Number(el.dataset.value);
      await db.saveSettings(state.settings);
      ctx.rerender();
    },
    'statement-view': (el) => { state.statementView = el.dataset.value; ctx.rerender(); },
    'sale-to': (el) => { state.saleDraft.to = el.dataset.value; ctx.rerender(); },
    'save-sale': async () => {
      const d = state.saleDraft;
      if (!/^\d{4}-\d{2}$/.test(d.month || '')) { toast('何月分の売上かを入力してください'); return; }
      if (!(d.amount > 0)) { toast('売上の金額を入力してください'); return; }
      const now = new Date().toISOString();
      await db.putSale({
        id: d.id, client: String(d.client || '').trim(), month: d.month, date: d.date, amount: d.amount,
        to: d.to === 'private' ? 'private' : 'biz', memo: d.memo || '', createdAt: d.createdAt || now, updatedAt: now
      });
      state.taxYear = Number(d.month.slice(0, 4));
      await ctx.reload();
      state.saleDraft = null;
      toast('売上を保存しました');
      location.hash = '#/sales';
    },
    'delete-sale': async () => {
      if (!window.confirm('この売上を削除しますか？')) return;
      await db.deleteSale(state.saleDraft.id);
      await ctx.reload();
      state.saleDraft = null;
      toast('削除しました');
      location.hash = '#/sales';
    },
    'asset-kind': (el) => {
      const d = state.assetDraft;
      d.kind = el.dataset.value;
      if (!d.ratioTouched) d.businessRatio = d.kind === 'car' ? state.settings.ratios.fuel ?? 80 : 100;
      ctx.rerender();
    },
    'asset-used': (el) => { state.assetDraft.used = el.dataset.value === 'used'; ctx.rerender(); },
    'asset-plate': (el) => { state.assetDraft.plate = el.dataset.value; ctx.rerender(); },
    'save-asset': async () => {
      const d = state.assetDraft;
      if (!d.acquiredOn) { toast('使い始めた日を入力してください'); return; }
      if (!(d.cost >= 100000)) { toast('10万円未満のものは、領収書として「消耗品費」で登録してください'); return; }
      const now = new Date().toISOString();
      const { isNew, ratioTouched, ...rest } = d;
      await db.putAsset({ ...rest, createdAt: d.createdAt || now, updatedAt: now });
      await ctx.reload();
      state.assetDraft = null;
      toast('固定資産を登録しました');
      location.hash = '#/assets';
    },
    'delete-asset': async () => {
      if (!window.confirm('この固定資産を削除しますか？')) return;
      await db.deleteAsset(state.assetDraft.id);
      await ctx.reload();
      state.assetDraft = null;
      toast('削除しました');
      location.hash = '#/assets';
    }
  };

  // 画面を開くときの準備（下書きの読み込み）
  function prepare(view, param, query) {
    if (view === 'sale') {
      if (param === 'new') {
        const month = (query.match(/month=(\d{4}-\d{2})/) || [])[1];
        if (!state.saleDraft || !state.saleDraft.isNew || (month && state.saleDraft.month !== month && !state.saleDraft.touched)) state.saleDraft = newSaleDraft(month);
      } else if (!state.saleDraft || state.saleDraft.id !== param) {
        const s = state.sales.find((x) => x.id === param);
        if (!s) return '#/sales';
        state.saleDraft = { ...s, isNew: false };
      }
    } else if (view === 'asset') {
      if (param === 'new') {
        if (!state.assetDraft || !state.assetDraft.isNew) state.assetDraft = newAssetDraft();
      } else if (!state.assetDraft || state.assetDraft.id !== param) {
        const a = state.assets.find((x) => x.id === param);
        if (!a) return '#/assets';
        state.assetDraft = { ...a, isNew: false, ratioTouched: true };
      }
    } else {
      if (view !== 'sale') state.saleDraft = null;
      if (view !== 'asset') state.assetDraft = null;
    }
    return null;
  }

  return {
    views: { tax: viewTax, statement: viewStatement, sales: viewSales, sale: viewSaleForm, assets: viewAssets, asset: viewAssetForm },
    actions,
    prepare,
    onSaleInput,
    onAssetInput,
    figures
  };
}
