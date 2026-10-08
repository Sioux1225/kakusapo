// バックアップ（JSON）・復元・CSV書き出し

import { db } from './db.js';
import { CATEGORY_MAP, categoryName } from './categories.js';
import { businessAmount } from './format.js';

const BACKUP_VERSION = 1;

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

const dataUrlToBlob = async (url) => (await fetch(url)).blob();

// iPhone ではファイル保存の画面（共有シート）を、それ以外ではダウンロードを使う
export async function saveFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

const stamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

export async function exportBackup() {
  const receipts = await db.allReceipts();
  const settings = await db.getSettings();
  const parts = [`{"app":"kakusapo","version":${BACKUP_VERSION},"exportedAt":${JSON.stringify(new Date().toISOString())},`];
  parts.push(`"settings":${JSON.stringify(settings)},"receipts":${JSON.stringify(receipts)},"images":{`);
  let first = true;
  for (const r of receipts) {
    if (!r.imageId) continue;
    const blob = await db.getImage(r.imageId);
    if (!blob) continue;
    parts.push(`${first ? '' : ','}${JSON.stringify(r.imageId)}:${JSON.stringify(await blobToDataUrl(blob))}`);
    first = false;
  }
  parts.push('}}');
  const saved = await saveFile(new Blob(parts, { type: 'application/json' }), `kakusapo-backup-${stamp()}.json`);
  if (saved) {
    settings.lastBackupAt = new Date().toISOString();
    await db.saveSettings(settings);
  }
  return { saved, count: receipts.length };
}

// 既存データとマージする（同じIDは更新日時が新しい方を残す）
export async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (e) {
    throw new Error('バックアップファイルを読み込めませんでした');
  }
  if (!data || data.app !== 'kakusapo' || !Array.isArray(data.receipts)) {
    throw new Error('確サポのバックアップファイルではありません');
  }
  const current = new Map((await db.allReceipts()).map((r) => [r.id, r]));
  let added = 0;
  for (const r of data.receipts) {
    const old = current.get(r.id);
    if (old && (old.updatedAt || '') >= (r.updatedAt || '')) continue;
    if (r.imageId && data.images && data.images[r.imageId]) {
      await db.putImage(r.imageId, await dataUrlToBlob(data.images[r.imageId]));
    }
    await db.putReceipt(r);
    added++;
  }
  const settings = await db.getSettings();
  if (data.settings) {
    settings.vendorMap = { ...(data.settings.vendorMap || {}), ...settings.vendorMap };
    settings.phoneMap = { ...(data.settings.phoneMap || {}), ...settings.phoneMap };
    if (!settings.lastBackupAt) settings.lastBackupAt = data.exportedAt || null;
    await db.saveSettings(settings);
  }
  return { added, total: data.receipts.length };
}

const TAX_LABEL = { '10': '10%', '8': '8%（軽減）', mixed: '10%・8%', unknown: '' };
const PAY_LABEL = { cash: '現金', card: 'クレジットカード', emoney: '電子マネー・QR', bank: '口座振替・振込', other: 'その他' };

export async function exportCsv(year) {
  const receipts = (await db.allReceipts())
    .filter((r) => !year || String(r.date || '').startsWith(String(year)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const head = ['日付', '支払先', '金額（税込）', '仕事で使った割合(%)', '経費にする金額', '勘定科目', '青色申告決算書の欄', '税率', '消費税額', 'インボイス登録番号', '支払方法', '状態', 'メモ'];
  const cell = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = receipts.map((r) => [
    r.date, r.vendor, r.amount, r.businessRatio, businessAmount(r), categoryName(r.category),
    CATEGORY_MAP[r.category] ? CATEGORY_MAP[r.category].blueNo : '', TAX_LABEL[r.taxRate] || '', r.taxAmount ?? '',
    r.invoiceNo, PAY_LABEL[r.paymentMethod] || '', r.status === 'confirmed' ? '確定' : '未確認', r.memo
  ].map(cell).join(','));
  const csv = '﻿' + [head.join(','), ...rows].join('\r\n');
  return saveFile(new Blob([csv], { type: 'text/csv' }), `kakusapo-${year || 'all'}-${stamp()}.csv`);
}

export { PAY_LABEL, TAX_LABEL };
