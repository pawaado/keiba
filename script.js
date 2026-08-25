(() => {
  "use strict";

  const K_KEY = "keiba_ev_tracker_records_v1"; // v2互換
  const K_SETTINGS_KEY = "keiba_ev_tracker_settings_v1";
  const S_KEY = "pocket_money_stock_records_v1";
  const APP_KEY = "pocket_money_app_v1";
  const $ = id => document.getElementById(id);

  let keiba = load(K_KEY, []);
  let stocks = load(S_KEY, []);
  let kSettings = load(K_SETTINGS_KEY, {monthlyBudget:10000, modelVersion:"v3"});
  let app = load(APP_KEY, {activeTab:"keiba"});

  function load(key, fallback){ try{const v=localStorage.getItem(key);return v?JSON.parse(v):fallback;}catch{return fallback;} }
  function save(){
    localStorage.setItem(K_KEY, JSON.stringify(keiba));
    localStorage.setItem(S_KEY, JSON.stringify(stocks));
    localStorage.setItem(K_SETTINGS_KEY, JSON.stringify(kSettings));
    localStorage.setItem(APP_KEY, JSON.stringify(app));
  }
  function n(v){if(v===""||v==null)return null;const x=Number(v);return Number.isFinite(x)?x:null;}
  function yen(v){return `${Math.round(Number(v||0)).toLocaleString("ja-JP")}円`;}
  function pct(v,d=1){return v==null||!Number.isFinite(Number(v))?"—":`${Number(v).toFixed(d)}%`;}
  function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
  function uuid(){return crypto.randomUUID?crypto.randomUUID():`id_${Date.now()}_${Math.random().toString(16).slice(2)}`;}
  function download(name,content,type){const b=new Blob([content],{type});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},0);}
  function csvEsc(v){return `"${String(v??"").replace(/"/g,'""')}"`;}
  function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:null;}

  // ---------- Tabs ----------
  function setTab(tab){
    app.activeTab=tab; save();
    document.querySelectorAll(".tab-btn").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
    $("keibaPanel").classList.toggle("active",tab==="keiba");
    $("stockPanel").classList.toggle("active",tab==="stock");
  }
  document.querySelectorAll(".tab-btn").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));

  // ---------- Keiba ----------
  function kStableId(r){
    if(r.id)return String(r.id);
    const raw=[r.raceDate,r.track,r.raceNo,r.betType,r.selection].map(x=>String(x??"").trim()).join("|");
    let h=2166136261;for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619);}return `keiba_${(h>>>0).toString(16)}`;
  }
  function kNormalize(src){
    const r={...src}; r.id=kStableId(r); r.assetType="keiba";
    r.raceDate=r.raceDate||r.date||""; r.track=r.track||""; r.raceNo=n(r.raceNo); r.betType=r.betType||""; r.selection=r.selection||"";
    r.predProb=n(r.predProb??r.hitProbability); r.evalOdds=n(r.evalOdds??r.odds??r.oddsLow); r.oddsLow=n(r.oddsLow??r.evalOdds??r.odds); r.oddsHigh=n(r.oddsHigh);
    r.stake=n(r.stake??r.virtualStake)??100; r.popularity=n(r.popularity); r.resultStatus=r.resultStatus||"未確定"; r.payoutPer100=n(r.payoutPer100);
    r.analysisMemo=r.analysisMemo||r.memo||r.reason||""; r.startTime=r.startTime||""; r.finalOddsLow=n(r.finalOddsLow); r.finalOddsHigh=n(r.finalOddsHigh);
    r.decision=r.decision||"購入"; r.createdAt=r.createdAt||new Date().toISOString(); r.updatedAt=new Date().toISOString();
    return r;
  }
  function kEv(r){return r.predProb!=null&&r.evalOdds!=null?Number(r.predProb)*Number(r.evalOdds):null;}
  function kFair(r){return r.predProb>0?100/Number(r.predProb):null;}
  function kReturn(r){if(!r.resultStatus||r.resultStatus==="未確定")return null;return (Number(r.stake)||0)/100*(Number(r.payoutPer100)||0);}
  function kEvBand(ev){if(ev==null)return "—";if(ev<100)return "<100%";if(ev>=130)return "130%+";const lo=Math.floor(ev/5)*5;return `${lo}-${(lo+4.9).toFixed(1)}%`;}
  function upsertKeiba(list){let add=0,upd=0;for(const raw of list){const r=kNormalize(raw);const i=keiba.findIndex(x=>x.id===r.id);if(i>=0){keiba[i]={...keiba[i],...r,createdAt:keiba[i].createdAt||r.createdAt};upd++;}else{keiba.push(r);add++;}}save();return{add,upd};}

  function renderKeibaSummary(){
    const bought=keiba.filter(r=>r.decision!=="見送り"); const settled=bought.filter(r=>r.resultStatus&&r.resultStatus!=="未確定");
    const stake=bought.reduce((s,r)=>s+(Number(r.stake)||0),0); const settledStake=settled.reduce((s,r)=>s+(Number(r.stake)||0),0); const ret=settled.reduce((s,r)=>s+(kReturn(r)||0),0); const profit=ret-settledStake;
    $("kStatBought").textContent=bought.length; $("kStatStake").textContent=yen(stake); $("kStatReturn").textContent=yen(ret); $("kStatProfit").textContent=yen(profit); $("kStatProfit").className=profit>0?"profit-positive":profit<0?"profit-negative":"";
    $("kStatRoi").textContent=settledStake?pct(ret/settledStake*100):"—"; $("kStatHitRate").textContent=settled.length?pct(settled.filter(r=>r.resultStatus==="的中").length/settled.length*100):"—";
    const evs=bought.map(kEv).filter(v=>v!=null); $("kStatAvgEv").textContent=evs.length?pct(avg(evs)):"—"; $("kStatCandidates").textContent=keiba.length; renderBudget();
  }
  function renderBudget(){const d=new Date(),ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;const used=keiba.filter(r=>r.decision!=="見送り"&&String(r.raceDate||"").startsWith(ym)).reduce((s,r)=>s+(Number(r.stake)||0),0);const b=Number(kSettings.monthlyBudget)||0;$("budgetMonthLabel").textContent=`${d.getFullYear()}年${d.getMonth()+1}月`;$("budgetText").textContent=`${used.toLocaleString("ja-JP")} / ${b.toLocaleString("ja-JP")}円`;$("budgetBarFill").style.width=`${b?Math.min(100,used/b*100):0}%`;$("budgetBarFill").style.background=used>b?"#b91c1c":"#2563eb";}
  function kGroups(keyFn){const m=new Map();keiba.forEach(r=>{const k=keyFn(r)||"—";if(!m.has(k))m.set(k,[]);m.get(k).push(r);});return [...m.entries()];}
  function renderKBreakdown(id,groups){$(id).innerHTML=`<thead><tr><th>区分</th><th>件数</th><th>確定</th><th>的中率</th><th>平均EV</th><th>回収率</th></tr></thead><tbody>${groups.map(([k,a])=>{const b=a.filter(r=>r.decision!=="見送り"),s=b.filter(r=>r.resultStatus&&r.resultStatus!=="未確定"),st=s.reduce((x,r)=>x+(Number(r.stake)||0),0),ret=s.reduce((x,r)=>x+(kReturn(r)||0),0),ev=avg(b.map(kEv).filter(v=>v!=null));return `<tr><td>${esc(k)}</td><td>${a.length}</td><td>${s.length}</td><td>${s.length?pct(s.filter(r=>r.resultStatus==="的中").length/s.length*100):"—"}</td><td>${ev==null?"—":pct(ev)}</td><td>${st?pct(ret/st*100):"—"}</td></tr>`;}).join("")}</tbody>`;}
  function renderKCalibration(){const bins=[[0,10],[10,20],[20,30],[30,40],[40,50],[50,60],[60,70],[70,80],[80,90],[90,101]];$("calibrationTable").innerHTML=`<thead><tr><th>予測確率</th><th>件数</th><th>確定</th><th>平均予測</th><th>実的中率</th></tr></thead><tbody>${bins.map(([lo,hi])=>{const a=keiba.filter(r=>r.predProb!=null&&r.predProb>=lo&&r.predProb<hi),s=a.filter(r=>r.resultStatus&&r.resultStatus!=="未確定");return `<tr><td>${lo}-${hi===101?100:hi}%</td><td>${a.length}</td><td>${s.length}</td><td>${a.length?pct(avg(a.map(r=>Number(r.predProb)))):"—"}</td><td>${s.length?pct(s.filter(r=>r.resultStatus==="的中").length/s.length*100):"—"}</td></tr>`;}).join("")}</tbody>`;}
  function renderKeibaRecords(){
    const q=$("kSearchText").value.trim().toLowerCase(),bt=$("kFilterBetType").value,rs=$("kFilterResult").value;
    const list=[...keiba].filter(r=>(!q||[r.track,r.selection,r.analysisMemo].join(" ").toLowerCase().includes(q))&&(!bt||r.betType===bt)&&(!rs||r.resultStatus===rs)).sort((a,b)=>String(b.raceDate).localeCompare(String(a.raceDate))||Number(b.raceNo||0)-Number(a.raceNo||0));
    $("keibaRecordsTable").innerHTML=`<thead><tr><th>日付</th><th>場/R</th><th>券種</th><th>買い目</th><th>的中率</th><th>判断オッズ</th><th>EV</th><th>EV帯</th><th>仮想額</th><th>結果</th><th>損益</th><th>操作</th></tr></thead><tbody>${list.map(r=>{const ev=kEv(r),ret=kReturn(r),profit=ret==null?null:ret-(Number(r.stake)||0);const badge=r.resultStatus==="的中"?"badge-hit":r.resultStatus==="不的中"?"badge-miss":"badge-pending";return `<tr><td>${esc(r.raceDate)}</td><td>${esc(r.track)} ${r.raceNo||""}R</td><td>${esc(r.betType)}</td><td>${esc(r.selection)}</td><td>${pct(r.predProb)}</td><td>${r.evalOdds??"—"}</td><td>${ev==null?"—":pct(ev)}</td><td>${kEvBand(ev)}</td><td>${yen(r.stake)}</td><td><span class="badge ${badge}">${esc(r.resultStatus||"未確定")}</span></td><td class="${profit>0?"profit-positive":profit<0?"profit-negative":""}">${profit==null?"—":yen(profit)}</td><td><div class="row-actions"><button class="mini-btn" data-k-edit="${esc(r.id)}">編集</button><button class="mini-btn delete" data-k-del="${esc(r.id)}">削除</button></div></td></tr>`;}).join("")}</tbody>`;
    $("keibaEmpty").style.display=list.length?"none":"block";
    const types=[...new Set(keiba.map(r=>r.betType).filter(Boolean))].sort();const cur=$("kFilterBetType").value;$("kFilterBetType").innerHTML=`<option value="">券種：すべて</option>`+types.map(x=>`<option>${esc(x)}</option>`).join("");$("kFilterBetType").value=cur;
  }
  function renderKeibaAll(){renderKeibaSummary();renderKBreakdown("byBetTypeTable",kGroups(r=>r.betType));renderKBreakdown("byEvBandTable",kGroups(r=>kEvBand(kEv(r))).sort((a,b)=>String(a[0]).localeCompare(String(b[0]),"ja")));renderKCalibration();renderKeibaRecords();}
  function updateKPreview(){const p=n($("kPredProb").value),o=n($("kEvalOdds").value);const fair=p>0?100/p:null,ev=p!=null&&o!=null?p*o:null,min=p>0?100/p:null;$("kFairOddsPreview").textContent=fair?`${fair.toFixed(2)}倍`:"—";$("kEvPreview").textContent=ev!=null?pct(ev):"—";$("kEvPreview").className=ev>=100?"profit-positive":ev!=null?"profit-negative":"";$("kMinOddsPreview").textContent=min?`${min.toFixed(2)}倍`:"—";}
  function kReset(){const d=new Date().toISOString().slice(0,10);$("keibaForm").reset();$("kId").value="";$("kRaceDate").value=d;$("kStake").value="100";$("kResultStatus").value="未確定";$("kFormError").textContent="";updateKPreview();}
  function kEdit(id){const r=keiba.find(x=>x.id===id);if(!r)return;$("keibaManualDetails").open=true;$("kId").value=r.id;$("kRaceDate").value=r.raceDate||"";$("kTrack").value=r.track||"";$("kRaceNo").value=r.raceNo??"";$("kStartTime").value=r.startTime||"";$("kBetType").value=r.betType||"単勝";$("kSelection").value=r.selection||"";$("kPredProb").value=r.predProb??"";$("kEvalOdds").value=r.evalOdds??"";$("kStake").value=r.stake??100;$("kPopularity").value=r.popularity??"";$("kResultStatus").value=r.resultStatus||"未確定";$("kPayoutPer100").value=r.payoutPer100??"";$("kMemo").value=r.analysisMemo||"";updateKPreview();$("keibaManualDetails").scrollIntoView({behavior:"smooth"});}

  // ---------- Stocks ----------
  function sStableId(r){if(r.id)return String(r.id);const raw=[r.code||r.ticker,r.entryDate||r.analysisDate||r.analyzedAt].map(x=>String(x??"").trim()).join("|");let h=2166136261;for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619);}return `stock_${(h>>>0).toString(16)}`;}
  function sNormalize(src){
    const r={...src};r.id=sStableId(r);r.assetType="stock";r.name=r.name||r.stockName||r.company||"";r.code=String(r.code||r.ticker||"");r.entryDate=r.entryDate||r.date||"";r.status=r.status||r.positionStatus||"監視";
    r.entryPrice=n(r.entryPrice??r.buyPrice??r.virtualBuyPrice);r.virtualAmount=n(r.virtualAmount??r.amount??r.stake)??10000;r.targetPrice=n(r.targetPrice);r.stopLoss=n(r.stopLoss??r.stopPrice);r.currentPrice=n(r.currentPrice);r.holdDays=n(r.holdDays??r.plannedHoldDays);r.analyzedAt=r.analyzedAt||r.analysisAt||"";r.thesis=r.thesis||r.reason||r.analysisMemo||"";
    r.exitDate=r.exitDate||"";r.exitPrice=n(r.exitPrice??r.sellPrice);r.exitReason=r.exitReason||"";r.exitMemo=r.exitMemo||r.resultMemo||"";if(r.exitPrice!=null&&!r.status)r.status="決済済";r.createdAt=r.createdAt||new Date().toISOString();r.updatedAt=new Date().toISOString();return r;
  }
  function sCalc(r,priceKey="exitPrice"){const p=Number(r[priceKey]);const e=Number(r.entryPrice);if(!(e>0)&&!(p>0))return {rate:null,profit:null};if(!(e>0)||!(p>0))return {rate:null,profit:null};const rate=(p/e-1)*100;return {rate,profit:(Number(r.virtualAmount)||0)*rate/100};}
  function sUpside(r){return r.entryPrice>0&&r.targetPrice>0?(r.targetPrice/r.entryPrice-1)*100:null;}
  function sDownside(r){return r.entryPrice>0&&r.stopLoss>0?(1-r.stopLoss/r.entryPrice)*100:null;}
  function sRR(r){const u=sUpside(r),d=sDownside(r);return u!=null&&d>0?u/d:null;}
  function upsertStocks(list){let add=0,upd=0;for(const raw of list){const r=sNormalize(raw);const i=stocks.findIndex(x=>x.id===r.id);if(i>=0){stocks[i]={...stocks[i],...r,createdAt:stocks[i].createdAt||r.createdAt};upd++;}else{stocks.push(r);add++;}}save();return{add,upd};}
  function renderStockSummary(){const open=stocks.filter(r=>r.status==="保有中"),closed=stocks.filter(r=>r.status==="決済済"&&r.exitPrice!=null&&r.entryPrice!=null),vals=closed.map(r=>sCalc(r));const wins=vals.filter(x=>x.rate>0),losses=vals.filter(x=>x.rate<0),profit=vals.reduce((s,x)=>s+(x.profit||0),0);$("sStatOpen").textContent=open.length;$("sStatClosed").textContent=closed.length;$("sStatWinRate").textContent=closed.length?pct(wins.length/closed.length*100):"—";$("sStatProfit").textContent=yen(profit);$("sStatProfit").className=profit>0?"profit-positive":profit<0?"profit-negative":"";$("sStatAvgReturn").textContent=closed.length?pct(avg(vals.map(x=>x.rate))):"—";$("sStatAvgWin").textContent=wins.length?pct(avg(wins.map(x=>x.rate))):"—";$("sStatAvgLoss").textContent=losses.length?pct(avg(losses.map(x=>x.rate))):"—";$("sStatTotal").textContent=stocks.length;}
  function sGroupStats(keyFn){const m=new Map();stocks.forEach(r=>{const k=keyFn(r)||"—";if(!m.has(k))m.set(k,[]);m.get(k).push(r);});return [...m.entries()];}
  function renderStockGroup(id,groups){$(id).innerHTML=`<thead><tr><th>区分</th><th>件数</th><th>決済</th><th>勝率</th><th>平均損益率</th><th>累計損益</th></tr></thead><tbody>${groups.map(([k,a])=>{const c=a.filter(r=>r.status==="決済済"&&r.exitPrice!=null&&r.entryPrice!=null),vals=c.map(r=>sCalc(r)),wins=vals.filter(x=>x.rate>0),profit=vals.reduce((s,x)=>s+(x.profit||0),0);return `<tr><td>${esc(k)}</td><td>${a.length}</td><td>${c.length}</td><td>${c.length?pct(wins.length/c.length*100):"—"}</td><td>${c.length?pct(avg(vals.map(x=>x.rate))):"—"}</td><td class="${profit>0?"profit-positive":profit<0?"profit-negative":""}">${yen(profit)}</td></tr>`;}).join("")}</tbody>`;}
  function renderStockRecords(){const q=$("sSearchText").value.trim().toLowerCase(),st=$("sFilterStatus").value,res=$("sFilterResult").value;const list=[...stocks].filter(r=>{const calc=sCalc(r);return(!q||[r.name,r.code,r.thesis].join(" ").toLowerCase().includes(q))&&(!st||r.status===st)&&(!res||(res==="win"&&calc.rate>0)||(res==="loss"&&calc.rate<0));}).sort((a,b)=>String(b.entryDate).localeCompare(String(a.entryDate)));
    $("stockRecordsTable").innerHTML=`<thead><tr><th>日付</th><th>銘柄</th><th>コード</th><th>状態</th><th>買値</th><th>目標</th><th>損切り</th><th>RR</th><th>仮想額</th><th>決済値</th><th>損益率</th><th>損益</th><th>操作</th></tr></thead><tbody>${list.map(r=>{const c=sCalc(r),rr=sRR(r),badge=r.status==="保有中"?"badge-open":r.status==="決済済"?"badge-closed":"badge-watch";return `<tr><td>${esc(r.entryDate)}</td><td>${esc(r.name)}</td><td>${esc(r.code)}</td><td><span class="badge ${badge}">${esc(r.status)}</span></td><td>${r.entryPrice??"—"}</td><td>${r.targetPrice??"—"}</td><td>${r.stopLoss??"—"}</td><td>${rr==null?"—":rr.toFixed(2)}</td><td>${yen(r.virtualAmount)}</td><td>${r.exitPrice??"—"}</td><td class="${c.rate>0?"profit-positive":c.rate<0?"profit-negative":""}">${pct(c.rate)}</td><td class="${c.profit>0?"profit-positive":c.profit<0?"profit-negative":""}">${c.profit==null?"—":yen(c.profit)}</td><td><div class="row-actions"><button class="mini-btn" data-s-edit="${esc(r.id)}">編集</button><button class="mini-btn delete" data-s-del="${esc(r.id)}">削除</button></div></td></tr>`;}).join("")}</tbody>`;$("stockEmpty").style.display=list.length?"none":"block";}
  function renderStocksAll(){renderStockSummary();renderStockGroup("stockStatusTable",sGroupStats(r=>r.status));renderStockGroup("stockExitReasonTable",sGroupStats(r=>r.exitReason||"未決済"));renderStockRecords();}
  function updateSPreview(){const e=n($("sEntryPrice").value),t=n($("sTarget").value),sl=n($("sStop").value);const u=e>0&&t>0?(t/e-1)*100:null,d=e>0&&sl>0?(1-sl/e)*100:null,rr=u!=null&&d>0?u/d:null;$("sUpsidePreview").textContent=pct(u);$("sDownsidePreview").textContent=pct(d);$("sRrPreview").textContent=rr==null?"—":rr.toFixed(2);}
  function sReset(){const now=new Date(),d=now.toISOString().slice(0,10);$("stockForm").reset();$("sId").value="";$("sEntryDate").value=d;$("sStatus").value="監視";$("sAmount").value="10000";$("sFormError").textContent="";updateSPreview();}
  function sEdit(id){const r=stocks.find(x=>x.id===id);if(!r)return;$("stockManualDetails").open=true;$("sId").value=r.id;$("sName").value=r.name||"";$("sCode").value=r.code||"";$("sEntryDate").value=r.entryDate||"";$("sStatus").value=r.status||"監視";$("sEntryPrice").value=r.entryPrice??"";$("sAmount").value=r.virtualAmount??10000;$("sTarget").value=r.targetPrice??"";$("sStop").value=r.stopLoss??"";$("sHoldDays").value=r.holdDays??"";$("sAnalyzedAt").value=r.analyzedAt||"";$("sThesis").value=r.thesis||"";$("sExitDate").value=r.exitDate||"";$("sExitPrice").value=r.exitPrice??"";$("sExitReason").value=r.exitReason||"";$("sCurrentPrice").value=r.currentPrice??"";$("sExitMemo").value=r.exitMemo||"";updateSPreview();$("stockManualDetails").scrollIntoView({behavior:"smooth"});}

  // ---------- Import / Export ----------
  function classifyImport(data){
    const out={keiba:[],stocks:[]};
    if(Array.isArray(data)){for(const x of data){if(x.assetType==="stock"||x.code||x.ticker||x.entryPrice!=null)out.stocks.push(x);else out.keiba.push(x);}return out;}
    if(Array.isArray(data.keibaRecords))out.keiba.push(...data.keibaRecords);
    if(Array.isArray(data.raceRecords))out.keiba.push(...data.raceRecords);
    if(Array.isArray(data.records))out.keiba.push(...data.records);
    if(data.record)out.keiba.push(data.record);
    if(Array.isArray(data.stockRecords))out.stocks.push(...data.stockRecords);
    if(Array.isArray(data.stocks))out.stocks.push(...data.stocks);
    if(data.stockRecord)out.stocks.push(data.stockRecord);
    if(!out.keiba.length&&!out.stocks.length&&typeof data==="object"){
      if(data.assetType==="stock"||data.code||data.ticker||data.entryPrice!=null)out.stocks.push(data);else if(data.raceDate||data.selection)out.keiba.push(data);
    }
    return out;
  }
  function importFile(file,restore=false){const fr=new FileReader();fr.onload=()=>{try{const data=JSON.parse(fr.result);const c=classifyImport(data);if(restore&&data.settings)kSettings={...kSettings,...data.settings};const k=upsertKeiba(c.keiba),s=upsertStocks(c.stocks);$("importStatus").textContent=`読み込み完了：競馬 ${k.add}件追加/${k.upd}件更新、株 ${s.add}件追加/${s.upd}件更新`;$("importStatus").className="status-line status-ok";renderAll();}catch(e){$("importStatus").textContent=`読み込み失敗：${e.message||"JSONを確認してください"}`;$("importStatus").className="status-line status-bad";}};fr.readAsText(file);}
  function exportAllJson(){download(`pocket_money_backup_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({app:"Pocket Money",version:3,exportedAt:new Date().toISOString(),settings:kSettings,keibaRecords:keiba,stockRecords:stocks},null,2),"application/json;charset=utf-8");}
  function exportKeibaCsv(){const fields=[["id","ID"],["raceDate","日付"],["track","競馬場"],["raceNo","R"],["startTime","発走"],["betType","券種"],["selection","買い目"],["predProb","推定的中率%"],["evalOdds","判断オッズ"],["predEv","推定EV%"],["evBand","EV帯"],["stake","仮想購入額"],["popularity","人気"],["analysisMemo","分析メモ"],["resultStatus","結果"],["payoutPer100","払戻100円あたり"],["profit","仮想損益"]];const head=fields.map(x=>csvEsc(x[1])).join(",");const lines=keiba.map(r=>fields.map(([k])=>{let v=r[k];if(k==="predEv")v=kEv(r);if(k==="evBand")v=kEvBand(kEv(r));if(k==="profit"){const ret=kReturn(r);v=ret==null?"":ret-(Number(r.stake)||0);}return csvEsc(v);}).join(","));download(`keiba_records_${new Date().toISOString().slice(0,10)}.csv`,"\ufeff"+[head,...lines].join("\r\n"),"text/csv;charset=utf-8");}
  function exportStockCsv(){const fields=[["id","ID"],["entryDate","エントリー日"],["name","銘柄名"],["code","コード"],["status","状態"],["entryPrice","仮想買値"],["virtualAmount","仮想投資額"],["targetPrice","目標株価"],["stopLoss","損切り水準"],["riskReward","リスクリワード"],["holdDays","想定保有日数"],["analyzedAt","分析日時"],["thesis","根拠"],["exitDate","決済日"],["exitPrice","決済値"],["exitReason","決済理由"],["returnPct","損益率%"],["profit","仮想損益"],["exitMemo","決済メモ"]];const head=fields.map(x=>csvEsc(x[1])).join(",");const lines=stocks.map(r=>fields.map(([k])=>{let v=r[k];if(k==="riskReward")v=sRR(r);if(k==="returnPct")v=sCalc(r).rate;if(k==="profit")v=sCalc(r).profit;return csvEsc(v);}).join(","));download(`stock_records_${new Date().toISOString().slice(0,10)}.csv`,"\ufeff"+[head,...lines].join("\r\n"),"text/csv;charset=utf-8");}

  // ---------- Events ----------
  $("monthlyBudget").value=kSettings.monthlyBudget??10000;$("modelVersion").value=kSettings.modelVersion||"v3";
  ["monthlyBudget","modelVersion"].forEach(id=>$(id).addEventListener("change",()=>{kSettings.monthlyBudget=n($("monthlyBudget").value)??0;kSettings.modelVersion=$("modelVersion").value.trim()||"v3";save();renderKeibaAll();}));
  ["kPredProb","kEvalOdds"].forEach(id=>$(id).addEventListener("input",updateKPreview));["sEntryPrice","sTarget","sStop"].forEach(id=>$(id).addEventListener("input",updateSPreview));
  ["kSearchText","kFilterBetType","kFilterResult"].forEach(id=>$(id).addEventListener(id==="kSearchText"?"input":"change",renderKeibaRecords));["sSearchText","sFilterStatus","sFilterResult"].forEach(id=>$(id).addEventListener(id==="sSearchText"?"input":"change",renderStockRecords));
  $("runSimulationBtn").addEventListener("click",()=>{const th=n($("simEvThreshold").value)??110;const a=keiba.filter(r=>kEv(r)!=null&&kEv(r)>=th&&r.resultStatus&&r.resultStatus!=="未確定");const stake=a.length*100,ret=a.reduce((s,r)=>s+(Number(r.payoutPer100)||0),0),profit=ret-stake;$("simulationResult").innerHTML=a.length?`対象 <strong>${a.length}件</strong> / 仮想投資 ${yen(stake)} / 仮想払戻 ${yen(ret)} / 損益 <strong class="${profit>=0?"profit-positive":"profit-negative"}">${yen(profit)}</strong> / 回収率 ${pct(stake?ret/stake*100:null)}`:"確定済みの対象記録がありません。";});
  $("keibaForm").addEventListener("submit",e=>{e.preventDefault();const r=kNormalize({id:$("kId").value||uuid(),raceDate:$("kRaceDate").value,track:$("kTrack").value.trim(),raceNo:n($("kRaceNo").value),startTime:$("kStartTime").value,betType:$("kBetType").value,selection:$("kSelection").value.trim(),predProb:n($("kPredProb").value),evalOdds:n($("kEvalOdds").value),stake:n($("kStake").value)??100,popularity:n($("kPopularity").value),resultStatus:$("kResultStatus").value,payoutPer100:n($("kPayoutPer100").value),analysisMemo:$("kMemo").value.trim(),decision:"購入"});const errs=[];if(!r.raceDate)errs.push("日付");if(!r.track)errs.push("競馬場");if(!r.raceNo)errs.push("R");if(!r.selection)errs.push("買い目");if(r.predProb==null)errs.push("推定的中率");if(r.evalOdds==null)errs.push("判断オッズ");if(errs.length){$("kFormError").textContent=`未入力：${errs.join("、")}`;return;}upsertKeiba([r]);kReset();renderKeibaAll();});
  $("stockForm").addEventListener("submit",e=>{e.preventDefault();const r=sNormalize({id:$("sId").value||uuid(),name:$("sName").value.trim(),code:$("sCode").value.trim(),entryDate:$("sEntryDate").value,status:$("sStatus").value,entryPrice:n($("sEntryPrice").value),virtualAmount:n($("sAmount").value)??10000,targetPrice:n($("sTarget").value),stopLoss:n($("sStop").value),holdDays:n($("sHoldDays").value),analyzedAt:$("sAnalyzedAt").value,thesis:$("sThesis").value.trim(),exitDate:$("sExitDate").value,exitPrice:n($("sExitPrice").value),exitReason:$("sExitReason").value,currentPrice:n($("sCurrentPrice").value),exitMemo:$("sExitMemo").value.trim()});const errs=[];if(!r.name)errs.push("銘柄名");if(!r.code)errs.push("コード");if(!r.entryDate)errs.push("エントリー日");if(errs.length){$("sFormError").textContent=`未入力：${errs.join("、")}`;return;}if(r.exitPrice!=null)r.status="決済済";upsertStocks([r]);sReset();renderStocksAll();});
  $("kClearBtn").addEventListener("click",kReset);$("sClearBtn").addEventListener("click",sReset);
  $("keibaRecordsTable").addEventListener("click",e=>{const ed=e.target.closest("[data-k-edit]"),del=e.target.closest("[data-k-del]");if(ed)kEdit(ed.dataset.kEdit);if(del&&confirm("この競馬記録を削除しますか？")){keiba=keiba.filter(r=>r.id!==del.dataset.kDel);save();renderKeibaAll();}});
  $("stockRecordsTable").addEventListener("click",e=>{const ed=e.target.closest("[data-s-edit]"),del=e.target.closest("[data-s-del]");if(ed)sEdit(ed.dataset.sEdit);if(del&&confirm("この株記録を削除しますか？")){stocks=stocks.filter(r=>r.id!==del.dataset.sDel);save();renderStocksAll();}});
  $("chappyImportInput").addEventListener("change",e=>{const f=e.target.files?.[0];if(f)importFile(f);e.target.value="";});
  $("restoreJsonInput").addEventListener("change",e=>{const f=e.target.files?.[0];if(f)importFile(f,true);e.target.value="";});
  $("exportAllJsonBtn").addEventListener("click",exportAllJson);$("exportKeibaCsvBtn").addEventListener("click",exportKeibaCsv);$("exportStockCsvBtn").addEventListener("click",exportStockCsv);
  $("deleteAllBtn").addEventListener("click",()=>{if(confirm("競馬と株の全記録を削除します。よろしいですか？")){keiba=[];stocks=[];save();renderAll();}});

  function renderAll(){renderKeibaAll();renderStocksAll();}
  kReset();sReset();setTab(app.activeTab||"keiba");renderAll();
})();
