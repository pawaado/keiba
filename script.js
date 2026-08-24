(() => {
  "use strict";

  const STORAGE_KEY = "keiba_ev_tracker_records_v1";
  const SETTINGS_KEY = "keiba_ev_tracker_settings_v1";

  const FACTORS = [
    "近走内容","能力指数","距離適性","コース適性","芝/ダート適性","馬場適性",
    "枠順","脚質/展開","騎手","斤量","馬体重","調教","血統","クラス",
    "休養間隔","トラックバイアス","人気/オッズの歪み","その他"
  ];

  const $ = id => document.getElementById(id);
  const fields = [
    "raceDate","track","raceNo","startTime","surface","distance","going","fieldSize","raceName","minutesBefore",
    "decision","betType","selection","popularity","predProb","oddsLow","oddsHigh","evalOdds","stake","confidence",
    "thresholdEv","modelName","analysisMemo","resultStatus","finalOddsLow","finalOddsHigh","payoutPer100","resultMemo"
  ];

  let records = loadJson(STORAGE_KEY, []);
  let settings = loadJson(SETTINGS_KEY, { monthlyBudget: 10000, modelVersion: "v2" });

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
  function yen(v) { return `${Math.round(Number(v || 0)).toLocaleString("ja-JP")}円`; }
  function pct(v, d=1) { return v == null || !Number.isFinite(Number(v)) ? "—" : `${Number(v).toFixed(d)}%`; }
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function oddsText(low, high) {
    if (low == null) return "—";
    if (high != null && Number(high) !== Number(low)) return `${Number(low).toFixed(1)}〜${Number(high).toFixed(1)}`;
    return Number(low).toFixed(1);
  }
  function getPredEv(r) { return r.predProb != null && r.evalOdds != null ? Number(r.predProb) * Number(r.evalOdds) : null; }
  function getFairOdds(r) { return r.predProb > 0 ? 100 / Number(r.predProb) : null; }
  function getActualReturn(r) {
    if (r.resultStatus === "未確定" || r.resultStatus == null) return null;
    return ((Number(r.stake) || 0) / 100) * (Number(r.payoutPer100) || 0);
  }
  function uuid() { return crypto.randomUUID ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`; }

  function stableId(r) {
    if (r.id) return String(r.id);
    const raw = [r.raceDate,r.track,r.raceNo,r.betType,r.selection].map(x => String(x ?? "").trim()).join("|");
    let hash = 2166136261;
    for (let i=0; i<raw.length; i++) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `chappy_${(hash >>> 0).toString(16)}`;
  }

  function normalizeRecord(src) {
    const r = {...src};
    r.id = stableId(r);
    if (!r.createdAt) r.createdAt = new Date().toISOString();
    r.updatedAt = new Date().toISOString();
    r.modelVersion = r.modelVersion || settings.modelVersion || "v2";
    r.modelName = r.modelName || "ChatGPT";
    r.decision = r.decision || "見送り";
    r.resultStatus = r.resultStatus || "未確定";
    r.factors = Array.isArray(r.factors) ? r.factors : [];
    const numeric = ["raceNo","distance","fieldSize","minutesBefore","popularity","predProb","oddsLow","oddsHigh","evalOdds","stake","confidence","thresholdEv","finalOddsLow","finalOddsHigh","payoutPer100"];
    numeric.forEach(k => { if (r[k] !== "" && r[k] != null) r[k] = Number(r[k]); else r[k] = null; });
    if (r.stake == null) r.stake = r.decision === "購入" ? 100 : 0;
    if (r.thresholdEv == null) r.thresholdEv = 110;
    return r;
  }

  function upsertImported(imported) {
    let added = 0, updated = 0;
    for (const raw of imported) {
      const incoming = normalizeRecord(raw);
      const idx = records.findIndex(r => r.id === incoming.id);
      if (idx >= 0) {
        records[idx] = {...records[idx], ...incoming, createdAt: records[idx].createdAt || incoming.createdAt};
        updated++;
      } else {
        records.push(incoming);
        added++;
      }
    }
    saveAll();
    return {added, updated};
  }

  function initFactors() {
    $("factorChecks").innerHTML = FACTORS.map((f,i) =>
      `<label class="factor-item"><input type="checkbox" value="${escapeHtml(f)}" id="factor_${i}"><span>${escapeHtml(f)}</span></label>`
    ).join("");
  }

  function initDefaults() {
    const today = new Date();
    $("raceDate").value = today.toISOString().slice(0,10);
    $("monthlyBudget").value = settings.monthlyBudget ?? 10000;
    $("modelVersion").value = settings.modelVersion ?? "v2";
    $("stake").value = "100";
    $("thresholdEv").value = "110";
    $("decision").value = "購入";
    $("resultStatus").value = "未確定";
  }

  function syncSettings() {
    settings.monthlyBudget = n($("monthlyBudget").value) ?? 0;
    settings.modelVersion = $("modelVersion").value.trim() || "v2";
    saveAll();
    renderAll();
  }

  function updatePreview() {
    const p = n($("predProb").value), o = n($("evalOdds").value);
    const fair = p > 0 ? 100 / p : null;
    const ev = p != null && o != null ? p * o : null;
    const market = o > 0 ? 100 / o : null;
    const edge = p != null && market != null ? p - market : null;
    $("fairOddsPreview").textContent = fair ? `${fair.toFixed(2)}倍` : "—";
    $("evPreview").textContent = ev != null ? `${ev.toFixed(1)}%` : "—";
    $("edgePreview").textContent = edge != null ? `${edge>=0?"+":""}${edge.toFixed(1)}pt` : "—";
    $("evPreview").className = ev == null ? "" : ev >= 100 ? "profit-positive" : "profit-negative";
  }

  function getFormRecord() {
    const factors = [...document.querySelectorAll("#factorChecks input:checked")].map(x=>x.value);
    const rec = {id:$("recordId").value || uuid(), factors, modelVersion:settings.modelVersion || "v2", updatedAt:new Date().toISOString()};
    const strings = new Set(["raceDate","track","startTime","surface","going","raceName","decision","betType","selection","modelName","analysisMemo","resultStatus","resultMemo"]);
    fields.forEach(id => rec[id] = strings.has(id) ? $(id).value.trim() : n($(id).value));
    const existing = records.find(r=>r.id===rec.id);
    rec.createdAt = existing?.createdAt || new Date().toISOString();
    return rec;
  }

  function validate(rec) {
    const e = [];
    if (!rec.raceDate) e.push("日付");
    if (!rec.track) e.push("競馬場");
    if (!rec.raceNo) e.push("R");
    if (!rec.betType) e.push("券種");
    if (!rec.selection) e.push("買い目");
    if (rec.predProb == null || rec.predProb < 0 || rec.predProb > 100) e.push("推定的中確率");
    if (rec.oddsLow == null || rec.oddsLow < 1) e.push("判断時オッズ");
    if (rec.evalOdds == null || rec.evalOdds < 1) e.push("EV計算用オッズ");
    if (rec.decision==="購入" && (!rec.stake || rec.stake <= 0)) e.push("購入額");
    return e;
  }

  function resetForm() {
    $("recordForm").reset();
    $("recordId").value = "";
    initDefaults();
    document.querySelectorAll("#factorChecks input").forEach(x=>x.checked=false);
    $("saveBtn").textContent = "記録を保存";
    $("formError").textContent = "";
    updatePreview();
  }

  function fillForm(rec) {
    $("manualDetails").open = true;
    $("recordId").value = rec.id;
    fields.forEach(id => { if ($(id)) $(id).value = rec[id] ?? ""; });
    $("modelVersion").value = rec.modelVersion || settings.modelVersion || "v2";
    document.querySelectorAll("#factorChecks input").forEach(x=>x.checked=(rec.factors||[]).includes(x.value));
    $("saveBtn").textContent = "更新を保存";
    updatePreview();
    $("manualDetails").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function renderSummary() {
    const bought = records.filter(r=>r.decision==="購入");
    const settled = bought.filter(r=>r.resultStatus && r.resultStatus!=="未確定");
    const allStake = bought.reduce((s,r)=>s+(Number(r.stake)||0),0);
    const settledStake = settled.reduce((s,r)=>s+(Number(r.stake)||0),0);
    const ret = settled.reduce((s,r)=>s+(getActualReturn(r)||0),0);
    const hits = settled.filter(r=>r.resultStatus==="的中").length;
    const evs = bought.map(getPredEv).filter(v=>v!=null);
    const profit = ret - settledStake;

    $("statBought").textContent = bought.length;
    $("statStake").textContent = yen(allStake);
    $("statReturn").textContent = yen(ret);
    $("statProfit").textContent = yen(profit);
    $("statProfit").className = profit>0 ? "profit-positive" : profit<0 ? "profit-negative" : "";
    $("statRoi").textContent = settledStake ? pct(ret/settledStake*100) : "—";
    $("statHitRate").textContent = settled.length ? pct(hits/settled.length*100) : "—";
    $("statAvgEv").textContent = evs.length ? pct(evs.reduce((a,b)=>a+b,0)/evs.length) : "—";
    $("statCandidates").textContent = records.length;
    renderBudget();
  }

  function renderBudget() {
    const d = new Date(), ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const used = records.filter(r=>r.decision==="購入" && String(r.raceDate||"").startsWith(ym)).reduce((s,r)=>s+(Number(r.stake)||0),0);
    const budget = Number(settings.monthlyBudget)||0;
    $("budgetMonthLabel").textContent = `${d.getFullYear()}年${d.getMonth()+1}月`;
    $("budgetText").textContent = `${used.toLocaleString("ja-JP")} / ${budget.toLocaleString("ja-JP")}円`;
    $("budgetBarFill").style.width = `${budget ? Math.min(100,used/budget*100) : 0}%`;
    $("budgetBarFill").style.background = used>budget ? "#b91c1c" : "#0f766e";
  }

  function groupStats(list,keyFn) {
    const m = new Map();
    list.forEach(r=>{const k=keyFn(r); if(!m.has(k))m.set(k,[]); m.get(k).push(r);});
    return [...m.entries()];
  }

  function renderBreakdownTable(id, groups) {
    $(id).innerHTML = `<thead><tr><th>区分</th><th>件数</th><th>確定</th><th>的中率</th><th>平均EV</th><th>投資</th><th>払戻</th><th>回収率</th></tr></thead><tbody>${
      groups.map(([key,arr])=>{
        const bought = arr.filter(r=>r.decision==="購入");
        const settled = bought.filter(r=>r.resultStatus!=="未確定");
        const hits = settled.filter(r=>r.resultStatus==="的中").length;
        const evs = arr.map(getPredEv).filter(v=>v!=null);
        const stake = settled.reduce((s,r)=>s+(Number(r.stake)||0),0);
        const ret = settled.reduce((s,r)=>s+(getActualReturn(r)||0),0);
        return `<tr><td><strong>${escapeHtml(key)}</strong></td><td>${arr.length}</td><td>${settled.length}</td><td>${settled.length?pct(hits/settled.length*100):"—"}</td><td>${evs.length?pct(evs.reduce((a,b)=>a+b,0)/evs.length):"—"}</td><td>${yen(stake)}</td><td>${yen(ret)}</td><td>${stake?pct(ret/stake*100):"—"}</td></tr>`;
      }).join("")
    }</tbody>`;
  }

  function evBand(ev) {
    if (ev==null) return "EV不明";
    if (ev<100) return "<100%";
    if (ev<110) return "100〜109.9%";
    if (ev<120) return "110〜119.9%";
    if (ev<130) return "120〜129.9%";
    return "130%以上";
  }

  function renderCalibration() {
    const settled = records.filter(r=>r.resultStatus==="的中" || r.resultStatus==="不的中");
    const bins = [[0,10],[10,20],[20,30],[30,40],[40,50],[50,60],[60,70],[70,80],[80,90],[90,101]];
    const rows = bins.map(([lo,hi])=>{
      const arr = settled.filter(r=>r.predProb!=null && r.predProb>=lo && r.predProb<hi);
      if(!arr.length)return null;
      const avg = arr.reduce((s,r)=>s+Number(r.predProb),0)/arr.length;
      const hit = arr.filter(r=>r.resultStatus==="的中").length/arr.length*100;
      return {label:hi===101?"90〜100%":`${lo}〜${hi-0.1}%`,n:arr.length,avg,hit,gap:hit-avg};
    }).filter(Boolean);
    $("calibrationTable").innerHTML = `<thead><tr><th>予測確率帯</th><th>件数</th><th>平均予測</th><th>実的中率</th><th>差</th></tr></thead><tbody>${
      rows.length ? rows.map(r=>`<tr><td>${r.label}</td><td>${r.n}</td><td>${pct(r.avg)}</td><td>${pct(r.hit)}</td><td class="${r.gap>=0?"profit-positive":"profit-negative"}">${r.gap>=0?"+":""}${r.gap.toFixed(1)}pt</td></tr>`).join("") : `<tr><td colspan="5">結果確定データがまだありません。</td></tr>`
    }</tbody>`;
  }

  function renderAnalysis() {
    const byType = groupStats(records,r=>r.betType||"不明").sort((a,b)=>a[0].localeCompare(b[0],"ja"));
    renderBreakdownTable("byBetTypeTable", byType.length?byType:[["データなし",[]]]);
    const order={"<100%":0,"100〜109.9%":1,"110〜119.9%":2,"120〜129.9%":3,"130%以上":4,"EV不明":5};
    const byEv = groupStats(records,r=>evBand(getPredEv(r))).sort((a,b)=>order[a[0]]-order[b[0]]);
    renderBreakdownTable("byEvBandTable", byEv.length?byEv:[["データなし",[]]]);
    renderCalibration();
  }

  function populateFilterBetType() {
    const cur=$("filterBetType").value;
    const types=[...new Set(records.map(r=>r.betType).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ja"));
    $("filterBetType").innerHTML='<option value="">券種：すべて</option>'+types.map(x=>`<option>${escapeHtml(x)}</option>`).join("");
    $("filterBetType").value=types.includes(cur)?cur:"";
  }

  function filteredRecords() {
    const q=$("searchText").value.trim().toLowerCase(), dec=$("filterDecision").value, type=$("filterBetType").value, result=$("filterResult").value;
    return records.filter(r=>{
      const hay=[r.track,r.raceName,r.selection,r.analysisMemo,r.resultMemo,(r.factors||[]).join(" ")].join(" ").toLowerCase();
      return (!q||hay.includes(q))&&(!dec||r.decision===dec)&&(!type||r.betType===type)&&(!result||r.resultStatus===result);
    }).sort((a,b)=>`${b.raceDate||""}${String(b.raceNo||0).padStart(2,"0")}`.localeCompare(`${a.raceDate||""}${String(a.raceNo||0).padStart(2,"0")}`));
  }

  function renderRecords() {
    populateFilterBetType();
    const arr=filteredRecords();
    $("emptyMessage").style.display=arr.length?"none":"block";
    $("recordsTable").innerHTML=`<thead><tr><th>日付</th><th>レース</th><th>判断</th><th>券種</th><th>買い目</th><th>推定確率</th><th>判断時オッズ</th><th>EV</th><th>最終オッズ</th><th>結果</th><th>購入額</th><th>払戻</th><th>人気</th><th>分析ver</th><th>操作</th></tr></thead><tbody>${
      arr.map(r=>{
        const ev=getPredEv(r), ret=r.decision==="購入"&&r.resultStatus!=="未確定"?getActualReturn(r):null;
        const rb=r.resultStatus==="的中"?"badge-hit":r.resultStatus==="不的中"?"badge-miss":"badge-pending";
        return `<tr>
          <td>${escapeHtml(r.raceDate||"")}</td>
          <td>${escapeHtml(r.track||"")} ${r.raceNo||""}R<br><small>${escapeHtml(r.raceName||"")}</small></td>
          <td><span class="badge ${r.decision==="購入"?"badge-buy":"badge-skip"}">${escapeHtml(r.decision||"")}</span></td>
          <td>${escapeHtml(r.betType||"")}</td><td><strong>${escapeHtml(r.selection||"")}</strong></td>
          <td>${pct(r.predProb)}</td><td>${oddsText(r.oddsLow,r.oddsHigh)}</td>
          <td class="${ev!=null&&ev>=100?"profit-positive":ev!=null?"profit-negative":""}">${pct(ev)}</td>
          <td>${oddsText(r.finalOddsLow,r.finalOddsHigh)}</td><td><span class="badge ${rb}">${escapeHtml(r.resultStatus||"未確定")}</span></td>
          <td>${r.decision==="購入"?yen(r.stake||0):"—"}</td><td>${ret==null?"—":yen(ret)}</td><td>${r.popularity?`${r.popularity}人気`:"—"}</td>
          <td>${escapeHtml(r.modelVersion||"")}</td>
          <td><div class="row-actions"><button class="mini-btn" data-edit="${r.id}">編集</button><button class="mini-btn delete" data-delete="${r.id}">削除</button></div></td>
        </tr>`;
      }).join("")
    }</tbody>`;
  }

  function renderAll(){renderSummary();renderAnalysis();renderRecords();}

  function runSimulation(){
    const t=n($("simEvThreshold").value)??110;
    const eligible=records.filter(r=>{const ev=getPredEv(r);return ev!=null&&ev>=t&&r.resultStatus!=="未確定"&&r.payoutPer100!=null;});
    if(!eligible.length){$("simulationResult").textContent=`EV ${t}%以上で結果・払戻入力済みの候補がありません。`;return;}
    const stake=eligible.length*100,ret=eligible.reduce((s,r)=>s+(Number(r.payoutPer100)||0),0),hits=eligible.filter(r=>r.resultStatus==="的中").length;
    $("simulationResult").innerHTML=`<strong>EV ${t}%以上を各100円：</strong> ${eligible.length}件 / 投資 ${yen(stake)} / 払戻 ${yen(ret)} / <span class="${ret>=stake?"profit-positive":"profit-negative"}">回収率 ${pct(ret/stake*100)}</span> / 的中率 ${pct(hits/eligible.length*100)}`;
  }

  function download(filename,text,type){
    const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
  }

  function exportJson(){
    const payload={app:"keiba-ev-tracker",version:2,exportedAt:new Date().toISOString(),settings,records};
    download(`keiba_ev_backup_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(payload,null,2),"application/json");
  }

  const CSV_FIELDS=[
    ["id","ID"],["raceDate","日付"],["track","競馬場"],["raceNo","R"],["startTime","発走時刻"],["surface","芝ダ等"],["distance","距離m"],["going","馬場"],["fieldSize","頭数"],["raceName","レース名クラス"],["minutesBefore","予想何分前"],["decision","判断"],["betType","券種"],["selection","買い目"],["popularity","人気"],["predProb","推定的中確率%"],["oddsLow","判断時オッズ下限"],["oddsHigh","判断時オッズ上限"],["evalOdds","EV計算用オッズ"],["predEv","予測EV%"],["fairOdds","適正オッズ"],["stake","購入額"],["confidence","信頼度"],["thresholdEv","最低購入EV"],["modelName","予想モデル"],["modelVersion","分析ver"],["factors","重視要因"],["analysisMemo","分析メモ"],["resultStatus","結果"],["finalOddsLow","最終オッズ下限"],["finalOddsHigh","最終オッズ上限"],["payoutPer100","公式払戻100円あたり"],["actualReturn","実払戻額"],["resultMemo","結果メモ"],["createdAt","作成日時"],["updatedAt","更新日時"]
  ];
  function csvEscape(v){return `"${String(v??"").replace(/"/g,'""')}"`;}
  function exportCsv(){
    const head=CSV_FIELDS.map(x=>csvEscape(x[1])).join(",");
    const lines=records.map(r=>CSV_FIELDS.map(([k])=>{
      let v=r[k];
      if(k==="predEv")v=getPredEv(r);else if(k==="fairOdds")v=getFairOdds(r);else if(k==="actualReturn")v=r.decision==="購入"?getActualReturn(r):"";else if(k==="factors")v=(r.factors||[]).join("|");
      return csvEscape(v);
    }).join(","));
    download(`keiba_ev_records_${new Date().toISOString().slice(0,10)}.csv`,"\ufeff"+[head,...lines].join("\r\n"),"text/csv;charset=utf-8");
  }

  function parseImportData(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.records)) return data.records;
    if (data.record && typeof data.record==="object") return [data.record];
    if (data.raceDate || data.selection) return [data];
    throw new Error("記録データが見つかりません");
  }

  function importChappy(file){
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const data=JSON.parse(reader.result);
        const imported=parseImportData(data);
        const {added,updated}=upsertImported(imported);
        $("importStatus").textContent=`読み込み完了：${added}件追加、${updated}件更新`;
        $("importStatus").className="status-line status-ok";
        renderAll();
      }catch(e){
        $("importStatus").textContent="読み込み失敗：チャッピー用JSONか確認してください。";
        $("importStatus").className="status-line status-bad";
      }
    };
    reader.readAsText(file);
  }

  function restoreBackup(file){
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const data=JSON.parse(reader.result);
        const imported=Array.isArray(data)?data:data.records;
        if(!Array.isArray(imported))throw new Error();
        if(!confirm(`${imported.length}件のバックアップで現在の記録を置き換えますか？`))return;
        records=imported.map(normalizeRecord);
        if(data.settings)settings={...settings,...data.settings};
        saveAll();
        $("monthlyBudget").value=settings.monthlyBudget??10000;
        $("modelVersion").value=settings.modelVersion??"v2";
        renderAll();
        alert("復元しました。");
      }catch{alert("バックアップJSONを読み込めませんでした。");}
    };
    reader.readAsText(file);
  }

  $("recordForm").addEventListener("submit",e=>{
    e.preventDefault();settings.modelVersion=$("modelVersion").value.trim()||"v2";
    const rec=getFormRecord(),errs=validate(rec);
    if(errs.length){$("formError").textContent=`入力を確認：${errs.join("、")}`;return;}
    const idx=records.findIndex(r=>r.id===rec.id);
    if(idx>=0)records[idx]=rec;else records.push(rec);
    saveAll();resetForm();renderAll();
  });

  $("clearFormBtn").addEventListener("click",resetForm);
  $("monthlyBudget").addEventListener("change",syncSettings);
  $("modelVersion").addEventListener("change",syncSettings);
  ["predProb","evalOdds"].forEach(id=>$(id).addEventListener("input",updatePreview));
  $("oddsLow").addEventListener("input",()=>{if(!$("evalOdds").value&&$("oddsLow").value)$("evalOdds").value=$("oddsLow").value;updatePreview();});
  $("decision").addEventListener("change",()=>{if($("decision").value==="見送り"&&Number($("stake").value)===100)$("stake").value="0";if($("decision").value==="購入"&&!Number($("stake").value))$("stake").value="100";});
  ["searchText","filterDecision","filterBetType","filterResult"].forEach(id=>$(id).addEventListener("input",renderRecords));

  $("recordsTable").addEventListener("click",e=>{
    const edit=e.target.closest("[data-edit]"),del=e.target.closest("[data-delete]");
    if(edit){const r=records.find(x=>x.id===edit.dataset.edit);if(r)fillForm(r);}
    if(del){const r=records.find(x=>x.id===del.dataset.delete);if(r&&confirm(`${r.raceDate} ${r.track} ${r.raceNo}R ${r.betType} ${r.selection} を削除しますか？`)){records=records.filter(x=>x.id!==r.id);saveAll();renderAll();}}
  });

  $("chappyImportInput").addEventListener("change",e=>{if(e.target.files?.[0])importChappy(e.target.files[0]);e.target.value="";});
  $("restoreJsonInput").addEventListener("change",e=>{if(e.target.files?.[0])restoreBackup(e.target.files[0]);e.target.value="";});
  $("runSimulationBtn").addEventListener("click",runSimulation);
  $("exportJsonBtn").addEventListener("click",exportJson);
  $("exportCsvBtn").addEventListener("click",exportCsv);
  $("deleteAllBtn").addEventListener("click",()=>{if(records.length&&confirm("全記録を削除します。元に戻せません。")){records=[];saveAll();renderAll();resetForm();}});

  initFactors();initDefaults();updatePreview();renderAll();
})();
