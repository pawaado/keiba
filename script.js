(() => {
  "use strict";

  const STORAGE_KEY = "keiba_ev_tracker_records_v1";
  const SETTINGS_KEY = "keiba_ev_tracker_settings_v1";

  const FACTORS = [
    "近走内容","能力指数","距離適性","コース適性","芝/ダート適性","馬場適性",
    "枠順","脚質/展開","騎手","斤量","馬体重","調教","血統","クラス",
    "休養間隔","トラックバイアス","人気/オッズの歪み","その他"
  ];

  const $ = (id) => document.getElementById(id);
  const fields = [
    "raceDate","track","raceNo","startTime","surface","distance","going","fieldSize","raceName","minutesBefore",
    "decision","betType","selection","popularity","predProb","oddsLow","oddsHigh","evalOdds","stake","confidence",
    "thresholdEv","modelName","analysisMemo","resultStatus","finalOddsLow","finalOddsHigh","payoutPer100","resultMemo"
  ];

  let records = loadJson(STORAGE_KEY, []);
  let settings = loadJson(SETTINGS_KEY, { monthlyBudget: 10000, modelVersion: "v1" });

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }
  function saveAll() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
  function n(v) {
    if (v === "" || v === null || v === undefined) return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  }
  function yen(v) {
    const x = Number(v || 0);
    return `${Math.round(x).toLocaleString("ja-JP")}円`;
  }
  function pct(v, digits=1) {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
    return `${Number(v).toFixed(digits)}%`;
  }
  function oddsText(low, high) {
    if (low == null) return "—";
    if (high != null && high !== low) return `${low.toFixed(1)}〜${high.toFixed(1)}`;
    return low.toFixed(1);
  }
  function getPredEv(rec) {
    if (rec.predProb == null || rec.evalOdds == null) return null;
    return rec.predProb * rec.evalOdds;
  }
  function getFairOdds(rec) {
    if (!rec.predProb || rec.predProb <= 0) return null;
    return 100 / rec.predProb;
  }
  function getMarketProb(rec) {
    if (!rec.evalOdds || rec.evalOdds <= 0) return null;
    return 100 / rec.evalOdds;
  }
  function getActualReturn(rec, useHypothetical100=false) {
    const payout = rec.payoutPer100 ?? 0;
    if (rec.resultStatus === "未確定") return null;
    if (useHypothetical100) return payout;
    const stake = rec.stake ?? 0;
    return (stake / 100) * payout;
  }
  function uuid() {
    return (crypto.randomUUID ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`);
  }

  function initFactors() {
    $("factorChecks").innerHTML = FACTORS.map((f, i) =>
      `<label class="factor-item"><input type="checkbox" value="${escapeHtml(f)}" id="factor_${i}"><span>${escapeHtml(f)}</span></label>`
    ).join("");
  }
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function initDefaults() {
    const today = new Date();
    $("raceDate").value = today.toISOString().slice(0,10);
    $("monthlyBudget").value = settings.monthlyBudget ?? 10000;
    $("modelVersion").value = settings.modelVersion ?? "v1";
    $("stake").value = "100";
    $("thresholdEv").value = "110";
    $("decision").value = "購入";
    $("resultStatus").value = "未確定";
  }

  function syncSettings() {
    settings.monthlyBudget = n($("monthlyBudget").value) ?? 0;
    settings.modelVersion = $("modelVersion").value.trim() || "v1";
    saveAll();
    renderAll();
  }

  function updatePreview() {
    const p = n($("predProb").value);
    const evalOdds = n($("evalOdds").value);
    const fair = p && p > 0 ? 100 / p : null;
    const ev = p != null && evalOdds != null ? p * evalOdds : null;
    const market = evalOdds && evalOdds > 0 ? 100 / evalOdds : null;
    const edge = p != null && market != null ? p - market : null;

    $("fairOddsPreview").textContent = fair ? `${fair.toFixed(2)}倍` : "—";
    $("evPreview").textContent = ev != null ? `${ev.toFixed(1)}%` : "—";
    $("edgePreview").textContent = edge != null ? `${edge >= 0 ? "+" : ""}${edge.toFixed(1)}pt` : "—";
    $("evPreview").className = ev == null ? "" : ev >= 100 ? "profit-positive" : "profit-negative";
  }

  function maybeFillEvalOdds() {
    const low = n($("oddsLow").value);
    const current = $("evalOdds").value;
    if (!current && low != null) $("evalOdds").value = low;
    updatePreview();
  }

  function getFormRecord() {
    const factors = [...document.querySelectorAll("#factorChecks input:checked")].map(x => x.value);
    const rec = {
      id: $("recordId").value || uuid(),
      createdAt: $("recordId").value ? undefined : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      modelVersion: settings.modelVersion || "v1",
      factors
    };

    const stringFields = new Set([
      "raceDate","track","startTime","surface","going","raceName","decision","betType","selection",
      "modelName","analysisMemo","resultStatus","resultMemo"
    ]);
    fields.forEach(id => {
      rec[id] = stringFields.has(id) ? $(id).value.trim() : n($(id).value);
    });

    const existing = records.find(r => r.id === rec.id);
    if (existing?.createdAt) rec.createdAt = existing.createdAt;
    return rec;
  }

  function validate(rec) {
    const errors = [];
    if (!rec.raceDate) errors.push("日付");
    if (!rec.track) errors.push("競馬場");
    if (!rec.raceNo) errors.push("R");
    if (!rec.betType) errors.push("券種");
    if (!rec.selection) errors.push("買い目");
    if (rec.predProb == null || rec.predProb < 0 || rec.predProb > 100) errors.push("推定的中確率");
    if (rec.oddsLow == null || rec.oddsLow < 1) errors.push("判断時オッズ");
    if (rec.evalOdds == null || rec.evalOdds < 1) errors.push("EV計算用オッズ");
    if (rec.decision === "購入" && (!rec.stake || rec.stake <= 0)) errors.push("購入額");
    if (rec.decision === "購入" && rec.stake % 100 !== 0) errors.push("購入額は100円単位");
    return errors;
  }

  function resetForm() {
    $("recordForm").reset();
    $("recordId").value = "";
    initDefaults();
    document.querySelectorAll("#factorChecks input").forEach(x => x.checked = false);
    $("saveBtn").textContent = "記録を保存";
    $("formError").textContent = "";
    updatePreview();
  }

  function fillForm(rec) {
    $("recordId").value = rec.id;
    fields.forEach(id => {
      const el = $(id);
      if (!el) return;
      el.value = rec[id] ?? "";
    });
    $("modelVersion").value = rec.modelVersion || settings.modelVersion || "v1";
    document.querySelectorAll("#factorChecks input").forEach(x => x.checked = (rec.factors || []).includes(x.value));
    $("saveBtn").textContent = "更新を保存";
    updatePreview();
    window.scrollTo({ top: $("recordForm").getBoundingClientRect().top + window.scrollY - 20, behavior: "smooth" });
  }

  function renderSummary() {
    const bought = records.filter(r => r.decision === "購入");
    const settledBought = bought.filter(r => r.resultStatus && r.resultStatus !== "未確定");
    const stake = bought.reduce((s,r) => s + (r.stake || 0), 0);
    const returns = settledBought.reduce((s,r) => s + (getActualReturn(r) || 0), 0);
    const hitCount = settledBought.filter(r => r.resultStatus === "的中").length;
    const avgEvVals = bought.map(getPredEv).filter(x => x != null);

    $("statBought").textContent = bought.length.toLocaleString("ja-JP");
    $("statStake").textContent = yen(stake);
    $("statReturn").textContent = yen(returns);
    const profit = returns - settledBought.reduce((s,r) => s + (r.stake || 0), 0);
    $("statProfit").textContent = yen(profit);
    $("statProfit").className = profit > 0 ? "profit-positive" : profit < 0 ? "profit-negative" : "";
    const settledStake = settledBought.reduce((s,r) => s + (r.stake || 0), 0);
    $("statRoi").textContent = settledStake > 0 ? pct(returns / settledStake * 100) : "—";
    $("statHitRate").textContent = settledBought.length ? pct(hitCount / settledBought.length * 100) : "—";
    $("statAvgEv").textContent = avgEvVals.length ? pct(avgEvVals.reduce((a,b)=>a+b,0)/avgEvVals.length) : "—";
    $("statCandidates").textContent = records.length.toLocaleString("ja-JP");

    renderBudget();
  }

  function renderBudget() {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const monthRecords = records.filter(r => r.decision === "購入" && String(r.raceDate || "").startsWith(ym));
    const used = monthRecords.reduce((s,r)=>s+(r.stake||0),0);
    const budget = settings.monthlyBudget || 0;
    $("budgetMonthLabel").textContent = `${now.getFullYear()}年${now.getMonth()+1}月`;
    $("budgetText").textContent = `${used.toLocaleString("ja-JP")} / ${budget.toLocaleString("ja-JP")}円`;
    const ratio = budget > 0 ? Math.min(100, used / budget * 100) : 0;
    $("budgetBarFill").style.width = `${ratio}%`;
    $("budgetBarFill").style.background = used > budget ? "#b91c1c" : "#0f766e";
  }

  function groupStats(list, keyFn) {
    const map = new Map();
    for (const r of list) {
      const key = keyFn(r);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return [...map.entries()];
  }

  function renderBreakdownTable(tableId, groups) {
    const table = $(tableId);
    table.innerHTML = `
      <thead><tr><th>区分</th><th>件数</th><th>確定件数</th><th>的中率</th><th>平均予測EV</th><th>投資額</th><th>払戻</th><th>実回収率</th></tr></thead>
      <tbody>${
        groups.map(([key, arr]) => {
          const bought = arr.filter(r=>r.decision==="購入");
          const settled = bought.filter(r=>r.resultStatus!=="未確定");
          const hits = settled.filter(r=>r.resultStatus==="的中").length;
          const evs = arr.map(getPredEv).filter(v=>v!=null);
          const stake = settled.reduce((s,r)=>s+(r.stake||0),0);
          const ret = settled.reduce((s,r)=>s+(getActualReturn(r)||0),0);
          return `<tr>
            <td><strong>${escapeHtml(key)}</strong></td>
            <td>${arr.length}</td>
            <td>${settled.length}</td>
            <td>${settled.length ? pct(hits/settled.length*100) : "—"}</td>
            <td>${evs.length ? pct(evs.reduce((a,b)=>a+b,0)/evs.length) : "—"}</td>
            <td>${yen(stake)}</td><td>${yen(ret)}</td>
            <td>${stake ? pct(ret/stake*100) : "—"}</td>
          </tr>`;
        }).join("")
      }</tbody>`;
  }

  function evBand(ev) {
    if (ev == null) return "EV不明";
    if (ev < 100) return "<100%";
    if (ev < 110) return "100〜109.9%";
    if (ev < 120) return "110〜119.9%";
    if (ev < 130) return "120〜129.9%";
    return "130%以上";
  }

  function renderCalibration() {
    const settled = records.filter(r => r.resultStatus === "的中" || r.resultStatus === "不的中");
    const bins = [
      [0,10],[10,20],[20,30],[30,40],[40,50],[50,60],[60,70],[70,80],[80,90],[90,101]
    ];
    const rows = bins.map(([lo,hi]) => {
      const arr = settled.filter(r => r.predProb != null && r.predProb >= lo && r.predProb < hi);
      if (!arr.length) return null;
      const avgPred = arr.reduce((s,r)=>s+r.predProb,0)/arr.length;
      const hitRate = arr.filter(r=>r.resultStatus==="的中").length/arr.length*100;
      return { label: hi===101 ? "90〜100%" : `${lo}〜${hi-0.1}%`, n: arr.length, avgPred, hitRate, gap: hitRate-avgPred };
    }).filter(Boolean);

    $("calibrationTable").innerHTML = `
      <thead><tr><th>予測確率帯</th><th>件数</th><th>平均予測確率</th><th>実際の的中率</th><th>差</th></tr></thead>
      <tbody>${rows.length ? rows.map(r=>`<tr>
        <td>${r.label}</td><td>${r.n}</td><td>${pct(r.avgPred)}</td><td>${pct(r.hitRate)}</td>
        <td class="${r.gap>=0?"profit-positive":"profit-negative"}">${r.gap>=0?"+":""}${r.gap.toFixed(1)}pt</td>
      </tr>`).join("") : `<tr><td colspan="5">結果確定データがまだありません。</td></tr>`}</tbody>`;
  }

  function renderAnalysis() {
    const byType = groupStats(records, r => r.betType || "不明").sort((a,b)=>a[0].localeCompare(b[0],"ja"));
    renderBreakdownTable("byBetTypeTable", byType.length ? byType : [["データなし",[]]]);

    const order = {"<100%":0,"100〜109.9%":1,"110〜119.9%":2,"120〜129.9%":3,"130%以上":4,"EV不明":5};
    const byEv = groupStats(records, r => evBand(getPredEv(r))).sort((a,b)=>order[a[0]]-order[b[0]]);
    renderBreakdownTable("byEvBandTable", byEv.length ? byEv : [["データなし",[]]]);
    renderCalibration();
  }

  function populateFilterBetType() {
    const current = $("filterBetType").value;
    const types = [...new Set(records.map(r=>r.betType).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ja"));
    $("filterBetType").innerHTML = `<option value="">券種：すべて</option>` + types.map(x=>`<option>${escapeHtml(x)}</option>`).join("");
    $("filterBetType").value = types.includes(current) ? current : "";
  }

  function filteredRecords() {
    const q = $("searchText").value.trim().toLowerCase();
    const dec = $("filterDecision").value;
    const type = $("filterBetType").value;
    const result = $("filterResult").value;
    return records.filter(r => {
      const hay = [r.track,r.raceName,r.selection,r.analysisMemo,r.resultMemo,(r.factors||[]).join(" ")].join(" ").toLowerCase();
      return (!q || hay.includes(q)) && (!dec || r.decision===dec) && (!type || r.betType===type) && (!result || r.resultStatus===result);
    }).sort((a,b) => {
      const da = `${a.raceDate||""} ${String(a.raceNo||0).padStart(2,"0")}`;
      const db = `${b.raceDate||""} ${String(b.raceNo||0).padStart(2,"0")}`;
      return db.localeCompare(da);
    });
  }

  function renderRecords() {
    populateFilterBetType();
    const arr = filteredRecords();
    $("emptyMessage").style.display = arr.length ? "none" : "block";
    $("recordsTable").innerHTML = `
      <thead><tr>
        <th>日付</th><th>レース</th><th>判断</th><th>券種</th><th>買い目</th><th>推定確率</th>
        <th>判断時オッズ</th><th>EV</th><th>最終オッズ</th><th>結果</th><th>購入額</th><th>払戻</th>
        <th>人気</th><th>要因</th><th>分析ver</th><th>操作</th>
      </tr></thead>
      <tbody>${arr.map(r => {
        const ev = getPredEv(r);
        const ret = r.decision==="購入" && r.resultStatus!=="未確定" ? getActualReturn(r) : null;
        const resultBadge = r.resultStatus==="的中" ? "badge-hit" : r.resultStatus==="不的中" ? "badge-miss" : "badge-pending";
        return `<tr>
          <td>${escapeHtml(r.raceDate||"")}</td>
          <td>${escapeHtml(r.track||"")} ${r.raceNo||""}R<br><small>${escapeHtml(r.raceName||"")}</small></td>
          <td><span class="badge ${r.decision==="購入"?"badge-buy":"badge-skip"}">${escapeHtml(r.decision||"")}</span></td>
          <td>${escapeHtml(r.betType||"")}</td><td><strong>${escapeHtml(r.selection||"")}</strong></td>
          <td>${pct(r.predProb)}</td><td>${oddsText(r.oddsLow,r.oddsHigh)}</td>
          <td class="${ev!=null&&ev>=100?"profit-positive":ev!=null?"profit-negative":""}">${pct(ev)}</td>
          <td>${oddsText(r.finalOddsLow,r.finalOddsHigh)}</td>
          <td><span class="badge ${resultBadge}">${escapeHtml(r.resultStatus||"未確定")}</span></td>
          <td>${r.decision==="購入"?yen(r.stake||0):"—"}</td>
          <td>${ret==null?"—":yen(ret)}</td>
          <td>${r.popularity?`${r.popularity}人気`:"—"}</td>
          <td title="${escapeHtml((r.factors||[]).join(" / "))}">${escapeHtml((r.factors||[]).slice(0,3).join("・"))}${(r.factors||[]).length>3?"…":""}</td>
          <td>${escapeHtml(r.modelVersion||"")}</td>
          <td><div class="row-actions"><button class="mini-btn" data-edit="${r.id}">編集</button><button class="mini-btn delete" data-delete="${r.id}">削除</button></div></td>
        </tr>`;
      }).join("")}</tbody>`;
  }

  function renderAll() {
    renderSummary();
    renderAnalysis();
    renderRecords();
  }

  function runSimulation() {
    const threshold = n($("simEvThreshold").value) ?? 110;
    const eligible = records.filter(r => {
      const ev = getPredEv(r);
      return ev != null && ev >= threshold && r.resultStatus !== "未確定" && (r.resultStatus === "不的中" || r.payoutPer100 != null);
    });
    if (!eligible.length) {
      $("simulationResult").textContent = `EV ${threshold}%以上で、結果と公式払戻が入力済みの候補がありません。`;
      return;
    }
    const stake = eligible.length * 100;
    const ret = eligible.reduce((s,r)=>s+(r.payoutPer100||0),0);
    const hits = eligible.filter(r=>r.resultStatus==="的中").length;
    $("simulationResult").innerHTML = `
      <strong>EV ${threshold}%以上を各100円：</strong>
      ${eligible.length}件 / 投資 ${yen(stake)} / 払戻 ${yen(ret)} /
      <span class="${ret>=stake?"profit-positive":"profit-negative"}">回収率 ${pct(ret/stake*100)}</span> /
      的中率 ${pct(hits/eligible.length*100)}
    `;
  }

  function download(filename, text, type) {
    const blob = new Blob([text], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 500);
  }

  function exportJson() {
    const payload = {
      app: "keiba-ev-tracker",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      records
    };
    download(`keiba_ev_backup_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload,null,2), "application/json");
  }

  const CSV_FIELDS = [
    ["id","ID"],["raceDate","日付"],["track","競馬場"],["raceNo","R"],["startTime","発走時刻"],["surface","芝ダ等"],
    ["distance","距離m"],["going","馬場"],["fieldSize","頭数"],["raceName","レース名クラス"],["minutesBefore","予想何分前"],
    ["decision","判断"],["betType","券種"],["selection","買い目"],["popularity","人気"],["predProb","推定的中確率%"],
    ["oddsLow","判断時オッズ下限"],["oddsHigh","判断時オッズ上限"],["evalOdds","EV計算用オッズ"],["predEv","予測EV%"],
    ["fairOdds","適正オッズ"],["stake","購入額"],["confidence","信頼度"],["thresholdEv","最低購入EV"],["modelName","予想モデル"],
    ["modelVersion","分析ver"],["factors","重視要因"],["analysisMemo","分析メモ"],["resultStatus","結果"],
    ["finalOddsLow","最終オッズ下限"],["finalOddsHigh","最終オッズ上限"],["payoutPer100","公式払戻100円あたり"],
    ["actualReturn","実払戻額"],["resultMemo","結果メモ"],["createdAt","作成日時"],["updatedAt","更新日時"]
  ];

  function csvEscape(v) {
    const s = String(v ?? "");
    return `"${s.replace(/"/g,'""')}"`;
  }
  function exportCsv() {
    const head = CSV_FIELDS.map(x=>csvEscape(x[1])).join(",");
    const lines = records.map(r => CSV_FIELDS.map(([key]) => {
      let v = r[key];
      if (key==="predEv") v = getPredEv(r);
      else if (key==="fairOdds") v = getFairOdds(r);
      else if (key==="actualReturn") v = r.decision==="購入" ? getActualReturn(r) : "";
      else if (key==="factors") v = (r.factors||[]).join("|");
      return csvEscape(v);
    }).join(","));
    download(`keiba_ev_records_${new Date().toISOString().slice(0,10)}.csv`, "\ufeff"+[head,...lines].join("\r\n"), "text/csv;charset=utf-8");
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const imported = Array.isArray(data) ? data : data.records;
        if (!Array.isArray(imported)) throw new Error("recordsがありません");
        if (!confirm(`${imported.length}件の記録を読み込み、現在のデータと置き換えますか？`)) return;
        records = imported;
        if (data.settings) settings = {...settings, ...data.settings};
        saveAll();
        $("monthlyBudget").value = settings.monthlyBudget ?? 10000;
        $("modelVersion").value = settings.modelVersion ?? "v1";
        renderAll();
        alert("読み込みました。");
      } catch (e) {
        alert("JSONを読み込めませんでした。バックアップファイルを確認してください。");
      }
    };
    reader.readAsText(file);
  }

  $("recordForm").addEventListener("submit", e => {
    e.preventDefault();
    settings.modelVersion = $("modelVersion").value.trim() || "v1";
    const rec = getFormRecord();
    rec.modelVersion = settings.modelVersion;
    const errors = validate(rec);
    if (errors.length) {
      $("formError").textContent = `入力を確認してください：${errors.join("、")}`;
      return;
    }
    const idx = records.findIndex(r=>r.id===rec.id);
    if (idx >= 0) records[idx] = rec; else records.push(rec);
    saveAll();
    resetForm();
    renderAll();
  });

  $("clearFormBtn").addEventListener("click", resetForm);
  $("monthlyBudget").addEventListener("change", syncSettings);
  $("modelVersion").addEventListener("change", syncSettings);
  ["predProb","evalOdds"].forEach(id => $(id).addEventListener("input", updatePreview));
  $("oddsLow").addEventListener("input", maybeFillEvalOdds);
  $("decision").addEventListener("change", () => {
    if ($("decision").value === "見送り" && n($("stake").value) === 100) $("stake").value = "0";
    if ($("decision").value === "購入" && (!n($("stake").value))) $("stake").value = "100";
  });

  ["searchText","filterDecision","filterBetType","filterResult"].forEach(id => $(id).addEventListener("input", renderRecords));

  $("recordsTable").addEventListener("click", e => {
    const edit = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-delete]");
    if (edit) {
      const rec = records.find(r=>r.id===edit.dataset.edit);
      if (rec) fillForm(rec);
    }
    if (del) {
      const rec = records.find(r=>r.id===del.dataset.delete);
      if (rec && confirm(`${rec.raceDate} ${rec.track} ${rec.raceNo}R ${rec.betType} ${rec.selection} を削除しますか？`)) {
        records = records.filter(r=>r.id!==rec.id);
        saveAll(); renderAll();
      }
    }
  });

  $("runSimulationBtn").addEventListener("click", runSimulation);
  $("exportJsonBtn").addEventListener("click", exportJson);
  $("exportCsvBtn").addEventListener("click", exportCsv);
  $("importJsonInput").addEventListener("change", e => {
    if (e.target.files?.[0]) importJson(e.target.files[0]);
    e.target.value = "";
  });
  $("deleteAllBtn").addEventListener("click", () => {
    if (!records.length) return;
    if (confirm("全記録を削除します。元に戻せません。バックアップ済みですか？")) {
      records = []; saveAll(); renderAll(); resetForm();
    }
  });

  initFactors();
  initDefaults();
  updatePreview();
  renderAll();
})();
