// ドライバー向けの便利機能：毎月の固定費の自動登録・ETC利用明細の取り込み・走行距離から仕事で使った割合を計算
// app.js から共通の部品（ctx）を受け取って画面と操作を返す。

import { CATEGORIES, categoryName } from './categories.js';
import { pendingReceipts } from './recurring.js';
import { parseEtcCsv, receiptFromEtc } from './etc.js';
import { PAY_LABEL } from './backup.js';

// 車に関係する科目（走行距離の割合をまとめて反映する）
export const CAR_CATEGORIES = ['fuel', 'repair', 'insurance', 'taxes', 'lease', 'travel'];

export function createExtras(ctx) {
  const { state, svg, ICON, h, yen, num, db, toast, newId, todayISO } = ctx;

  const back = (href) => `<header class="form-head"><a class="icon-btn plain" href="${href}" aria-label="戻る">${svg(ICON.back, 22, 2)}</a>`;
  const toInt = (v) => {
    const n = parseInt(String(v).normalize('NFKC').replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  };
  const monthName = (m) => `${Number(m.slice(0, 4))}年${Number(m.slice(5, 7))}月`;
  const thisMonth = () => todayISO().slice(0, 7);

  /* ---------- 毎月の固定費 ---------- */
  const recurringList = () => state.settings.recurring || [];

  // まだ登録していない月の分を、領収書として登録する（起動時・保存時）
  async function materializeRecurring() {
    const now = new Date().toISOString();
    const items = pendingReceipts(recurringList(), state.settings.recurringDone || {}, todayISO(), now);
    if (!items.length) return 0;
    const done = { ...(state.settings.recurringDone || {}) };
    for (const { key, receipt } of items) {
      await db.putReceipt(receipt);
      done[key] = true;
    }
    state.settings.recurringDone = done;
    await db.saveSettings(state.settings);
    return items.length;
  }

  function newRecDraft() {
    return { id: newId(), isNew: true, name: '', amount: 0, category: 'comm', day: 27, startMonth: thisMonth(), endMonth: '', paymentMethod: 'bank', businessRatio: state.settings.ratios.comm ?? 100 };
  }

  function viewRecurring() {
    const list = recurringList();
    return `<main class="screen">
      ${back('#/settings')}<h1>毎月の固定費</h1></header>
      <div class="notice"><div>スマホ代・月極駐車場・リース代など、<b>毎月決まって払うもの</b>を登録すると、支払日が来るたびに自動で経費に登録します。毎月の領収書の撮影は要りません。</div></div>
      <section class="card list">
        ${list.length ? list.map((r) => `<a class="link-row" href="#/fixed/${encodeURIComponent(r.id)}"><span class="grow"><b>${h(r.name)}</b>
          <span class="muted small">${h(categoryName(r.category))} ・ 毎月${r.day}日 ・ ${monthName(r.startMonth)}から${r.endMonth ? `${monthName(r.endMonth)}まで` : ''}</span></span>
          <b>${yen(r.amount)}</b>${svg(ICON.next, 16, 2)}</a>`).join('') : '<div class="empty">まだ登録していません</div>'}
      </section>
      <a class="btn-primary link" href="#/fixed/new">${svg('<path d="M12 5v14M5 12h14"/>', 20, 2.2)}固定費を追加</a>
      <p class="muted small">金額が変わったときは、ここで金額を直してください。直した後の月から新しい金額で登録します。登録済みの経費は「一覧」から直せます。</p>
    </main>`;
  }

  function viewRecurringForm() {
    const d = state.recDraft;
    const opt = (v, l, cur) => `<option value="${h(v)}"${String(v) === String(cur) ? ' selected' : ''}>${h(l)}</option>`;
    return `<main class="screen form">
      ${back('#/fixed')}<h1>${d.isNew ? '固定費の追加' : '固定費の編集'}</h1></header>
      <div class="card fields">
        <label class="field"><span class="field-label">名前（支払先）</span><input type="text" data-rec="name" value="${h(d.name)}" placeholder="例：ドコモ（スマホ代）" autocomplete="off"></label>
        <label class="field"><span class="field-label">毎月の金額（税込）</span>
          <span class="yen-input"><input type="text" inputmode="numeric" data-rec="amount" value="${d.amount ? num(d.amount) : ''}" placeholder="0"><span>円</span></span></label>
        <label class="field"><span class="field-label">勘定科目</span>
          <select data-rec="category">${CATEGORIES.map((c) => opt(c.id, `${c.name}（${c.hint}）`, d.category)).join('')}</select></label>
        <div class="field two-col">
          <label><span class="field-label">支払日</span><select data-rec="day">${Array.from({ length: 31 }, (_, i) => opt(i + 1, i === 30 ? '末日' : `${i + 1}日`, d.day)).join('')}</select></label>
          <label><span class="field-label">支払方法</span><select data-rec="paymentMethod">${Object.entries(PAY_LABEL).map(([v, l]) => opt(v, l, d.paymentMethod)).join('')}</select></label>
        </div>
        <div class="field two-col">
          <label><span class="field-label">いつから</span><input type="month" data-rec="startMonth" value="${h(d.startMonth)}"></label>
          <label><span class="field-label">いつまで（任意）</span><input type="month" data-rec="endMonth" value="${h(d.endMonth || '')}"></label>
        </div>
        <label class="field"><span class="field-label">仕事で使った割合（家事按分）</span>
          <span class="yen-input"><input type="number" inputmode="numeric" min="0" max="100" step="5" data-rec="businessRatio" value="${h(d.businessRatio)}"><span>%</span></span></label>
      </div>
      <p class="muted small">「いつから」を前の月にすると、その月から今月までの分をまとめて登録します。</p>
      <div class="form-actions">
        <button type="button" class="btn-primary" data-action="save-rec">保存する</button>
        ${d.isNew ? '' : '<button type="button" class="btn-text danger" data-action="delete-rec">この固定費をやめる</button>'}
      </div>
    </main>`;
  }

  function onRecInput(el) {
    const d = state.recDraft;
    if (!d) return;
    const f = el.dataset.rec;
    if (f === 'amount') d.amount = toInt(el.value);
    else if (f === 'day') d.day = toInt(el.value);
    else if (f === 'businessRatio') { d.businessRatio = Math.max(0, Math.min(100, toInt(el.value))); d.ratioTouched = true; }
    else if (f === 'category') {
      d.category = el.value;
      if (!d.ratioTouched) { d.businessRatio = state.settings.ratios[el.value] ?? 100; ctx.rerender(); }
    } else d[f] = el.value;
  }

  /* ---------- 走行距離から仕事で使った割合 ---------- */
  function mileageOf(year) {
    return (state.settings.mileage || {})[year] || { total: 0, business: 0 };
  }
  const ratioFrom = (m) => (m.total > 0 && m.business > 0 ? Math.min(100, Math.floor((m.business / m.total) * 100)) : 0);

  function viewMileage() {
    const year = state.taxYear;
    const m = mileageOf(year);
    const ratio = ratioFrom(m);
    const targets = CAR_CATEGORIES.filter((id) => id !== 'travel');
    const count = state.receipts.filter((r) => String(r.date).startsWith(String(year)) && targets.includes(r.category)).length;
    return `<main class="screen form">
      ${back('#/settings')}<h1>走行距離で割合を計算</h1></header>
      <div class="notice"><div>車を仕事と私用の両方で使っている場合、<b>走った距離の割合</b>で経費にする割合を決めると、税務署にも説明しやすくなります。</div></div>
      <div class="card fields">
        <label class="field"><span class="field-label">${year}年に走った距離（全体）</span>
          <span class="yen-input"><input type="text" inputmode="numeric" data-mile="total" value="${m.total ? num(m.total) : ''}" placeholder="0"><span>km</span></span></label>
        <label class="field"><span class="field-label">そのうち仕事で走った距離</span>
          <span class="yen-input"><input type="text" inputmode="numeric" data-mile="business" value="${m.business ? num(m.business) : ''}" placeholder="0"><span>km</span></span></label>
      </div>
      <p class="muted small">全体の距離は、1月1日と12月31日（または今日）のメーターの差です。仕事の距離は、日報や配送アプリの記録から合計してください。記録は申告後も7年間保管してください。</p>
      ${ratio ? `<section class="card total-card">
          <span class="muted">仕事で使った割合</span>
          <div class="total-amount"><span>${ratio}</span><small>%</small></div>
          <span class="muted small">${num(m.business)} km ÷ ${num(m.total)} km（小数点以下は切り捨て）</span>
        </section>
        <div class="form-actions">
          <button type="button" class="btn-primary" data-action="apply-mileage">車の経費の割合を ${ratio}% にする</button>
        </div>
        <p class="muted small">車両費・修繕費・損害保険料・租税公課・リース料の初期値を${ratio}%にします。${count ? `${year}年に登録済みの領収書（${count}件）も、確認のうえ${ratio}%に直せます。` : ''}固定資産の車の割合は「固定資産」の画面で直してください。</p>`
        : m.total || m.business ? '<div class="warn-box">' + svg(ICON.alert, 18, 2) + '<div>全体の距離と仕事の距離を両方入力してください。</div></div>' : ''}
    </main>`;
  }

  async function onMileageInput(el) {
    const year = state.taxYear;
    const all = { ...(state.settings.mileage || {}) };
    const m = { ...mileageOf(year), [el.dataset.mile]: toInt(el.value) };
    if (m.business > m.total && m.total) { toast('仕事の距離が全体の距離より長くなっています'); }
    all[year] = m;
    state.settings.mileage = all;
    await db.saveSettings(state.settings);
    ctx.rerender();
  }

  /* ---------- ETC利用明細（CSV）の取り込み ---------- */
  function decodeCsv(buf) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
      return new TextDecoder('shift_jis').decode(buf); // ETC利用照会サービスの CSV は Shift_JIS
    }
  }

  function pickEtcFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const rows = parseEtcCsv(decodeCsv(await file.arrayBuffer()));
      if (!rows.length) { toast('ETC利用明細のCSVではないようです'); return; }
      const have = new Set(state.receipts.map((r) => r.id));
      const now = new Date().toISOString();
      const ratio = state.settings.ratios.travel ?? 100;
      const fresh = rows.map((r) => receiptFromEtc(r, ratio, now)).filter((r) => !have.has(r.id));
      if (!fresh.length) { toast(`${rows.length}件すべて登録済みです`); return; }
      const total = fresh.reduce((t, r) => t + r.amount, 0);
      const skipped = rows.length - fresh.length;
      if (!window.confirm(`${fresh.length}件（合計 ${yen(total)}）を「旅費交通費」として登録します。${skipped ? `\n登録済みの${skipped}件は飛ばします。` : ''}\n\n※ 同じ高速代の領収書を撮影して登録している場合は、二重にならないよう片方を削除してください。`)) return;
      for (const r of fresh) await db.putReceipt(r);
      await ctx.reload();
      toast(`ETCの利用 ${fresh.length}件を登録しました`);
      location.hash = '#/list';
      ctx.rerender();
    });
    input.click();
  }

  /* ---------- 操作 ---------- */
  const actions = {
    'save-rec': async () => {
      const d = state.recDraft;
      if (!String(d.name).trim()) { toast('名前を入力してください'); return; }
      if (!(d.amount > 0)) { toast('金額を入力してください'); return; }
      if (!/^\d{4}-\d{2}$/.test(d.startMonth || '')) { toast('いつからを入力してください'); return; }
      if (d.endMonth && d.endMonth < d.startMonth) { toast('いつまでが、いつからより前になっています'); return; }
      const { isNew, ratioTouched, ...rec } = d;
      rec.name = String(rec.name).trim();
      const list = recurringList().filter((r) => r.id !== rec.id);
      state.settings.recurring = [...list, rec];
      await db.saveSettings(state.settings);
      const added = await materializeRecurring();
      await ctx.reload();
      state.recDraft = null;
      toast(added ? `保存しました（${added}か月分を経費に登録）` : '保存しました');
      location.hash = '#/fixed';
    },
    'delete-rec': async () => {
      if (!window.confirm('この固定費の自動登録をやめますか？\n（登録済みの経費はそのまま残ります）')) return;
      state.settings.recurring = recurringList().filter((r) => r.id !== state.recDraft.id);
      await db.saveSettings(state.settings);
      state.recDraft = null;
      toast('自動登録をやめました');
      location.hash = '#/fixed';
    },
    'apply-mileage': async () => {
      const year = state.taxYear;
      const ratio = ratioFrom(mileageOf(year));
      if (!ratio) return;
      const targets = CAR_CATEGORIES.filter((id) => id !== 'travel');
      for (const id of targets) state.settings.ratios[id] = ratio;
      await db.saveSettings(state.settings);
      const list = state.receipts.filter((r) => String(r.date).startsWith(String(year)) && targets.includes(r.category) && Number(r.businessRatio) !== ratio);
      if (list.length && window.confirm(`${year}年に登録済みの車の経費（${list.length}件）も ${ratio}% に直しますか？`)) {
        const now = new Date().toISOString();
        for (const r of list) await db.putReceipt({ ...r, businessRatio: ratio, updatedAt: now });
        await ctx.reload();
        toast(`初期値と${list.length}件の割合を${ratio}%にしました`);
      } else {
        toast(`車の経費の初期値を${ratio}%にしました`);
      }
      ctx.rerender();
    },
    'etc-import': () => pickEtcFile()
  };

  function prepare(view, param) {
    if (view === 'fixed' && param) {
      if (param === 'new') {
        if (!state.recDraft || !state.recDraft.isNew) state.recDraft = newRecDraft();
      } else if (!state.recDraft || state.recDraft.id !== param) {
        const r = recurringList().find((x) => x.id === param);
        if (!r) return '#/fixed';
        state.recDraft = { ...r, isNew: false, ratioTouched: true };
      }
    } else {
      state.recDraft = null;
    }
    return null;
  }

  return {
    views: { fixed: () => (state.recDraft ? viewRecurringForm() : viewRecurring()), mileage: viewMileage },
    actions,
    prepare,
    onRecInput,
    onMileageInput,
    materializeRecurring
  };
}
