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
  'ウエルシア', 'マツモトキヨシ', 'スギ薬局', 'ツルハ', 'ヤマト運輸', '日本郵便', '郵便局'
];

// 全角→半角などをそろえ、日本語の文字の間に入った余分なスペースを詰める
export function normalize(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/[￥]/g, '¥')
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

// 1行の中の金額らしい数字を取り出す（税率・時刻・日付は除外）
export function parseNumbers(line) {
  const cl = compact(line)
    .replace(/\d{1,2}(?:\.\d)?%/g, ' ')
    .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, ' ')
    .replace(/(?:19|20)\d{2}[年\/.\-]\d{1,2}[月\/.\-]\d{1,2}日?/g, ' ');
  const out = [];
  const re = /([¥\\])?(\d{1,3}(?:[,.]\d{3})+|\d{1,7})(円)?/g;
  let m;
  while ((m = re.exec(cl)) !== null) {
    const value = parseInt(m[2].replace(/[,.]/g, ''), 10);
    if (!Number.isFinite(value)) continue;
    out.push({ value, marked: Boolean(m[1] || m[3]) });
  }
  return out;
}

const SKIP_TOTAL = /(預り|預かり|釣|おつり|ポイント|対象|内税|消費税|税額|税等|値引|割引|点数|数量|単価|残高|チャージ|TEL|電話|No\.|レジ|担当|会員|カード番号)/i;
const TOTAL_KEYWORDS = [
  [/総合計/, 12],
  [/(?<!小)合計/, 10],
  [/(領収金額|ご請求|請求金額|お支払|支払金額|お買上|お買い上げ|お会計)/, 8],
  [/税込/, 6],
  [/金額/, 4],
  [/小計/, 3]
];
const ONLY_NUMBER = /^[¥\\]?\s*[\d,.\s]+\s*円?$/;

function findAmount(lines) {
  let best = null;
  lines.forEach((line, i) => {
    const cl = compact(line);
    if (SKIP_TOTAL.test(cl)) return;
    const kw = TOTAL_KEYWORDS.find(([re]) => re.test(cl));
    if (!kw) return;
    let nums = parseNumbers(line).filter((n) => n.value >= 1);
    if (nums.length === 0 && lines[i + 1] && ONLY_NUMBER.test(lines[i + 1])) {
      nums = parseNumbers(lines[i + 1]).filter((n) => n.value >= 1);
    }
    if (nums.length === 0) return;
    const value = nums[nums.length - 1].value;
    if (value > 10000000) return;
    const score = kw[1];
    if (!best || score > best.score || (score === best.score && value > best.value)) {
      best = { value, score };
    }
  });
  if (best) return { value: best.value, conf: best.score >= 8 ? 'high' : 'low' };

  // キーワードが無い場合は「¥」「円」付きで最大の金額
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

  let taxAmount = 0;
  let found = false;
  cleaned.forEach((cl, i) => {
    const k = cl.search(/(消費税|内税|税額|税等)/);
    if (k < 0) return;
    // 「8%対象 ¥150 内消費税 ¥11」のように対象額が前にある場合は、税の語より後ろだけを見る
    let nums = parseNumbers(cl.slice(k)).filter((n) => n.value >= 1);
    if (nums.length === 0 && lines[i + 1] && ONLY_NUMBER.test(lines[i + 1])) nums = parseNumbers(lines[i + 1]);
    if (nums.length === 0) return;
    taxAmount += nums[nums.length - 1].value;
    found = true;
  });
  if (found && total && taxAmount > total * 0.11 + 1) found = false;
  return {
    taxRate,
    taxRateConf: taxRate === 'unknown' ? 'none' : 'high',
    taxAmount: found ? taxAmount : null,
    taxAmountConf: found ? 'high' : 'none'
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
    if (v.length >= 2 && /[\p{L}]/u.test(v)) return { value: v, conf: 'low' };
  }
  return { value: '', conf: 'none' };
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
