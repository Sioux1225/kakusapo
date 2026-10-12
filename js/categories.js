// 勘定科目マスタと、店名・品目からの科目提案。
// 並び順は軽貨物ドライバーがよく使う順（要件定義書 5.2）。
// blueNo は青色申告決算書（一般用）の経費欄番号。追加科目は空欄（㉕〜㉚）に記入する。

export const CATEGORIES = [
  { id: 'fuel', name: '車両費', hint: 'ガソリン・軽油', blueNo: '㉕', extra: true, ratio: 80,
    keywords: ['ガソリン', '軽油', 'レギュラー', 'ハイオク', '給油', 'ENEOS', 'エネオス', '出光', 'apollostation', 'アポロ', 'コスモ', 'COSMO', 'シェル', 'Shell', 'キグナス', '宇佐美', 'セルフSS', 'サービスステーション', 'ガソリンスタンド', '燃料'] },
  { id: 'travel', name: '旅費交通費', hint: '高速・ETC・駐車場', blueNo: '⑪', ratio: 100,
    keywords: ['高速', 'NEXCO', 'ネクスコ', '首都高', '阪神高速', 'ETC', '通行料', 'パーキング', 'コインパーキング', '駐車料', '駐車場', 'タイムズ', 'Times', 'リパーク', 'NPC', '名鉄協商', '電車', '乗車券', 'JR', 'タクシー', 'バス', 'ホテル', '宿泊', 'akippa', 'アキッパ', '特P', '軒先パーキング', '三井のリパーク'] },
  { id: 'repair', name: '修繕費', hint: 'オイル・タイヤ・車検整備', blueNo: '⑯', ratio: 80,
    keywords: ['オイル交換', 'オイル', 'タイヤ', '車検', '整備', '修理', '点検', 'バッテリー', 'ワイパー', 'オートバックス', 'AUTOBACS', 'イエローハット', 'ジェームス', 'タイヤ館', '洗車', '板金', 'パンク', 'ブレーキ', 'エンジンオイル', 'ワイパーゴム'] },
  { id: 'insurance', name: '損害保険料', hint: '任意保険・自賠責', blueNo: '⑮', ratio: 80,
    keywords: ['保険', '自賠責', '損保', '東京海上', '三井住友海上', '損保ジャパン', 'あいおいニッセイ', '貨物保険', '任意保険', '共済', '黒ナンバー保険'] },
  { id: 'taxes', name: '租税公課', hint: '自動車税・重量税・印紙', blueNo: '⑧', ratio: 80,
    keywords: ['軽自動車税', '自動車税', '重量税', '印紙', '収入印紙', '証紙', '手数料納付'] },
  { id: 'comm', name: '通信費', hint: 'スマホ料金', blueNo: '⑫', ratio: 50,
    keywords: ['ドコモ', 'docomo', 'ソフトバンク', 'SoftBank', '楽天モバイル', 'ワイモバイル', 'Y!mobile', 'UQ', '携帯', 'スマホ', '通信料', '通話料', '切手', 'Wi-Fi', 'ahamo', 'povo', 'LINEMO', 'mineo', 'IIJ', '日本通信', 'au'] },
  { id: 'rent', name: '地代家賃', hint: '月極駐車場', blueNo: '㉓', ratio: 100,
    keywords: ['月極', '家賃', '賃料', '駐車場代'] },
  { id: 'supplies', name: '消耗品費', hint: '10万円未満の備品・日用品', blueNo: '⑰', ratio: 100,
    keywords: ['ダイソー', 'DAISO', 'セリア', 'キャンドゥ', 'ホームセンター', 'カインズ', 'コーナン', 'DCM', 'コメリ', 'ビバホーム', '文具', 'ボールペン', '軍手', '台車', 'ドラレコ', 'ドライブレコーダー', '電池', '充電', 'ケーブル', 'ヨドバシ', 'ビックカメラ', 'ケーズデンキ', 'Amazon', 'アマゾン', 'ワークマン', 'WORKMAN', '作業着', '作業服', '安全靴', '手袋', 'カッター', '養生', 'ラッシングベルト', 'ロープ', 'スマホホルダー', 'モバイルバッテリー', 'レインコート', 'カッパ', '雨具', '懐中電灯'] },
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
  { id: 'fees', name: '支払手数料', hint: '振込・決済の手数料', blueNo: '㉗', extra: true, ratio: 100,
    keywords: ['振込手数料', '振込料', '送金手数料', '決済手数料', 'システム利用料', 'プラットフォーム手数料'] },
  { id: 'training', name: '研修費', hint: '講習・セミナー・業務の本', blueNo: '㉘', extra: true, ratio: 100,
    keywords: ['研修', '講習', 'セミナー', '受講料', '講座', '安全運転', '書籍', '紀伊國屋', '紀伊国屋', 'ジュンク堂', 'TSUTAYA', '蔦屋', '丸善', '地図'] },
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

// 経費にできないもの・所得控除になるものの注意（支払先・メモ・読み取った文字から判断）
// 戻り値：{ level: 'ng' | 'deduction', title, body } または null
const NOT_EXPENSE = [
  { re: /反則金|罰金|違反金|放置違反|交通反則|科料/, level: 'ng', title: '反則金・罰金は経費にできません',
    body: '仕事中の交通違反でも、反則金・罰金・放置違反金は経費になりません。登録しないでください。' },
  { re: /所得税|住民税|市民税|県民税|都民税|府民税|道民税|延滞税|加算税|延滞金/, level: 'ng', title: '所得税・住民税は経費にできません',
    body: '所得税・住民税や、その延滞税・加算税は経費になりません。軽自動車税・重量税・個人事業税は経費（租税公課）にできます。' },
  { re: /国民年金|国民健康保険|国保|後期高齢者医療|介護保険料/, level: 'deduction', title: '経費ではなく「所得控除」です',
    body: '国民年金・国民健康保険は経費ではなく「社会保険料控除」になります。経費には登録せず、転記ガイドの「所得控除」に支払った合計をメモしてください。' },
  { re: /生命保険|医療保険|がん保険|地震保険|個人年金/, level: 'deduction', title: '経費ではなく「所得控除」です',
    body: '生命保険・医療保険・地震保険は経費ではなく「生命保険料控除・地震保険料控除」になります。届いた控除証明書の金額を、転記ガイドの「所得控除」にメモしてください。車の保険は経費（損害保険料）にできます。' },
  { re: /小規模企業共済|iDeCo|イデコ|個人型確定拠出/i, level: 'deduction', title: '経費ではなく「所得控除」です',
    body: '小規模企業共済・iDeCo の掛金は経費ではなく「小規模企業共済等掛金控除」になります。転記ガイドの「所得控除」にメモしてください。' },
  { re: /ふるさと納税|寄附|寄付/, level: 'deduction', title: '経費ではなく「寄附金控除」です',
    body: 'ふるさと納税などの寄附は経費ではなく「寄附金控除」になります。届いた受領証明書の金額を、転記ガイドの「所得控除」にメモしてください。' }
];

export function deductibilityWarning(...texts) {
  const text = texts.filter(Boolean).join(' ').normalize('NFKC');
  if (!text.trim()) return null;
  const hit = NOT_EXPENSE.find((w) => w.re.test(text));
  return hit ? { level: hit.level, title: hit.title, body: hit.body } : null;
}
