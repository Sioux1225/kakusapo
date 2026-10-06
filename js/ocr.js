// 端末内OCR（Tesseract.js）と画像の前処理。
// 画像はスマホの中で処理し、外部には送らない。
// 初回のみ、OCRプログラムと日本語データ（数MB）をダウンロードする。以降はブラウザ内に保存される。

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
      await worker.setParameters({
        tessedit_pageseg_mode: '4',
        preserve_interword_spaces: '1'
      });
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

// onProgress(0〜1, ラベル)
export async function recognize(canvas, onProgress) {
  progressHandler = (m) => {
    if (!onProgress) return;
    if (m.status === 'recognizing text') onProgress(0.3 + m.progress * 0.7, '文字を読み取っています');
    else if (/load|initializ/.test(m.status)) onProgress(Math.min(0.3, (m.progress || 0) * 0.3), '読み取りの準備をしています');
  };
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(canvas);
    return { text: data.text || '', confidence: data.confidence || 0 };
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

// グレースケール化＋コントラストの引き伸ばし（感熱紙の薄い文字対策）
export function preprocess(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
    d[i] = g;
    hist[g]++;
  }
  const total = width * height;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < total * 0.01; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < total * 0.01; hi--);
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function toJpeg(canvas, quality = 0.8) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}
