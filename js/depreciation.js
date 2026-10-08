// 減価償却の計算（DOMに依存しない純粋な関数。Node のテストからも読み込む）
//
// 方法の決め方（個人事業主・平成19年4月以降に取得した資産）
// - 10万円未満             … 固定資産にしない（消耗品費として領収書で登録）
// - 青色申告で30万円未満    … 少額減価償却資産の特例：買った年にまとめて経費
// - 白色申告で10万〜20万円未満 … 一括償却資産：3年で均等に経費（買った月に関係なく1/3ずつ）
// - それ以外               … 定額法：耐用年数で割り、1年目は使い始めた月からの月割り
// 耐用年数の最後は、帳簿上の価値を1円だけ残す（備忘価額）。

// 定額法の償却率（平成19年4月1日以後に取得）
export const STRAIGHT_LINE_RATE = {
  2: 0.5, 3: 0.334, 4: 0.25, 5: 0.2, 6: 0.167, 7: 0.143, 8: 0.125, 9: 0.112, 10: 0.1,
  11: 0.091, 12: 0.084, 13: 0.077, 14: 0.072, 15: 0.067, 20: 0.05
};

// 法定耐用年数（軽貨物ドライバーがよく使うもの）
export const LEGAL_LIFE = {
  carBlack: 3,   // 運送事業用の小型車（黒ナンバー）
  carYellow: 4,  // 自家用の軽自動車（黄色ナンバー）
  carWhite: 6,   // 自家用の普通自動車（白ナンバー）
  pc: 4          // パソコン
};

// 中古資産の耐用年数（簡便法）
export function usedLife(legal, elapsedYears) {
  const e = Math.max(0, Math.floor(Number(elapsedYears) || 0));
  const life = e >= legal ? Math.floor(legal * 0.2) : Math.floor(legal - e + e * 0.2);
  return Math.max(2, life);
}

// 資産の耐用年数
export function lifeOf(asset) {
  let legal;
  if (asset.kind === 'car') legal = LEGAL_LIFE[{ black: 'carBlack', yellow: 'carYellow', white: 'carWhite' }[asset.plate] || 'carYellow'];
  else if (asset.kind === 'pc') legal = LEGAL_LIFE.pc;
  else legal = Math.max(2, Math.floor(Number(asset.life) || 0));
  return asset.used ? usedLife(legal, asset.elapsedYears) : legal;
}

// 償却の方法を決める
export function methodOf(asset, filingType) {
  const cost = Number(asset.cost) || 0;
  if (cost < 100000) return 'expense';
  if (filingType !== 'white' && cost < 300000) return 'small';
  if (cost < 200000) return 'lump3';
  return 'straight';
}

export const METHOD_LABEL = {
  expense: '10万円未満のため経費（消耗品費）',
  small: '少額減価償却資産の特例（買った年にまとめて経費）',
  lump3: '一括償却資産（3年で均等に経費）',
  straight: '定額法'
};

const rateFor = (life) => STRAIGHT_LINE_RATE[life] || Math.round((1 / life) * 1000) / 1000;

// 年ごとの償却費の一覧 [{ year, depreciation, expense, bookValue }]
export function schedule(asset, filingType, untilYear) {
  const cost = Math.floor(Number(asset.cost) || 0);
  const ratio = asset.businessRatio == null ? 100 : Number(asset.businessRatio);
  const [y0, m0] = String(asset.acquiredOn || '').split('-').map(Number);
  if (!cost || !y0 || !m0) return [];
  const method = methodOf(asset, filingType);
  const out = [];
  let book = cost;
  const push = (year, dep) => {
    book -= dep;
    out.push({ year, depreciation: dep, expense: Math.floor((dep * ratio) / 100), bookValue: book });
  };
  if (method === 'expense' || method === 'small') {
    push(y0, cost);
    return out;
  }
  if (method === 'lump3') {
    const per = Math.floor(cost / 3);
    for (let i = 0; i < 3; i++) push(y0 + i, i < 2 ? per : cost - per * 2);
    return out;
  }
  const life = lifeOf(asset);
  const annual = Math.floor(cost * rateFor(life));
  const last = untilYear || y0 + life + 2;
  for (let year = y0; year <= last && book > 1; year++) {
    const months = year === y0 ? 12 - m0 + 1 : 12;
    let dep = Math.floor((annual * months) / 12);
    if (dep >= book - 1) dep = book - 1;
    push(year, dep);
  }
  return out;
}

// ある年の償却費（なければ 0）
export function forYear(asset, filingType, year) {
  const row = schedule(asset, filingType, year).find((r) => r.year === year);
  return row || { year, depreciation: 0, expense: 0, bookValue: null };
}
