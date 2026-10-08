// 端末内OCR（Tesseract.js）と画像の前処理。
// 画像はスマホの中で処理し、外部には送らない。
// 初回のみ、OCRプログラムと日本語データ（数MB）をダウンロードする。以降はブラウザ内に保存される。

import { isMoneyToken } from './extract.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let workerPromise = null;
let progressHandler = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('OCRプログラムを読み込めませんでした（通信環境を確認してください）'));
    document.head.appendChild(s);
  });
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      await loadScript(TESSERACT_URL);
      const worker = await window.Tesseract.createWorker('jpn', 1, {
        logger: (m) => { if (progressHandler) progressHandler(m); }
      });
      await worker.setParameters({ preserve_interword_spaces: '1' });
      return worker;
    })();
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

// 先にOCRの準備だけしておく（撮影ボタンを押したタイミングで呼ぶ）
export function warmUp() {
  getWorker().catch(() => {});
}

// 金額が書かれた行（合計・小計・税・支払い）。数字だけで読み直す対象
const MONEY_LINE = /(合|計|税|外|内|クレ|カード|支払|預|釣|領収|金額|請求|現金)/;

// レシートを読み取る。onProgress(0〜1, ラベル)
// 1回目：日本語として全体を読む
// 2回目：金額の行だけを「数字専用」で読み直し、行末に「¥数字」を付け足す
//        （大きく太い「¥8,619」の 6 が「ら」になるような読み違いを防ぐ）
export async function recognize(canvas, onProgress) {
  progressHandler = (m) => {
    if (!onProgress) return;
    if (m.status === 'recognizing text') onProgress(0.3 + m.progress * 0.55, '文字を読み取っています');
    else if (/load|initializ/.test(m.status)) onProgress(Math.min(0.3, (m.progress || 0) * 0.3), '読み取りの準備をしています');
  };
  try {
    const worker = await getWorker();
    await worker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '' });
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    progressHandler = null;
    const lines = (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
    if (!lines.length) return { text: data.text || '', confidence: data.confidence || 0 };

    const targets = lines.filter((l) => MONEY_LINE.test(l.text.replace(/\s+/g, ''))).slice(0, 14);
    const extra = new Map();
    if (targets.length) {
      await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789,.¥\\' });
      for (let i = 0; i < targets.length; i++) {
        const l = targets[i];
        if (onProgress) onProgress(0.85 + (i / targets.length) * 0.15, '金額を確認しています');
        // 枠の取り方を変えて3回読み、多かった順に並べて残す
        // （同じ数字が複数回読めれば信頼度が上がり、割れた場合は金額の判定で「自信が低め」になる）
        const reads = [];
        for (const [padRate, leftRate] of [[0.25, 0.4], [0.5, 0.3], [0.1, 0.5]]) {
          const pad = Math.round((l.bbox.y1 - l.bbox.y0) * padRate) + 4;
          const left = Math.round(canvas.width * leftRate);
          const top = Math.max(0, l.bbox.y0 - pad);
          const rectangle = {
            left,
            top,
            width: canvas.width - left,
            height: Math.min(canvas.height - top, l.bbox.y1 - l.bbox.y0 + pad * 2)
          };
          try {
            const { data: d } = await worker.recognize(canvas, { rectangle });
            const digits = (d.text || '').replace(/\s+/g, '').replace(/[\\¥]/g, '').replace(/^[,.]+|[,.]+$/g, '');
            // 区切り方がおかしい読み取り（例：8.6139）は使わない
            if (/\d{2,}/.test(digits) && isMoneyToken(digits)) reads.push(digits);
          } catch (e) { /* この行は1回目の結果を使う */ }
        }
        if (reads.length) extra.set(l, reads.map((r) => '¥' + r).join(' '));
      }
      await worker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '' });
    }
    const text = lines.map((l) => {
      const base = l.text.replace(/\n$/, '');
      return extra.has(l) ? `${base} ${extra.get(l)}` : base;
    }).join('\n');
    return { text, rawText: data.text || '', confidence: data.confidence || 0 };
  } finally {
    progressHandler = null;
  }
}

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を開けませんでした')); };
    img.src = url;
  });
}

export function resize(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.round((img.naturalWidth || img.width) * scale);
  const h = Math.round((img.naturalHeight || img.height) * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function grayOf(canvas) {
  const ctx = canvas.getContext('2d');
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const g = new Float32Array(canvas.width * canvas.height);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
  return g;
}

// 白黒の境目の明るさ（大津の方法）
function otsu(g) {
  const hist = new Uint32Array(256);
  for (const v of g) hist[v | 0]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let th = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = g.length - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) { best = between; th = t; }
  }
  return th;
}

// flags の中で、小さなすき間（gap 以下）を許して一番長く続く範囲
function longestRun(flags, gap) {
  let best = [-1, -1];
  let start = -1;
  let last = -1;
  for (let i = 0; i <= flags.length; i++) {
    if (i < flags.length && flags[i]) {
      if (start < 0 || i - last > gap + 1) start = i;
      last = i;
      if (last - start > best[1] - best[0]) best = [start, last];
    }
  }
  return best;
}

// 背景（机など）より明るい「紙」の範囲を探す。見つからなければ画像全体
function findPaper(img) {
  const small = resize(img, 600);
  const W = small.width;
  const H = small.height;
  const g = grayOf(small);
  const th = otsu(g);
  const full = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };

  const col = new Float32Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y * W + x] > th) col[x]++;
  const colMax = Math.max(...col);
  const [x0, x1] = longestRun([...col].map((v) => v > colMax * 0.7), 3);
  if (x0 < 0 || x1 - x0 < W * 0.15) return full;

  const row = new Float32Array(H);
  for (let y = 0; y < H; y++) for (let x = x0; x <= x1; x++) if (g[y * W + x] > th) row[y]++;
  const [y0, y1] = longestRun([...row].map((v) => v > (x1 - x0 + 1) * 0.5), Math.round(H * 0.05));
  if (y0 < 0 || y1 - y0 < H * 0.2) return full;

  const k = img.naturalWidth / W;
  const pad = 4;
  const ax = Math.max(0, x0 - pad);
  const ay = Math.max(0, y0 - pad);
  const bx = Math.min(W - 1, x1 + pad);
  const by = Math.min(H - 1, y1 + pad);
  return { x: ax * k, y: ay * k, w: (bx - ax + 1) * k, h: (by - ay + 1) * k };
}

// 周りの明るさと比べて白黒にする（影・しわ・感熱紙の薄い文字に強い）
function binarize(canvas) {
  const W = canvas.width;
  const H = canvas.height;
  const g = grayOf(canvas);
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = 0; x < W; x++) {
      s += g[y * W + x];
      I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + s;
    }
  }
  const r = Math.max(8, Math.round(W / 46));
  const C = 25;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(W, H);
  const d = out.data;
  for (let y = 0; y < H; y++) {
    const b = Math.max(0, y - r);
    const f = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const a = Math.max(0, x - r);
      const e = Math.min(W, x + r + 1);
      const mean = (I[f * (W + 1) + e] - I[b * (W + 1) + e] - I[f * (W + 1) + a] + I[b * (W + 1) + a]) / ((e - a) * (f - b));
      const v = g[y * W + x] < mean - C ? 0 : 255;
      const i = (y * W + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

// OCR用の画像を作る
export function prepareForOcr(img) {
  const p = findPaper(img);
  let scale = 1400 / p.w;
  if (p.h * scale > 5000) scale = 5000 / p.h;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(p.w * scale);
  canvas.height = Math.round(p.h * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, p.x, p.y, p.w, p.h, 0, 0, canvas.width, canvas.height);
  return binarize(canvas);
}

export function toJpeg(canvas, quality = 0.8) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}
