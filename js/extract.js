// OCRテキストから領収書の項目（日付・店名・金額・税率・消費税額・インボイス番号）を取り出す。
// DOMに依存しない純粋な関数のみ（Node のテストからも読み込む）。

const KNOWN_VENDORS = [
  'ENEOS', 'エネオス', '出光', 'apollostation', 'アポロステーション', 'コスモ石油', 'コスモ', 'シェル', 'キグナス', '宇佐美',
  'ローソン', 'セブン-イレブン', 'セブンイレブン', 'ファミリーマート', 'ミニストップ', 'デイリーヤマザキ',
  'タイムズ', 'Times', '三井のリパーク', 'リパーク', 'NPC24H', '名鉄協商',
  'NEXCO東日本', 'NEXCO中日本', 'NEXCO西日本', 'NEXCO', '首都高速', '阪神高速',
  'ダイソー', 'DAISO', 'セリア', 'キャンドゥ', 'カインズ', 'コーナン', 'コメリ', 'DCM', 'ビバホーム',
  'オートバックス', 'AUTOBACS', 'イエローハット', 'ジェームス',
  'ドコモ', 'docomo', 'ソフトバンク', 'SoftBank', '楽天モバイル',
  'ヨドバシ', 'ビックカメラ', 'ケーズデンキ', 'Amazon', 'アマゾン', 'ドン・キホーテ',
  'ウエルシア', 'マツモトキヨシ', 'スギ薬局', 'ツルハ', 'ヤマト運輸', '日本郵便', '郵便局',
  '業務スーパー', 'イオン', 'まいばすけっと', '西友', 'イトーヨーカドー', 'コストコ', 'ドラッグストア'
];

// 全角→半角などをそろえ、日本語の文字の間に入った余分なスペースを詰める
export function normalize(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/[￥]/g, '¥')
    .replace(/(\d)、(?=\d{3})/g, '$1,')
    .split('\n')
    .map((line) => line
      .replace(/([^\x00-\x7F])[ \t]+(?=[^\x00-\x7F])/g, '$1')
      .replace(/[ \t]+/g, ' ')
      .replace(/(?<![A-Za-z0-9])(?:[A-Za-z0-9] ){2,}[A-Za-z0-9](?![A-Za-z0-9])/g, (m) => m.replace(/ /g, ''))
      .trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

const compact = (s) => s.replace(/\s+/g, '');

// 「7,981」「7.981」「638」のような正しい形の金額か
export function isMoneyToken(t) {
  return /^\d{1,3}(?:[,.]\d{3})+$/.test(t) || /^\d{1,7}$/.test(t);
}

// 1行の中の金額らしい数字を取り出す（税率・時刻・日付は除外）
export function parseNumbers(line) {
  // スペースは数字の区切りとして残す（「2, 380」のような区切り直後のスペースだけ詰める）
  const cl = String(line)
    .replace(/(\d[,.])\s+(?=\d{3})/g, '$1')
    .replace(/([¥\\])\s+(?=\d)/g, '$1')
    .replace(/(\d)\s+(?=円)/g, '$1')
    .replace(/\d{1,2}(?:\.\d)?\s?%/g, ' ')
    .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, ' ')
    .replace(/(?:19|20)\d{2}[年\/.\-]\d{1,2}[月\/.\-]\d{1,2}日?/g, ' ');
  const out = [];
  // 数字と区切り（, .）のかたまりごとに見る。「8.6139」のように区切り方がおかしいものは読み違いとして捨てる
  const re = /([¥\\])?([\d][\d,.]*)(円)?/g;
  let m;
  while ((m = re.exec(cl)) !== null) {
    const token = m[2].replace(/[,.]+$/, '');
    if (!isMoneyToken(token)) continue;
    const value = parseInt(token.replace(/[,.]/g, ''), 10);
    if (!Number.isFinite(value)) continue;
    out.push({ value, marked: Boolean(m[1] || m[3]) });
  }
  return out;
}

const SKIP_TOTAL = /(預り|預かり|釣|おつり|ポイント|対象|内税|消費税|税額|税等|税合計|税計|値引|割引|点数|数量|単価|残高|チャージ|TEL|電話|No\.|レジ|担当|会員|カード番号)/i;
const TOTAL_KEYWORDS = [
  [/総合計/, 12],
  [/(?<!小)合計/, 10],
  [/(領収金額|ご請求|請求金額|お支払|支払金額|お買上|お買い上げ|お会計)/, 8],
  [/(クレジット|電子マネー|ご利用額|QUICPay|PayPay)/i, 7],
  [/税込/, 6],
  [/金額/, 4]
];
const ONLY_NUMBER = /^[¥\\]?\s*[\d,.\s]+\s*円?$/;
const SUBTOTAL = /小計/;
// 合計とは別に書かれる税額の行（外税・税合計など）
const TAX_TOTAL = /(税合計|外税計|内税計|消費税等合計|消費税合計)/;
const TAX_LINE = /(内消費税|消費税|税額|税等|外税|外\d{1,2}%)/;

function lineNumbers(lines, i, min = 1) {
  let nums = parseNumbers(lines[i]).filter((n) => n.value >= min && n.value <= 10000000);
  if (nums.length === 0 && lines[i + 1] && ONLY_NUMBER.test(lines[i + 1])) {
    nums = parseNumbers(lines[i + 1]).filter((n) => n.value >= min && n.value <= 10000000);
  }
  return nums;
}

// 合計金額を選ぶ。合計の行・支払いの行・「小計＋外税」をそれぞれ候補にして、点数の高いものを採用する。
// 商品の行（キーワードのない行）からは選ばない。
function findAmount(lines) {
  const cand = new Map();
  const add = (value, score, marked) => {
    const c = cand.get(value) || { value, score: 0, sources: 0, best: 0 };
    c.score += score + (marked ? 1 : 0);
    c.sources += 1;
    c.best = Math.max(c.best, score);
    cand.set(value, c);
  };

  const subtotals = [];
  const taxes = [];
  lines.forEach((line, i) => {
    const cl = compact(line);
    if (SUBTOTAL.test(cl) && !/対象/.test(cl)) lineNumbers(lines, i, 10).forEach((n) => subtotals.push(n.value));
    if ((TAX_TOTAL.test(cl) || /外税|外\d{1,2}%/.test(cl)) && !/対象/.test(cl)) lineNumbers(lines, i, 1).forEach((n) => taxes.push(n.value));
    if (SKIP_TOTAL.test(cl)) return;
    const kw = TOTAL_KEYWORDS.find(([re]) => re.test(cl));
    if (!kw) return;
    // 読み違いに備えて、行の中の数字はすべて候補にする（2桁以上）
    lineNumbers(lines, i, 10).forEach((n) => add(n.value, kw[1], n.marked));
  });
  // 小計＋外税 と一致する候補は信頼度を上げる（計算だけで出た金額は控えめな点数）
  const computed = new Set();
  for (const s of new Set(subtotals)) {
    for (const t of new Set(taxes)) {
      if (t > 0 && t <= s * 0.11 + 1) computed.add(s + t);
    }
  }
  for (const v of computed) {
    if (cand.has(v)) { cand.get(v).score += 6; cand.get(v).sources += 1; }
    else add(v, 5, false);
  }
  // 「¥8,619」の一部だけ読めた「19」のような欠片は除く（最大の候補の1/20未満）
  const maxValue = Math.max(0, ...[...cand.values()].map((c) => c.value));
  for (const [v] of cand) if (v * 20 < maxValue) cand.delete(v);
  const ranked = [...cand.values()].sort((a, b) => b.score - a.score || b.best - a.best || b.value - a.value);
  if (ranked.length) {
    const top = ranked[0];
    const agreed = top.sources >= 2 || top.score >= 15;
    // 同じくらいの点数で別の金額がある場合は、読み違いの可能性があるので確認してもらう
    const rival = ranked[1] && ranked[1].score >= top.score - 2;
    return { value: top.value, conf: !rival && (top.best >= 10 || agreed) ? 'high' : 'low' };
  }
  // 合計の行が読めなかった場合は小計（内税のレシートなど）
  if (subtotals.length) return { value: Math.max(...subtotals), conf: 'low' };

  // キーワードが無い場合（手書きの領収書など）は「¥」「円」付きで最大の金額
  let max = null;
  lines.forEach((line) => {
    if (SKIP_TOTAL.test(compact(line))) return;
    parseNumbers(line).forEach((n) => {
      if (n.marked && n.value <= 10000000 && (!max || n.value > max)) max = n.value;
    });
  });
  return max ? { value: max, conf: 'low' } : { value: null, conf: 'none' };
}

function findTax(lines, total) {
  const cleaned = lines.map(compact);
  const has10 = cleaned.some((l) => /(?<!\d)10%/.test(l));
  const has8 = cleaned.some((l) => /(?<!\d)8%/.test(l) || /軽減/.test(l));
  let taxRate = 'unknown';
  if (has10 && has8) taxRate = 'mixed';
  else if (has10) taxRate = '10';
  else if (has8) taxRate = '8';

  const valid = (v) => v > 0 && (!total || v <= total * 0.11 + 1);
  // 1) 税の合計が書かれていればそれを使う
  let taxTotal = null;
  // 2) なければ税率ごとの税額を足す（例：8%対象 ¥150 内消費税 ¥11 ／ 10%対象 ¥220 内消費税 ¥20）
  let sum = 0;
  cleaned.forEach((cl, i) => {
    if (TAX_TOTAL.test(cl)) {
      const nums = parseNumbers(cl.slice(cl.search(TAX_TOTAL))).filter((n) => valid(n.value));
      if (nums.length && taxTotal == null) taxTotal = nums[nums.length - 1].value;
      return;
    }
    const k = cl.search(TAX_LINE);
    if (k < 0) return;
    const after = cl.slice(k);
    // 「(外8% 対象 ¥7,981)」のような課税対象額の行は除く
    if (/対象/.test(after)) return;
    let nums = parseNumbers(after).filter((n) => n.value >= 1);
    if (nums.length === 0 && lines[i + 1] && ONLY_NUMBER.test(lines[i + 1])) nums = parseNumbers(lines[i + 1]);
    if (nums.length && valid(nums[nums.length - 1].value)) sum += nums[nums.length - 1].value;
  });
  let taxAmount = taxTotal != null ? taxTotal : sum || null;
  if (taxAmount != null && !valid(taxAmount)) taxAmount = null;
  return {
    taxRate,
    taxRateConf: taxRate === 'unknown' ? 'none' : 'high',
    taxAmount,
    taxAmountConf: taxAmount != null ? 'high' : 'none'
  };
}

function validDate(y, m, d, today) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  const limit = new Date(today.getTime() + 2 * 86400000);
  if (y < 2015 || dt > limit) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function findDate(lines, today) {
  const patterns = [
    [/((?:19|20)\d{2})[年\/.\-](\d{1,2})[月\/.\-](\d{1,2})/, (m) => [+m[1], +m[2], +m[3]], 'high'],
    [/令和(\d{1,2}|元)年(\d{1,2})月(\d{1,2})/, (m) => [2018 + (m[1] === '元' ? 1 : +m[1]), +m[2], +m[3]], 'high'],
    [/(?<![A-Za-z\d])R(\d{1,2})[.\/年](\d{1,2})[.\/月](\d{1,2})/, (m) => [2018 + +m[1], +m[2], +m[3]], 'high'],
    [/(?<!\d)(\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?!\d)/, (m) => [2000 + +m[1], +m[2], +m[3]], 'low']
  ];
  for (const [re, toYmd, conf] of patterns) {
    for (const line of lines) {
      const m = compact(line).match(re);
      if (!m) continue;
      const [y, mo, d] = toYmd(m);
      const date = validDate(y, mo, d, today);
      if (date) return { value: date, conf };
    }
  }
  return { value: null, conf: 'none' };
}

function findInvoice(lines) {
  for (const line of lines) {
    const cl = compact(line).replace(/[丁Тт]/g, 'T');
    const m = cl.match(/登録番号[:：]?T?(\d{13})(?!\d)/) || cl.match(/T-?(\d{13})(?!\d)/);
    if (m) return { value: 'T' + m[1], conf: 'high' };
  }
  return { value: '', conf: 'none' };
}

const NOT_VENDOR = /(領収|レシート|RECEIPT|様|毎度|ありがと|いらっしゃいませ|〒|TEL|電話|FAX|http|www|登録番号|^[\d\s\-\/.:¥\\,()]+$)/i;
const ADDRESS = /(都|道|府|県).*(市|区|町|村)|(市|区)[^\s]*\d+-\d+/;

export function cleanVendor(s) {
  return s
    .replace(/[^\p{L}\p{N}\s&・\-.']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

function findVendor(lines) {
  const lower = (s) => s.toLowerCase();
  for (const brand of KNOWN_VENDORS) {
    const line = lines.find((l) => lower(compact(l)).includes(lower(brand)));
    if (line) return { value: cleanVendor(line), conf: 'high' };
  }
  for (const line of lines.slice(0, 6)) {
    if (NOT_VENDOR.test(line) || ADDRESS.test(line)) continue;
    const v = cleanVendor(line);
    // 読み違いの文字の羅列（例：「ーー 0N0逢」）は店名にしない
    const chars = v.replace(/\s/g, '');
    const meaningful = (chars.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z]/gu) || []).filter((c) => c !== 'ー').length;
    if (meaningful >= 2 && meaningful / chars.length >= 0.6) return { value: v, conf: 'low' };
  }
  return { value: '', conf: 'none' };
}

// 店の電話番号（店名の学習に使う）
function findPhone(lines) {
  for (const line of lines) {
    const m = compact(line).match(/(?<!\d)(0\d{1,4})-(\d{1,4})-(\d{3,4})(?!\d)/);
    if (m) return m[1] + m[2] + m[3];
  }
  return '';
}

export function extract(rawText, opts = {}) {
  const today = opts.today || new Date();
  const text = normalize(rawText);
  const lines = text.split('\n');
  const date = findDate(lines, today);
  const vendor = findVendor(lines);
  const amount = findAmount(lines);
  const tax = findTax(lines, amount.value);
  const invoice = findInvoice(lines);
  return {
    text,
    date: date.value,
    vendor: vendor.value,
    amount: amount.value,
    taxRate: tax.taxRate,
    taxAmount: tax.taxAmount,
    invoiceNo: invoice.value,
    phone: findPhone(lines),
    conf: {
      date: date.conf,
      vendor: vendor.conf,
      amount: amount.conf,
      taxRate: tax.taxRateConf,
      taxAmount: tax.taxAmountConf,
      invoiceNo: invoice.conf
    }
  };
}

export function isValidInvoiceNo(v) {
  return /^T\d{13}$/.test(v || '');
}
