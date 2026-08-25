# Pocket Money Tracker v3.1

競馬と株の「仮想運用」を同じ画面で記録・検証するGitHub Pages向けの静的アプリです。

## 主な機能
- 上部タブで「競馬 / 株」を切替
- 競馬：EV、的中率、回収率、券種別、EV帯別、確率校正、しきい値シミュレーション
- 株：仮想買値、目標株価、損切り、リスクリワード、決済、勝率、損益率、累計損益
- チャッピーJSONを読み込んで追加・更新
- 競馬＋株の一括JSONバックアップ
- 競馬CSV / 株CSVを個別出力
- 競馬データは旧v2と同じ localStorage キーを使うため、同じブラウザなら既存データを引き継ぎます

## GitHub Pages
`index.html` / `style.css` / `script.js` を `pocket-money` リポジトリ直下に置いてください。

## 週1回のチャッピー連携JSON例
```json
{
  "keibaRecords": [
    {
      "id": "2026-08-30-niigata-11-win-7",
      "raceDate": "2026-08-30",
      "track": "新潟",
      "raceNo": 11,
      "betType": "単勝",
      "selection": "7",
      "predProb": 22.0,
      "evalOdds": 6.0,
      "stake": 100,
      "resultStatus": "未確定"
    }
  ],
  "stockRecords": [
    {
      "id": "2026-08-25-7203",
      "name": "サンプル自動車",
      "code": "7203",
      "entryDate": "2026-08-25",
      "status": "保有中",
      "entryPrice": 2500,
      "virtualAmount": 10000,
      "targetPrice": 2700,
      "stopLoss": 2420,
      "holdDays": 10,
      "thesis": "サンプル記録"
    }
  ]
}
```

同じ `id` で後から結果・決済情報を読み込むと、その記録が更新されます。


## v3.1
- iPhone表示で文字サイズを全体的に拡大
- 表・ボタン・入力欄・集計カードも読みやすく調整
- 横幅のはみ出しを抑える調整を追加
