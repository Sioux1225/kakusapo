// 消費税の申告の画面（インボイス登録をしている人向け）

import { compareMethods, dueDate } from './ctax.js';

export function createCtax(ctx) {
  const { state, svg, ICON, h, yen, num, db, segmented } = ctx;

  const registered = () => state.settings.invoiceRegistered === true;
  const chosen = (year) => ((state.settings.ctaxMethod || {})[year]) || '';
  const jp = (iso) => `${Number(iso.slice(0, 4))}年${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`;

  function result(year) {
    return compareMethods({ year, receipts: state.receipts, sales: state.sales, assets: state.assets, filingType: state.settings.filingType });
  }

  // 申告の手順に加える行（登録している人だけ）
  function stepFor(year) {
    if (!registered()) return null;
    const m = chosen(year);
    const r = result(year);
    const sel = r.methods.find((x) => x.id === m);
    return {
      title: '消費税の申告をする', href: '#/ctax', status: m ? 'done' : 'todo',
      sub: sel ? `${sel.label}で申告 ・ 納付の目安 ${yen(sel.payable)}（${jp(dueDate(year))}まで）` : `申告と納付は ${jp(dueDate(year))} まで`
    };
  }

  // ホームのお知らせ（2月1日〜3月31日）
  function homeNotice(todayIso) {
    if (!registered()) return '';
    const year = Number(todayIso.slice(0, 4)) - 1;
    const md = todayIso.slice(5);
    if (md < '02-01' || md > '03-31') return '';
    return `<a class="notice link" href="#/ctax"><div><b>消費税の申告・納付は ${jp(dueDate(year))} までです</b><br>インボイス登録をしている方は、所得税とは別に必要です</div>${svg(ICON.next, 18, 2)}</a>`;
  }

  function viewCtax() {
    const year = state.taxYear;
    const yearSelect = `<select class="select-inline" data-action="tax-year" aria-label="年">${ctx.yearsWithData().map((y) => `<option value="${y}"${y === year ? ' selected' : ''}>${y}年分</option>`).join('')}</select>`;
    const head = `<header class="form-head"><a class="icon-btn plain" href="#/tax" aria-label="戻る">${svg(ICON.back, 22, 2)}</a><h1>消費税の申告</h1></header>`;

    if (!registered()) {
      return `<main class="screen">${head}
        <section class="card pad">
          <b>インボイス（適格請求書発行事業者）の登録をしていますか？</b>
          <p class="muted small">登録している方は、所得税の確定申告とは別に、消費税の申告と納付が必要です。登録していない方は必要ありません。</p>
          ${segmented('インボイスの登録', [['no', 'していない'], ['yes', 'している']], state.settings.invoiceRegistered === true ? 'yes' : 'no', 'set-invoice')}
        </section>
      </main>`;
    }

    const r = result(year);
    const m = chosen(year);
    const min = Math.min(...r.methods.map((x) => x.payable - (x.refund || 0)));
    const card = (x) => {
      const isBest = x.id === r.best;
      const isChosen = x.id === m;
      return `<section class="ct-card${isChosen ? ' is-chosen' : ''}">
        <div class="ct-head"><b>${h(x.label)}</b>${isBest ? '<span class="badge best">一番少ない</span>' : ''}${isChosen ? '<span class="badge chosen">この方法で申告</span>' : ''}</div>
        <div class="ct-amount">${x.refund ? `<small>還付の目安</small>${num(x.refund)}<small>円</small>` : `<small>納付の目安</small>${num(x.payable)}<small>円</small>`}</div>
        ${x.payable - (x.refund || 0) > min ? `<p class="muted small">一番少ない方法より ${yen(x.payable - (x.refund || 0) - min)} 多い</p>` : ''}
        <p class="small">${h(x.note)}</p>
        ${x.id === 'general' && r.noInvoiceCount ? `<p class="warn-text small">インボイス番号のない経費が${r.noInvoiceCount}件あり、その分の控除は一部だけになっています。</p>` : ''}
        ${isChosen ? '' : `<button type="button" class="btn-outline" data-action="choose-ctax" data-value="${x.id}">この方法で申告する</button>`}
      </section>`;
    };
    const sel = r.methods.find((x) => x.id === m);

    return `<main class="screen">
      ${head}
      <div class="row-between"><span class="muted">申告・納付の期限：<b>${jp(dueDate(year))}</b></span>${yearSelect}</div>
      <section class="card figures">
        <div><span class="muted">売上（税込）</span><b>${num(r.salesTotal)}</b></div>
        <div><span class="muted">売上の消費税</span><b>${num(r.outputTax)}</b></div>
        <div><span class="muted">経費の消費税</span><b>${num(r.inputTax)}</b></div>
      </section>
      <div class="section-head"><h2>計算方法ごとの納付額</h2><span class="muted small">目安</span></div>
      ${r.methods.map(card).join('')}
      <div class="info">
        ・2割特例・3割特例は、2年前の売上（課税売上高）が1,000万円以下の方が使えます。<br>
        ・簡易課税は、その年が始まる前（前年の12月31日まで）に「簡易課税制度選択届出書」を出している場合だけ使えます。<br>
        ・金額は確サポの記録から計算した目安です。正確な金額は作成コーナーが計算します。
      </div>
      ${sel ? `<section class="card list">
        <div class="card-title">作成コーナーに入力する内容（${h(sel.label)}）</div>
        <div class="st-row"><span>課税期間</span><b>${year}年1月1日〜12月31日</b></div>
        <div class="st-row"><span>課税売上高（税込・10%）</span><b>${yen(r.salesTotal)}</b></div>
        ${sel.id === 'general' ? `<div class="st-row"><span>経費の消費税（控除できる分）</span><b>${yen(r.inputTax)}</b></div>` : ''}
        <div class="st-row"><span>計算方法</span><b>${h(sel.label)}</b></div>
        <div class="st-row result"><span>納付額の目安</span><b>${yen(sel.payable)}</b></div>
      </section>
      <a class="btn-outline" href="https://www.keisan.nta.go.jp/" target="_blank" rel="noopener">作成コーナーを開く（消費税の申告書）</a>` : ''}
    </main>`;
  }

  const actions = {
    'set-invoice': async (el) => {
      state.settings.invoiceRegistered = el.dataset.value === 'yes';
      await db.saveSettings(state.settings);
      ctx.rerender();
    },
    'choose-ctax': async (el) => {
      state.settings.ctaxMethod = { ...(state.settings.ctaxMethod || {}), [state.taxYear]: el.dataset.value };
      await db.saveSettings(state.settings);
      ctx.rerender();
    }
  };

  return { views: { ctax: viewCtax }, actions, stepFor, homeNotice, registered };
}
