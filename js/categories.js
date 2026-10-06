// 勘定科目マスタと、店名・品目からの科目提案。
// 並び順は軽貨物ドライバーがよく使う順（要件定義書 5.2）。
// blueNo は青色申告決算書（一般用）の経費欄番号。追加科目は空欄（㉕〜㉚）に記入する。

export const CATEGORIES = [
  { id: 'fuel', name: '車両費', hint: 'ガソリン・軽油', blueNo: '㉕', extra: true, ratio: 80,
    keywords: ['ガソリン', '軽油', 'レギュラー', 'ハイオク', '給油', 'ENEOS', 'エネオス', '出光', 'apollostation', 'アポロ', 'コスモ', 'COSMO', 'シェル', 'Shell', 'キグナス', '宇佐美', 'セルフSS', 'サービスステーション'] },
  { id: 'travel', name: '旅費交通費', hint: '高速・ETC・駐車場', blueNo: '⑪', ratio: 100,
    keywords: ['高速', 'NEXCO', 'ネクスコ', '首都高', '阪神高速', 'ETC', '通行料', 'パーキング', 'コインパーキング', '駐車料', '駐車場', 'タイムズ', 'Times', 'リパーク', 'NPC', '名鉄協商', '電車', '乗車券', 'JR', 'タクシー', 'バス', 'ホテル', '宿泊'] },
  { id: 'repair', name: '修繕費', hint: 'オイル・タイヤ・車検整備', blueNo: '⑯', ratio: 80,
    keywords: ['オイル交換', 'オイル', 'タイヤ', '車検', '整備', '修理', '点検', 'バッテリー', 'ワイパー', 'オートバックス', 'AUTOBACS', 'イエローハット', 'ジェームス', '洗車', '板金'] },
  { id: 'insurance', name: '損害保険料', hint: '任意保険・自賠責', blueNo: '⑮', ratio: 80,
    keywords: ['保険', '自賠責', '損保', '東京海上', '三井住友海上', '損保ジャパン', 'あいおいニッセイ', '貨物保険'] },
  { id: 'taxes', name: '租税公課', hint: '自動車税・重量税・印紙', blueNo: '⑧', ratio: 80,
    keywords: ['軽自動車税', '自動車税', '重量税', '印紙', '収入印紙', '証紙', '手数料納付'] },
  { id: 'comm', name: '通信費', hint: 'スマホ料金', blueNo: '⑫', ratio: 50,
    keywords: ['ドコモ', 'docomo', 'ソフトバンク', 'SoftBank', '楽天モバイル', 'ワイモバイル', 'Y!mobile', 'UQ', '携帯', 'スマホ', '通信料', '通話料', '切手', 'Wi-Fi'] },
  { id: 'rent', name: '地代家賃', hint: '月極駐車場', blueNo: '㉓', ratio: 100,
    keywords: ['月極', '家賃', '賃料', '駐車場代'] },
  { id: 'supplies', name: '消耗品費', hint: '10万円未満の備品・日用品', blueNo: '⑰', ratio: 100,
    keywords: ['ダイソー', 'DAISO', 'セリア', 'キャンドゥ', 'ホームセンター', 'カインズ', 'コーナン', 'DCM', 'コメリ', 'ビバホーム', '文具', 'ボールペン', '軍手', '台車', 'ドラレコ', 'ドライブレコーダー', '電池', '充電', 'ケーブル', 'ヨドバシ', 'ビックカメラ', 'ケーズデンキ', 'Amazon', 'アマゾン'] },
  { id: 'lease', name: 'リース料', hint: '車両リース', blueNo: '㉖', extra: true, ratio: 80,
    keywords: ['リース', 'カーリース'] },
  { id: 'packing', name: '荷造運賃', hint: '梱包資材・送料', blueNo: '⑨', ratio: 100,
    keywords: ['段ボール', 'ダンボール', '梱包', 'ガムテープ', '緩衝材', '宅急便', '宅配便', 'ゆうパック', '送料'] },
  { id: 'utilities', name: '水道光熱費', hint: '電気・ガス・水道', blueNo: '⑩', ratio: 30,
    keywords: ['電気料金', '電力', 'ガス料金', '水道'] },
  { id: 'entertainment', name: '接待交際費', hint: '取引先との飲食・贈答', blueNo: '⑭', ratio: 100,
    keywords: ['贈答', 'ギフト', '手土産', '御中元', '御歳暮'] },
  { id: 'ads', name: '広告宣伝費', hint: '名刺・チラシ', blueNo: '⑬', ratio: 100,
    keywords: ['名刺', 'チラシ', '広告'] },
  { id: 'outsourcing', name: '外注工賃', hint: '外注・業務委託', blueNo: '㉑', ratio: 100,
    keywords: ['外注'] },
  { id: 'welfare', name: '福利厚生費', hint: '従業員がいる場合', blueNo: '⑲', ratio: 100, keywords: [] },
  { id: 'misc', name: '雑費', hint: '他に当てはまらないもの', blueNo: '㉛', ratio: 100, keywords: [] }
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const categoryName = (id) => (CATEGORY_MAP[id] ? CATEGORY_MAP[id].name : '未分類');

// 迷ったときに先頭に並べる候補
const FALLBACK = ['fuel', 'travel', 'supplies', 'repair'];

const isAscii = (s) => /^[\x00-\x7F]+$/.test(s);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function hits(keyword, text) {
  if (!text) return false;
  if (isAscii(keyword)) {
    return new RegExp(`(?<![A-Za-z])${escapeRe(keyword)}(?![A-Za-z])`, 'i').test(text);
  }
  return text.replace(/\s+/g, '').includes(keyword);
}

export function vendorKey(vendor) {
  return String(vendor || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

// 戻り値：{ top, confidence, matched, candidates }
// candidates は先頭が提案、最大4件（雑費は提案しない）
export function suggestCategory(text, vendor, vendorMap = {}) {
  const learned = vendorMap[vendorKey(vendor)];
  const scores = {};
  const matched = {};
  for (const c of CATEGORIES) {
    for (const kw of c.keywords) {
      let s = 0;
      if (hits(kw, vendor)) s = 3;
      else if (hits(kw, text)) s = 1;
      if (s > 0) {
        scores[c.id] = (scores[c.id] || 0) + s;
        if (!matched[c.id] || s > matched[c.id].s) matched[c.id] = { kw, s };
      }
    }
  }
  const ranked = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
  let top = null;
  let confidence = 0;
  let matchedWord = '';
  if (learned && CATEGORY_MAP[learned]) {
    top = learned;
    confidence = 0.95;
    matchedWord = '前回の入力';
  } else if (ranked.length > 0) {
    top = ranked[0];
    confidence = scores[top] >= 3 ? 0.85 : 0.6;
    matchedWord = matched[top].kw;
  }
  const candidates = [];
  for (const id of [top, ...ranked, ...FALLBACK]) {
    if (id && id !== 'misc' && !candidates.includes(id)) candidates.push(id);
  }
  return { top, confidence, matched: matchedWord, candidates: candidates.slice(0, 4) };
}
