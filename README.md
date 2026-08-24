# 競馬 期待値検証トラッカー v2

## v2 の主な変更
- スマホ文字サイズを拡大
- 手入力フォームを折りたたみ
- 「チャッピーの記録を読み込む」を最上部に追加
- ChatGPTが作ったJSONを既存データに追加・更新できる
- 同じ `id` の記録は上書きされるため、レース後の結果更新も可能
- 記録は従来どおりブラウザの localStorage に保存
- GitHubには記録データを自動送信しない
- JSONバックアップ / CSV分析出力あり

## GitHub Pages
`index.html` / `style.css` / `script.js` をリポジトリ直下に置いてください。

## チャッピー連携用JSON
以下のどれでも読み込めます。

### 1件
```json
{
  "record": {
    "id": "2026-08-30-niigata-11-win-7",
    "raceDate": "2026-08-30",
    "track": "新潟",
    "raceNo": 11,
    "decision": "購入",
    "betType": "単勝",
    "selection": "7",
    "predProb": 22.0,
    "oddsLow": 6.0,
    "evalOdds": 6.0,
    "stake": 200,
    "resultStatus": "未確定"
  }
}
```

### 複数件
```json
{
  "records": [
    { "...": "..." },
    { "...": "..." }
  ]
}
```

レース後は同じ `id` で `resultStatus`、`finalOddsLow`、`payoutPer100` などを入れたJSONを読み込めば更新されます。
