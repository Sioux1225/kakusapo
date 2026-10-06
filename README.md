# 確サポ

軽貨物ドライバー（個人事業主）向けの、領収書・確定申告サポートアプリ（PWA）。
領収書を撮るだけで、経費の整理から確定申告の記入先まで分かることを目指す。

- 仕様：要件定義書（社内資料のためリポジトリには含めない）
- 費用：利用者・会社とも 0円（サーバーなし。データは各自のスマホの中だけに保存）

## 構成

ビルド作業は不要。ファイルをそのまま GitHub Pages に置けば動く。

| ファイル | 役割 |
|---|---|
| `index.html` / `css/app.css` | 画面の土台とデザイン（配色は要件定義書 10.1 の配色ルール） |
| `js/app.js` | 画面の切り替え、撮影から保存までの流れ |
| `js/ocr.js` | 端末内OCR（Tesseract.js）と画像の前処理 |
| `js/extract.js` | OCRの文字から日付・店名・金額・税率・消費税額・インボイス番号を取り出す |
| `js/categories.js` | 勘定科目マスタと科目の提案 |
| `js/db.js` | 端末内データベース（IndexedDB） |
| `js/backup.js` | バックアップ・復元・CSV書き出し |
| `sw.js` / `manifest.webmanifest` | オフライン対応・ホーム画面への追加 |

## 開発

```bash
node tools/serve.mjs
```

→ http://localhost:8765 をブラウザで開く。

```bash
npm test
```

→ 読み取りルール（`js/extract.js`）と科目提案のテスト。

## 公開（GitHub Pages）

1. このフォルダを GitHub の `kakusapo` リポジトリに push する
2. リポジトリの **Settings → Pages** で、Source を「Deploy from a branch」、Branch を `main` / `/(root)` にして保存
3. 数分後に `https://（アカウント名）.github.io/kakusapo/` で公開される

## 更新するとき

1. ファイルを修正する
2. `sw.js` の `VERSION` と `js/app.js` の `APP_VERSION` を上げる（例：0.1.0 → 0.1.1）
3. push する → 利用者は次回起動時に新しい版になる（データは消えない）
