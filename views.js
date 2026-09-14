/* ============================================================
   6. SHELL: header, nav, routing
   ============================================================ */

const TABS = [
  ["setup",   "Setup"],
  ["auction", "Auction"],
  ["shop",    "Shop"],
  ["market",  "Public Market"],
  ["cards",   "Cards"],
  ["players", "Players"]
];

let notice = null;
function say(text, kind){ notice = {text, kind: kind || "ok"}; }
function noticeHtml(){
  if(!notice) return "";
  const cls = notice.kind === "err" ? "notice err" : notice.kind === "info" ? "notice info" : "notice";
  const html = '<div class="' + cls + '">' + esc(notice.text) + "</div>";
  notice = null;
  return html;
}

function render(){
  document.body.classList.toggle("blur", !!S.ui.blur);
  renderHeader();
  const view = document.getElementById("view");
  const tab = S.ui.tab;
  let html = "";
  if(backend === "local" && !storageOK){
    html += '<div class="notice err"><b>This page cannot save anywhere.</b> ' +
      "It is not being served by <code>server.py</code>, and this browser is refusing local storage " +
      "too, so a refresh loses the table. Start it with <b>start_table.bat</b> to save into " +
      "<code>friends-cards.db</code>, or use <b>Export backup</b> after anything important.</div>";
  }
  if(tab === "setup")        html += viewSetup();
  else if(tab === "auction") html += viewAuction();
  else if(tab === "shop")    html += viewShop();
  else if(tab === "market")  html += viewMarket();
  else if(tab === "cards")   html += viewCards();
  else if(tab === "players") html += viewPlayers();
  view.innerHTML = html;
  const title = view.querySelector('.title');
  if(title){
    const index=TABS.findIndex(t=>t[0]===tab);
    title.insertAdjacentHTML('afterbegin','<div class="page-kicker"><span>THE TABLE</span><i></i>'+String(index+1).padStart(2,'0')+' / '+esc(TABS[index]?.[1]||'Setup')+'</div>');
    title.insertAdjacentHTML('beforeend','<div class="hero-symbol" aria-hidden="true">'+hudIcon(tab)+'</div>');
    title.insertAdjacentHTML('afterend',stageGuide());
  }
  view.scrollTop = 0;
  improveAccessibility(view);
}

function renderHeader(){
  const set = currentSet();
  const phase = document.getElementById("phaseBar");
  if(set){
    const cls = set.state === "LIVE" ? "pill live" : set.state === "BIDDING" || set.state === "DEFENSE" ? "pill hot" : "pill";
    phase.innerHTML = '<strong>Set ' + set.ordinal + " &middot; " + esc(set.name) + "</strong>" +
      '<span class="' + cls + '">' + set.state + "</span>";
  } else {
    phase.innerHTML = '<span class="pill">no set yet</span>';
  }

  const sel = document.getElementById("actingSel");
  if(!S.players.length){
    sel.innerHTML = '<option value="">no players</option>';
  } else {
    if(!S.ui.acting || !player(S.ui.acting)) S.ui.acting = S.players[0].id;
    sel.innerHTML = S.players.map(p =>
      '<option value="' + p.id + '"' + (p.id === S.ui.acting ? " selected" : "") + ">" + esc(p.name) + "</option>"
    ).join("");
  }
  const a = acting();
  document.getElementById("wallet").textContent = a ? a.credits.toLocaleString() : "—";
  document.getElementById('playerAvatar').textContent = a ? initials(a.name) : '?';
  const cardCount=a?S.instances.filter(i=>i.ownerId===a.id&&i.state==='ACTIVE').length:0;
  const packCount=a?S.packs.filter(p=>p.ownerId===a.id&&!p.opened).length:0;
  document.getElementById('playerInventory').textContent = a ? cardCount+' cards · '+packCount+' sealed packs' : 'Add your first player';

  document.getElementById("nav").innerHTML = TABS.map(t =>
    '<button data-tab="' + t[0] + '" class="' + (S.ui.tab === t[0] ? "on" : "") + '">'+hudIcon(t[0])+'<span>' + t[1] + '</span>'+((t[0]==='cards'&&cardCount)||(t[0]==='shop'&&packCount)||(t[0]==='players'&&S.players.length)?'<span class="nav-count">'+(t[0]==='cards'?cardCount:t[0]==='shop'?packCount:S.players.length)+'</span>':'')+"</button>"
  ).join("");
  document.getElementById("blurTgl").checked = !!S.ui.blur;
  document.getElementById("soundTgl").checked = !!S.ui.sound;
}

function go(tab){ if(!S || backend!=='cloud')return; S.ui.tab = tab; save(); render(); window.scrollTo(0,0); }

/* ============================================================
   7. SETUP VIEW — players, economy config, sets, card designs
   ============================================================ */

function viewSetup(){
  const cfg = S.config;
  const h = standardHit(expectedBudget(cfg), cfg.targetHits, cfg.packCost, cfg.failRefund);
  const set = currentSet();
  let html = '<div class="title"><h1>Setup</h1><p>Everything the host needs before a set opens: the roster, the economy snapshot, and ' +
    cfg.cardsPerPlayer + ' requests per person. Nothing here is public — the auction is where the group starts looking.</p></div>';
  html += noticeHtml();
  html += '<div class="notice info"><b>Saving to the shared online table.</b> Use Export backup periodically to keep a portable copy.</div>';

  // --- roster ---
  html += '<div class="split">';
  html += '<div class="panel"><h2>Roster</h2>';
  html += '<div class="row" style="margin-bottom:12px"><input id="newPlayer" placeholder="Name, e.g. Alan" style="flex:1;min-width:150px">' +
          '<button class="primary" data-act="addPlayer">Add player</button></div>';
  if(!S.players.length){
    html += '<div class="empty">Add the friends who are playing.</div>';
  } else {
    html += '<div class="tablewrap"><table><thead><tr><th>Player</th><th class="num">Credits</th><th class="num">Cards</th><th></th></tr></thead><tbody>';
    for(const p of S.players){
      const owned = S.instances.filter(i => i.ownerId === p.id && i.state !== "CONSUMED").length;
      html += "<tr><td><b>" + esc(p.name) + "</b></td>" +
        '<td class="num">' + p.credits + "</td>" +
        '<td class="num">' + owned + "</td>" +
        '<td class="num"><button class="ghost" data-act="renamePlayer" data-id="' + p.id + '">Rename</button> ' +
        '<button class="danger" data-act="removePlayer" data-id="' + p.id + '">Remove</button></td></tr>';
    }
    html += "</tbody></table></div>";
  }
  html += '<div class="row" style="margin-top:12px"><button data-act="demo">Load 8-friend demo</button>' +
          '<button data-act="exportJson">Export backup</button>' +
          '<button data-act="importJson">Import backup</button><button data-act="restorePrevious">Restore previous table</button>' +
          '<button class="danger" data-act="wipe">Wipe everything</button></div>';
  html += "</div>";

  // --- economy ---
  html += '<div class="panel"><h2>Economy</h2><p><small>Applies to sets created from now on. Each set freezes its own copy, so old odds never move.</small></p>';
  html += '<div class="cfg">';
  for(const k in DEFAULTS){
    const step = (k === "legacyTrigger") ? "0.01" : (k === "scarcityExponent" || k === "boostBase" || k === "legacyAgeExponent") ? "0.1" : "1";
    html += "<label>" + esc(CFG_LABELS[k] || k) +
      '<input type="number" step="' + step + '" data-cfg="' + k + '" value="' + cfg[k] + '"></label>';
  }
  html += "</div>";
  html += '<div class="notice info" style="margin-top:6px">Derived Standard hit rate <b>h = T(C&minus;F)/(B&minus;TF) = ' +
     pct(h, 4) + "</b> &nbsp;(" + oneIn(h) + " packs) &middot; expected budget B = " + expectedBudget(cfg) + " C</div>";
  html += "</div></div>";

  // --- sets ---
  html += '<div class="panel"><div class="row"><h2 style="margin:0">Sets</h2><span class="spacer"></span>' +
    '<input id="setName" placeholder="Set name" style="width:190px"><button class="primary" data-act="createSet">Create set</button></div>';
  if(!S.sets.length){
    html += '<div class="empty" style="margin-top:12px">No sets yet. Create one once the roster is complete.</div>';
  } else {
    html += '<div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Set</th><th>State</th><th class="num">Players</th><th class="num">Designs</th><th></th></tr></thead><tbody>';
    for(const s of S.sets.slice().reverse()){
      const cls = s.state === "LIVE" ? "pill live" : (s.state === "BIDDING" || s.state === "DEFENSE") ? "pill hot" : "pill";
      // Participation is derived from who actually has requests, and is only
      // frozen onto the set when the auction opens. Before that, count authors.
      const roster = s.participants.length
        ? s.participants.length
        : new Set(s.designs.map(d => d.authorId)).size;
      html += "<tr><td><b>Set " + s.ordinal + "</b> &middot; " + esc(s.name) + "</td>" +
        '<td><span class="' + cls + '">' + s.state + "</span></td>" +
        '<td class="num">' + roster +
          (s.participants.length ? "" : ' <small style="color:var(--dim)">so far</small>') + "</td>" +
        '<td class="num">' + s.designs.length + "</td>" +
        '<td class="num"><button data-act="selectSet" data-id="' + s.id + '">' +
          (set && set.id === s.id ? "Selected" : "Select") + "</button>" +
        (s.state === "LIVE" ? ' <button data-act="closeSet" data-id="' + s.id + '">Close set</button>' : "") +
        (s.state === "DRAFT" ? ' <button class="danger" data-act="deleteSet" data-id="' + s.id + '">Delete</button>' : "") +
        "</td></tr>";
    }
    html += "</tbody></table></div>";
  }
  html += "</div>";

  // --- designs for selected set ---
  if(set){
    html += '<div class="panel"><h2>Requests in Set ' + set.ordinal + " &middot; " + esc(set.name) + "</h2>";
    if(set.state !== "DRAFT"){
      html += '<div class="notice info">This set has left DRAFT, so its designs are locked.</div>';
    } else {
      html += '<p><small>Add exactly ' + set.config.cardsPerPlayer + ' requests per participating player. A player with no designs is not a participant.</small></p>';
      html += '<div class="split"><div>';
      html += '<div class="row" style="margin-bottom:10px">';
      html += '<select id="dAuthor" style="width:auto;min-width:150px">' +
        S.players.map(p => '<option value="' + p.id + '">' + esc(p.name) + "</option>").join("") + "</select>";
      html += '<input id="dTitle" placeholder="PUBLIC SHAME" style="flex:1;min-width:150px"></div>';
      html += '<label>Meme line<input id="dMeme" placeholder="Said he has no shame. Market decided to verify."></label>';
      html += '<label>The actual request<textarea id="dRequest" placeholder="What the owner may make this person do."></textarea></label>';
      html += '<label>Scope &amp; limits<textarea id="dLimits" placeholder="Nothing dangerous, illegal, or expensive."></textarea></label>';
      html += '<button class="primary" data-act="addDesign">Add request</button>';
      html += "</div><div>";
      html += "<h3>Per player</h3>";
      const per = {};
      for(const d of set.designs) per[d.authorId] = (per[d.authorId] || 0) + 1;
      html += '<div class="tablewrap"><table><tbody>';
      for(const p of S.players){
        const n = per[p.id] || 0;
        const ok = n === set.config.cardsPerPlayer;
        html += "<tr><td>" + esc(p.name) + "</td>" +
          '<td class="num" style="color:' + (ok ? "var(--good)" : n > set.config.cardsPerPlayer ? "var(--bad)" : "var(--dim)") + '">' +
          n + " / " + set.config.cardsPerPlayer + "</td></tr>";
      }
      html += "</tbody></table></div>";
      html += '<div class="row" style="margin-top:12px"><button class="primary big" data-act="openBidding">Open the auction &rarr;</button></div>';
      html += "</div></div>";
    }
    if(set.designs.length){
      html += '<div class="designs" style="margin-top:16px">';
      for(const d of set.designs){
        html += '<div class="design"><div class="who">' + esc(playerName(d.authorId)) + "</div>" +
          "<h3>" + esc(d.title) + "</h3><p>" + esc(d.meme) + "</p>" +
          "<details><summary>Request &amp; limits</summary><p>" + esc(d.request) + "</p><small>" + esc(d.limits) + "</small></details>" +
          (set.state === "DRAFT" ? '<button class="x danger" data-act="delDesign" data-id="' + d.id + '">&times;</button>' : "") +
          "</div>";
      }
      html += "</div>";
    }
    html += "</div>";
  }
  return html;
}

/* ============================================================
   8. AUCTION VIEW — sealed desire bidding, defense, reveal
   ============================================================ */

function viewAuction(){
  const set = currentSet();
  if(!set) return '<div class="title"><h1>Auction</h1></div><div class="empty">Create a set in Setup first.</div>';

  let html = '<div class="title"><h1>Auction &middot; Set ' + set.ordinal + "</h1>" +
    "<p>Every player gets " + set.config.desireBudget + " Desire Tokens and spends them on other people's requests. " +
    "Tokens spent here cannot be spent elsewhere — that opportunity cost <em>is</em> the price signal. " +
    "Nothing is revealed until the market closes.</p></div>";
  html += noticeHtml();

  if(set.state === "DRAFT")   return html + '<div class="empty">This set is still in DRAFT. Finish the requests in Setup, then press <b>Open the auction</b>.</div>';
  if(set.state === "LIVE" || set.state === "CLOSED"){
    return html + '<div class="notice">Market closed and frozen. Head to <b>Public Market</b> for the full breakdown, or <b>Shop</b> to start opening packs.</div>' + revealSummary(set);
  }
  if(set.state === "BIDDING") return html + biddingPanel(set);
  if(set.state === "DEFENSE") return html + defensePanel(set);
  return html;
}

function biddingPanel(set){
  const budget = set.config.desireBudget;
  const ids = set.participants;
  let who = S.ui.acting;
  if(ids.indexOf(who) < 0) who = ids[0];

  let html = '<div class="panel"><div class="row"><b>Hand the machine to each player in turn.</b>' +
    '<span class="spacer"></span><small>' + ids.filter(i => set.locked[i]).length + " of " + ids.length + " locked</small></div>";
  html += '<div class="chips" style="margin-top:12px">';
  for(const id of ids){
    html += '<div class="chip ' + (set.locked[id] ? "done " : "") + (id === who ? "on" : "") + '" data-act="pickBidder" data-id="' + id + '">' +
      '<span class="dot"></span><b>' + esc(playerName(id)) + "</b>" +
      "<s>" + (set.locked[id] ? "locked" : "waiting") + "</s></div>";
  }
  html += "</div>";
  const allLocked = ids.every(i => set.locked[i]);
  html += '<div class="row"><button class="primary big" data-act="closeBidding"' + (allLocked ? "" : " disabled") + ">Close bidding &rarr; Defense</button>" +
    "<button data-act=\"forceCloseBidding\">Close anyway (missing players bid 0)</button></div>";
  html += "</div>";

  if(!who) return html;
  const mine = set.bids[who] || {};
  let spent = 0;
  for(const k in mine) spent += mine[k] || 0;
  const eligible = set.designs.filter(d => d.authorId !== who);

  html += '<div class="allocbar"><div class="n maskable"><b>' + spent + "</b><span>spent</span></div>" +
    '<div class="track"><i style="width:' + Math.min(100, spent / budget * 100) + '%"></i></div>' +
    '<div class="n maskable"><b>' + (budget - spent) + "</b><span>left</span></div>" +
    '<button class="primary" data-act="lockBid" data-id="' + who + '"' + (spent === budget ? "" : " disabled") + ">" +
    (set.locked[who] ? "Locked ✓ — relock" : "Lock " + esc(playerName(who)) + "'s allocation") + "</button>" +
    '<button data-act="clearBid" data-id="' + who + '">Clear</button></div>';

  html += '<div class="alloclist">';
  for(const d of eligible){
    const v = mine[d.id] || 0;
    html += '<div class="alloc' + (v > 0 ? " set" : "") + '">' +
      '<div class="who">' + esc(playerName(d.authorId)) + "</div>" +
      "<h3>" + esc(d.title) + '</h3><div class="meme">' + esc(d.meme) + "</div>" +
      '<div class="req">' + esc(d.request) + "</div>" +
      '<div class="ctl"><input type="range" min="0" max="' + budget + '" value="' + v + '" data-bid="' + d.id + '">' +
      '<input class="maskable" type="number" min="0" max="' + budget + '" value="' + v + '" data-bid="' + d.id + '"></div></div>';
  }
  html += "</div>";
  return html;
}

function defensePanel(set){
  const budget = set.config.defenseBudget;
  const ids = set.participants;
  let who = S.ui.acting;
  if(ids.indexOf(who) < 0) who = ids[0];

  const demand = demandMap(set);
  let html = '<div class="panel"><div class="row"><b>Defense: each author decides which of their own promises stays hardest to reach.</b></div>' +
    '<p><small>Authors see how much desire each of their own cards attracted, never who bid or how much any individual bid. ' +
    'A bid breaches only when it is <em>strictly greater</em> than the defense on that card. Defense never changes author income or global scarcity — only privileged pack access.</small></p>';
  html += '<div class="chips" style="margin-top:8px">';
  for(const id of ids){
    html += '<div class="chip ' + (set.defLocked[id] ? "done " : "") + (id === who ? "on" : "") + '" data-act="pickBidder" data-id="' + id + '">' +
      '<span class="dot"></span><b>' + esc(playerName(id)) + "</b><s>" + (set.defLocked[id] ? "locked" : "waiting") + "</s></div>";
  }
  html += "</div>";
  html += '<div class="row"><button class="primary big" data-act="finalize">Reveal &amp; finalize the market</button>' +
    '<button data-act="skipDefense">Skip defense entirely (all zero)</button></div>';
  html += "</div>";

  if(!who) return html;
  const own = set.designs.filter(d => d.authorId === who);
  let authorTotal = 0;
  for(const d of own) authorTotal += demand[d.id] || 0;
  let spent = 0;
  for(const d of own) spent += set.defense[d.id] || 0;

  html += '<div class="allocbar"><div class="n"><b>' + spent + "</b><span>defended</span></div>" +
    '<div class="track def"><i style="width:' + Math.min(100, spent / budget * 100) + '%"></i></div>' +
    '<div class="n"><b>' + (budget - spent) + "</b><span>left</span></div>" +
    '<button class="primary" data-act="lockDefense" data-id="' + who + '"' + (spent === budget ? "" : " disabled") + ">" +
    (set.defLocked[who] ? "Locked ✓ — relock" : "Lock defense") + "</button></div>";

  html += '<div class="alloclist">';
  for(const d of own){
    const v = set.defense[d.id] || 0;
    const dem = demand[d.id] || 0;
    const share = authorTotal ? dem / authorTotal : 0;
    html += '<div class="alloc' + (v > 0 ? " set" : "") + '">' +
      '<div class="who">Your card</div><h3>' + esc(d.title) + "</h3>" +
      '<div class="meme">' + esc(d.meme) + "</div>" +
      '<div class="req">Aggregate desire <b style="color:var(--accent2)">' + dem + "</b> &middot; " +
      (share * 100).toFixed(0) + "% of your set</div>" +
      '<div class="ctl"><input type="range" min="0" max="' + budget + '" value="' + v + '" data-def="' + d.id + '">' +
      '<input type="number" min="0" max="' + budget + '" value="' + v + '" data-def="' + d.id + '"></div></div>';
  }
  html += "</div>";
  return html;
}

function demandMap(set){
  const demand = {};
  for(const d of set.designs) demand[d.id] = 0;
  for(const bidder in set.bids){
    const row = set.bids[bidder];
    for(const id in row) if(demand[id] != null) demand[id] += row[id] || 0;
  }
  return demand;
}

function revealSummary(set){
  if(!set.snapshot) return "";
  const s = set.snapshot;
  let html = '<div class="metrics">' +
    metric("Total desire", s.totalDemand, "Tokens actually spent") +
    metric("Average / card", s.avgCard.toFixed(2), "Scarcity baseline") +
    metric("Average / author", s.avgAuthor.toFixed(2), "Reward baseline") +
    metric("Standard hit", pct(s.standard.hit, 3), oneIn(s.standard.hit) + " packs") +
    metric("Reward pool", s.rewardPool + " C", "Paid to authors") +
    "</div>";
  return html;
}
function metric(label, value, sub){
  return '<div class="metric"><span>' + esc(label) + "</span><b>" + esc(String(value)) + "</b><small>" + esc(sub) + "</small></div>";
}

/* ============================================================
   10. SHOP VIEW + the opening animation
   ============================================================ */

function viewShop(){
  const a = acting();
  const set = liveSet();
  let html = '<div class="title"><h1>Shop</h1><p>Nothing here is guaranteed. The chances below are the ones frozen when the market closed, and the reel really does land on the rolled result.</p></div>';
  html += noticeHtml();
  if(!a) return html + '<div class="empty">Add players first.</div>';

  const myPacks = S.packs.filter(p => p.ownerId === a.id && !p.opened);

  html += '<div class="shopgrid"><div class="panel">';
  html += '<div class="eyebrow">Standard Pack</div>';
  if(!set){
    html += '<div class="empty">No set is LIVE. Finalize the auction first.</div>';
  } else {
    const o = set.snapshot.standard;
    const cfg = set.config;
    html += '<div class="packart"><span>STANDARD</span><b>SET ' + set.ordinal + "</b></div>";
    html += '<div class="oddsline"><span>Request card <b>' + pct(o.hit, 2) + "</b></span>" +
      "<span>No card, +" + cfg.failRefund + " C <b>" + pct(o.fail, 2) + "</b></span></div>";
    html += '<button class="primary big" data-act="buyStandard" style="width:100%"' +
      (a.credits < cfg.packCost ? " disabled" : "") + ">Open for " + cfg.packCost + " Credits</button>";
    html += "<p style=\"margin-top:10px\"><small>" + esc(a.name) + " holds " + a.credits + " C &middot; " +
      Math.floor(a.credits / cfg.packCost) + " packs affordable</small></p>";
    html += "<details open><summary>Exact card chances (" + set.designs.length + " designs)</summary>" +
      oddsTable(o, set) + "</details>";
  }
  html += "</div>";

  html += '<div class="panel"><div class="eyebrow">' + esc(a.name) + "'s unopened packs</div>";
  if(!myPacks.length){
    html += '<div class="empty">No special packs waiting. Breach someone\'s defense in the auction, or fail a Standard Pack and get lucky.</div>';
  } else {
    for(const p of myPacks){
      const src = getSet(p.setId);
      html += '<div class="packrow"><div class="grow">' +
        '<span class="ptype ' + p.type + '">' + p.type + "</span>" +
        "<h3 style=\"margin:6px 0 2px\">" + (p.authorId ? esc(playerName(p.authorId)) + " pack" : "Set " + (src ? src.ordinal : "?") + " legacy") + "</h3>" +
        "<small>Hit " + pct(p.odds.hit, 2) + " &middot; fail +" + (p.odds.failReward || 0) + " C" +
        (p.originBidderId ? " &middot; earned by " + esc(playerName(p.originBidderId)) : "") +
        (p.tradeCount ? " &middot; traded " + p.tradeCount + "x" : "") + "</small>" +
        "<details><summary>Frozen odds</summary>" + oddsTable(p.odds, src) + "</details></div>" +
        '<button class="primary" data-act="openPack" data-id="' + p.id + '">Open &rarr;</button></div>';
    }
  }
  html += "</div></div>";
  return html;
}

function oddsTable(odds, set){
  const rows = Object.keys(odds.cards)
    .map(id => ({id: Number(id), p: odds.cards[id]}))
    .sort((a, b) => b.p - a.p);
  let html = '<div class="oddstable"><table><thead><tr><th>Outcome</th><th class="num">Chance</th><th class="num">Rate</th></tr></thead><tbody>';
  html += '<tr><td style="color:var(--dim)">No card</td><td class="num">' + pct(odds.fail, 2) + '</td><td class="num">' + oneIn(odds.fail) + "</td></tr>";
  for(const r of rows){
    const f = findDesign(r.id);
    const label = f ? esc(playerName(f.design.authorId)) + " — " + esc(f.design.title) : "#" + r.id;
    html += "<tr><td>" + label + '</td><td class="num">' + pct(r.p) + '</td><td class="num">' + oneIn(r.p) + "</td></tr>";
  }
  html += "</tbody></table></div>";
  html += '<small style="display:block;margin-top:6px">All outcomes sum to ' + oddsSum(odds).toFixed(10) + "</small>";
  return html;
}

/* ---- the reel ------------------------------------------- */

const TILE_W = 132, TILE_GAP = 12, STEP = TILE_W + TILE_GAP, WIN_INDEX = 48, TILE_COUNT = 56;
let audioCtx = null;

function tick(){
  if(!S.ui.sound) return;
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(760 + randInt(120), t);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.06);
  }catch(e){}
}

function sampleTile(odds){
  if(chance(odds.hit)) return {kind:"CARD", designId: Number(pickWeighted(odds.conditional))};
  return {kind:"FAIL"};
}

function mixRgb(from, to, t){
  const channel = i => Math.round(from[i] + (to[i] - from[i]) * t);
  return channel(0) + "," + channel(1) + "," + channel(2);
}

function relativeCardColor(designId, odds){
  // Rank within this pack from most common to rarest. Design ID is a stable
  // tie-break so exactly one card receives the golden top-card treatment.
  const ranked = Object.keys(odds.cards || {}).map(id => ({
    id: Number(id), p: Number(odds.cards[id]) || 0
  })).sort((a, b) => b.p - a.p || a.id - b.id);
  const index = ranked.findIndex(card => card.id === Number(designId));
  const last = ranked.length - 1;

  if(index === last){
    return {border:"rgb(255,215,0)", glow:"rgba(255,215,0,.38)"};
  }

  // The non-golden range runs from dark blue at the most common card to
  // neon red at the second-rarest card, with a smooth RGB transition between.
  const t = Math.max(0, Math.min(1, index / Math.max(1, ranked.length - 2)));
  const rgb = mixRgb([8,35,92], [255,20,60], t);
  return {border:"rgb(" + rgb + ")", glow:"rgba(" + rgb + "," + (.14 + t * .22).toFixed(2) + ")"};
}

function tileHtml(tile, odds){
  if(tile.kind === "FAIL"){
    return '<div class="tile fail"><div class="tw">Outcome</div><div class="tt">NO CARD</div>' +
      '<div class="tp">refund +' + (odds.failReward || 0) + " C</div></div>";
  }
  const f = findDesign(tile.designId);
  const p = odds.cards[tile.designId] || 0;
  const color = relativeCardColor(tile.designId, odds);
  return '<div class="tile" style="border-color:' + color.border + ";background:linear-gradient(160deg," + color.glow + ",#1b2130 70%)\">" +
    '<div class="tw">' + esc(f ? playerName(f.design.authorId) : "?") + "</div>" +
    '<div class="tt">' + esc(f ? f.design.title : "#" + tile.designId) + "</div>" +
    '<div class="tp">' + pct(p) + "</div></div>";
}

function showPackAnimation(result){
  if(matchMedia("(prefers-reduced-motion: reduce)").matches){ showModal(resultHtml(result)); return; }
  const odds = result.odds;
  const winner = result.outcome === "CARD"
    ? {kind:"CARD", designId: result.instance.designId}
    : {kind:"FAIL"};

  const tiles = [];
  for(let i = 0; i < TILE_COUNT; i++){
    tiles.push(i === WIN_INDEX ? winner : sampleTile(odds));
  }

  const host = document.getElementById("overlayHost");
  host.innerHTML =
    '<div class="overlay" id="packOverlay"><div class="modal reelbox">' +
      '<p class="eyebrow" style="text-align:center">' + result.type + " PACK &middot; " + esc(playerName(result.playerId)) + "</p>" +
      '<div class="reelview"><div class="reelcenter"></div>' +
        '<div class="strip" id="strip">' + tiles.map(t => tileHtml(t, odds)).join("") + "</div>" +
      "</div>" +
      '<div id="reelResult"></div>' +
    "</div></div>";

  const strip = document.getElementById("strip");
  const view = strip.parentElement;
  const jitter = randInt(70) - 35;
  const target = WIN_INDEX * STEP + TILE_W / 2 - view.clientWidth / 2 + jitter;

  const DURATION = 4.6;
  strip.style.transition = "none";
  strip.style.transform = "translateX(0px)";
  void strip.offsetWidth;
  strip.style.transition = "transform " + DURATION + "s cubic-bezier(.11,.72,.09,1)";
  strip.style.transform = "translateX(" + (-target) + "px)";

  // ticks read the real transform each frame, so they stay in sync with the easing
  let last = -1, running = true, settled = false;
  (function frame(){
    if(!running) return;
    const m = new DOMMatrixReadOnly(getComputedStyle(strip).transform);
    const idx = Math.floor((-m.m41 + view.clientWidth / 2) / STEP);
    if(idx !== last){ last = idx; tick(); }
    requestAnimationFrame(frame);
  })();

  // The result must appear even if the transition never completes — a background
  // tab, a reduced-motion setting or a throttled renderer can all swallow
  // transitionend, and the outcome is already decided either way.
  function settle(){
    if(settled) return;
    settled = true;
    running = false;
    strip.style.transition = "none";
    strip.style.transform = "translateX(" + (-target) + "px)";
    const host = document.getElementById("reelResult");
    if(host){ host.innerHTML = resultHtml(result); improveAccessibility(host); }
    activeReelSettle = null;
  }
  strip.addEventListener("transitionend", settle, {once:true});
  setTimeout(settle, DURATION * 1000 + 400);
  activeReelSettle = settle;
  activateDialog();
  view.addEventListener("click", settle);   // click the reel to skip
}

function resultHtml(result){
  let html = '<div class="result">';
  if(result.outcome === "CARD"){
    const i = result.instance;
    const f = findDesign(i.designId);
    html += "<h2>" + esc(f ? f.design.title : "Card") + "</h2>";
    html += '<p style="color:var(--accent2)">' + esc(f ? playerName(f.design.authorId) : "") + "</p>";
    html += '<div class="serial"><b>' + floatText(i.floatValue) + "</b><b>&#8470; " + catalogText(i.catalog) + "</b></div>";
    html += "<small>Pulled at " + pct(result.odds.cards[i.designId] || 0) + " &middot; " + oneIn(result.odds.cards[i.designId] || 0) + " packs</small>";
  } else {
    html += '<h2 style="color:var(--dim)">No card this time.</h2>';
    html += "<p>Refund +" + (result.refund || 0) + " Credits</p>";
  }
  if(result.legacy){
    const src = getSet(result.legacy.setId);
    html += '<div class="legacyflash"><b>Legacy drop.</b> A sealed Set ' + (src ? src.ordinal : "?") +
      " pack fell out of the wrapper. It is waiting in the Shop.</div>";
  }
  html += '<div class="row" style="justify-content:center;margin-top:16px">' +
    '<button class="primary big" data-act="closeOverlay">Continue</button></div></div>';
  return html;
}

/* ============================================================
   11. PUBLIC MARKET VIEW — the shared board
   ============================================================ */

function viewMarket(){
  const set = currentSet();
  let html = '<div class="title"><h1>Public Market</h1><p>What the group actually wanted, and what that did to scarcity. This is the screen to share while explaining the set.</p></div>';
  html += noticeHtml();

  if(S.sets.length > 1){
    html += '<div class="row" style="margin-bottom:14px"><label style="margin:0">Set<select data-act="setSelect" style="width:auto">' +
      S.sets.slice().reverse().map(s => '<option value="' + s.id + '"' + (set && s.id === set.id ? " selected" : "") + ">Set " + s.ordinal + " — " + esc(s.name) + "</option>").join("") +
      "</select></label></div>";
  }
  if(!set) return html + '<div class="empty">No sets yet.</div>';
  if(!set.snapshot) return html + '<div class="empty">Set ' + set.ordinal + " has not been revealed yet. Bids stay sealed until the market closes.</div>" + tradingPost();

  const s = set.snapshot;
  const cfg = set.config;
  html += revealSummary(set);

  // authors
  html += '<div class="panel"><h2>Authors</h2><p><small>Income comes only from raw desire. Defense never adds a single Credit.</small></p><div class="tablewrap"><table>' +
    '<thead><tr><th>Player</th><th class="num">Desire D<sub>a</sub></th><th>Share</th><th class="num">Reward R<sub>a</sub></th><th class="num">Bidder hit h<sub>a</sub></th><th class="num">Copies out</th></tr></thead><tbody>';
  const authors = set.participants.slice().sort((a, b) => (s.authorDemand[b] || 0) - (s.authorDemand[a] || 0));
  for(const id of authors){
    const dem = s.authorDemand[id] || 0;
    const share = s.totalDemand ? dem / s.totalDemand : 0;
    const copies = S.instances.filter(i => i.setId === set.id && i.state !== "CONSUMED" &&
      (design(set.id, i.designId) || {}).authorId === id).length;
    html += "<tr><td><b>" + esc(playerName(id)) + "</b></td>" +
      '<td class="num">' + dem + "</td>" +
      '<td style="min-width:120px"><div class="dbar" style="width:' + (share * 100).toFixed(1) + '%"></div></td>' +
      '<td class="num" style="color:var(--gold)">' + (s.rewards[id] || 0) + " C</td>" +
      '<td class="num">' + pct(s.authorHit[id] || 0, 1) + "</td>" +
      '<td class="num">' + copies + "</td></tr>";
  }
  html += "</tbody></table></div></div>";

  // cards
  const sort = S.ui.marketSort || "demand";
  const rows = set.designs.map(d => {
    const dem = s.demand[d.id] || 0;
    return {
      d, dem,
      share: s.totalDemand ? dem / s.totalDemand : 0,
      sc: s.scarcity[d.id] || 0,
      p: s.standard.cards[d.id] || 0,
      copies: S.instances.filter(i => i.designId === d.id && i.state !== "CONSUMED").length
    };
  });
  rows.sort((a, b) => {
    if(sort === "chance") return b.p - a.p;
    if(sort === "title")  return a.d.title.localeCompare(b.d.title);
    if(sort === "author") return playerName(a.d.authorId).localeCompare(playerName(b.d.authorId));
    if(sort === "copies") return b.copies - a.copies;
    return b.dem - a.dem;
  });
  const maxDem = rows.reduce((m, r) => Math.max(m, r.dem), 0) || 1;

  html += '<div class="panel"><h2>Every request in the set</h2><div class="tablewrap"><table><thead><tr>' +
    '<th class="sortable" data-act="sortMarket" data-key="author">Person</th>' +
    '<th class="sortable" data-act="sortMarket" data-key="title">Request</th>' +
    '<th class="num sortable" data-act="sortMarket" data-key="demand">Desire D<sub>c</sub></th>' +
    "<th>Relative</th>" +
    '<th class="num">Scarcity S<sub>c</sub></th>' +
    '<th class="num sortable" data-act="sortMarket" data-key="chance">Pack chance</th>' +
    "<th class=\"num\">Rate</th>" +
    '<th class="num sortable" data-act="sortMarket" data-key="copies">In play</th></tr></thead><tbody>';
  for(const r of rows){
    html += "<tr><td>" + esc(playerName(r.d.authorId)) + "</td>" +
      "<td><b>" + esc(r.d.title) + "</b><br><small>" + esc(r.d.meme) + "</small></td>" +
      '<td class="num">' + r.dem + "</td>" +
      '<td style="min-width:110px"><div class="dbar" style="width:' + (r.dem / maxDem * 100).toFixed(1) + '%"></div></td>' +
      '<td class="num">' + r.sc.toFixed(4) + "</td>" +
      '<td class="num" style="color:var(--gold)">' + pct(r.p) + "</td>" +
      '<td class="num"><small>' + oneIn(r.p) + "</small></td>" +
      '<td class="num">' + r.copies + "</td></tr>";
  }
  html += "</tbody></table></div>";

  html += '<details><summary>Show the math behind these numbers</summary><div class="math" style="margin-top:10px">' +
    "total desire &Sigma;D = <b>" + s.totalDemand + "</b><br>" +
    "cards M = <b>" + set.designs.length + "</b> &nbsp; players N = <b>" + set.participants.length + "</b><br>" +
    "D&#772;<sub>c</sub> = &Sigma;D / M = <b>" + s.avgCard.toFixed(4) + "</b><br>" +
    "D&#772;<sub>a</sub> = &Sigma;D / N = <b>" + s.avgAuthor.toFixed(4) + "</b><br><br>" +
    "S<sub>c</sub> = (1 + D<sub>c</sub>/D&#772;<sub>c</sub>)<sup>&minus;" + cfg.scarcityExponent + "</sup><br>" +
    "q<sub>c</sub> = S<sub>c</sub> / &Sigma;S<sub>j</sub> &nbsp;&rarr;&nbsp; P(c) = h &middot; q<sub>c</sub><br><br>" +
    "B = " + cfg.avgSetReward + " + " + cfg.weeklyRefill + "&times;" + cfg.expectedRefills + " = <b>" + expectedBudget(cfg) + "</b><br>" +
    "h = T(C&minus;F)/(B&minus;TF) = " + cfg.targetHits + "(" + cfg.packCost + "&minus;" + cfg.failRefund + ")/(" +
      expectedBudget(cfg) + "&minus;" + (cfg.targetHits * cfg.failRefund) + ") = <b>" + s.standard.hit.toFixed(10) + "</b><br>" +
    "all outcomes sum to <b>" + oddsSum(s.standard).toFixed(10) + "</b><br><br>" +
    "R<sub>a</sub> = " + cfg.avgSetReward + " &middot; D<sub>a</sub>/D&#772;<sub>a</sub> &nbsp;&rarr;&nbsp; pool = N &times; " +
      cfg.avgSetReward + " = <b>" + s.rewardPool + "</b> C exactly<br>" +
    "h<sub>a</sub> = 1 / (1 + D<sub>a</sub>/D&#772;<sub>a</sub>)<br>" +
    "e<sub>ic</sub> = b<sub>ic</sub> if b<sub>ic</sub> &gt; d<sub>c</sub>, else 0 &nbsp;&middot;&nbsp; M<sub>ic</sub> = " +
      cfg.boostBase + "<sup>e/" + cfg.desireBudget + "</sup>" +
    "</div></details>";
  html += "</div>";

  // breach board
  html += breachBoard(set);
  html += tradingPost();
  return html;
}

function breachBoard(set){
  const s = set.snapshot;
  let html = '<div class="panel"><h2>Bids, defense and breaches</h2>' +
    "<p><small>Now public. A bid breaches only when strictly greater than the defense. Blocked bids still counted toward desire and income — they just bought no personal pack weighting.</small></p>";
  html += '<div class="tablewrap"><table><thead><tr><th>Request</th><th class="num">Defense</th><th>Bids</th></tr></thead><tbody>';
  for(const d of set.designs){
    const def = set.defense[d.id] || 0;
    const bids = [];
    for(const bidder in set.bids){
      const amt = set.bids[bidder][d.id] || 0;
      if(amt > 0) bids.push({bidder: Number(bidder), amt, breached: amt > def});
    }
    bids.sort((a, b) => b.amt - a.amt);
    html += "<tr><td>" + esc(playerName(d.authorId)) + " — <b>" + esc(d.title) + "</b></td>" +
      '<td class="num">' + def + "</td><td>" +
      (bids.length ? bids.map(b =>
        '<span class="pill" style="margin-right:4px;color:' + (b.breached ? "var(--good)" : "var(--dim)") + '">' +
        esc(playerName(b.bidder)) + " " + b.amt + (b.breached ? " ⚡" : " blocked") + "</span>").join("")
        : '<small style="color:var(--dim)">no bids</small>') +
      "</td></tr>";
  }
  html += "</tbody></table></div>";
  const packs = S.packs.filter(p => p.setId === set.id && p.type === "BIDDER");
  html += "<p style=\"margin-top:10px\"><small>" + packs.length + " Original Bidder Packs were created (one per bidder per breached author). " +
    packs.filter(p => !p.opened).length + " still sealed.</small></p>";
  html += "</div>";
  return html;
}

function tradingPost(){
  const from = S.ui.tradeFrom && player(S.ui.tradeFrom) ? S.ui.tradeFrom : (S.players[0] ? S.players[0].id : null);
  if(!from) return "";
  const cards = S.instances.filter(i => i.ownerId === from && i.state !== "CONSUMED");
  const packs = S.packs.filter(p => p.ownerId === from && !p.opened);
  let html = '<div class="panel"><h2>Trading post</h2>' +
    "<p><small>The table agrees a trade out loud; the host records it here. Pack odds are frozen at creation and never change hands' worth of probability.</small></p>";
  html += '<div class="row" style="align-items:flex-end">';
  html += '<label style="margin:0">From<select data-act="tradeFrom" style="width:auto;min-width:130px">' +
    S.players.map(p => '<option value="' + p.id + '"' + (p.id === from ? " selected" : "") + ">" + esc(p.name) + "</option>").join("") + "</select></label>";
  html += '<label style="margin:0">Item<select id="tradeItem" style="width:auto;min-width:250px">' +
    '<option value="">— choose —</option>' +
    cards.map(i => {
      const f = findDesign(i.designId);
      return '<option value="card:' + i.id + '">Card #' + i.id + " · " + esc(f ? f.design.title : "?") +
        " · " + floatText(i.floatValue) + " · " + i.state + "</option>";
    }).join("") +
    packs.map(p => '<option value="pack:' + p.id + '">Pack #' + p.id + " · " + p.type +
      (p.authorId ? " · " + esc(playerName(p.authorId)) : "") + "</option>").join("") +
    "</select></label>";
  html += '<label style="margin:0">To<select id="tradeTo" style="width:auto;min-width:130px">' +
    S.players.map(p => '<option value="' + p.id + '">' + esc(p.name) + "</option>").join("") + "</select></label>";
  html += '<button class="primary" data-act="moveItem">Move item</button>';
  html += "</div>";
  html += '<div class="row" style="align-items:flex-end;margin-top:12px">';
  html += '<label style="margin:0">Credits<input id="tradeCredits" type="number" min="1" value="50" style="width:110px"></label>';
  html += '<button data-act="sendCredits">Send Credits from ' + esc(playerName(from)) + " to the 'To' player</button>";
  html += "</div></div>";
  return html;
}

/* ============================================================
   12. CARDS VIEW — collection, inspection, crafting
   ============================================================ */

function viewCards(){
  const a = acting();
  let html = '<div class="title"><h1>Cards</h1><p>Every instance ever created, with its permanent float and catalog number. Duplicate rights collide by lowest float, then lowest catalog.</p></div>';
  html += noticeHtml();

  const f = S.ui.cardFilter || {};
  const owner = f.owner == null ? (a ? String(a.id) : "ALL") : f.owner;
  const list = S.instances.filter(i => {
    if(i.state === "CONSUMED" && f.state !== "CONSUMED") return false;
    if(owner !== "ALL" && i.ownerId !== Number(owner)) return false;
    if(f.set && f.set !== "ALL" && i.setId !== Number(f.set)) return false;
    if(f.state && f.state !== "ALL" && i.state !== f.state) return false;
    if(f.q){
      const d = findDesign(i.designId);
      const text = (d ? d.design.title + " " + d.design.meme + " " + d.design.request + " " + playerName(d.design.authorId) : "").toLowerCase();
      if(text.indexOf(f.q.toLowerCase()) < 0) return false;
    }
    return true;
  });
  const sort = f.sort || "new";
  list.sort((x, y) => {
    if(sort === "float")   return x.floatValue - y.floatValue;
    if(sort === "catalog") return x.catalog - y.catalog;
    if(sort === "title"){
      const dx = findDesign(x.designId), dy = findDesign(y.designId);
      return (dx ? dx.design.title : "").localeCompare(dy ? dy.design.title : "");
    }
    return y.createdAt - x.createdAt;
  });

  html += '<div class="panel"><div class="row">';
  html += '<label style="margin:0;flex:1;min-width:170px">Search<input data-filter="q" value="' + esc(f.q || "") + '" placeholder="Title, person, request"></label>';
  html += '<label style="margin:0">Owner<select data-filter="owner"><option value="ALL">Everyone</option>' +
    S.players.map(p => '<option value="' + p.id + '"' + (owner === String(p.id) ? " selected" : "") + ">" + esc(p.name) + "</option>").join("") + "</select></label>";
  html += '<label style="margin:0">Set<select data-filter="set"><option value="ALL">All sets</option>' +
    S.sets.map(s => '<option value="' + s.id + '"' + (f.set === String(s.id) ? " selected" : "") + ">Set " + s.ordinal + "</option>").join("") + "</select></label>";
  html += '<label style="margin:0">State<select data-filter="state">' +
    ["ALL","ACTIVE","REDEEMED","CONSUMED"].map(x => '<option' + (f.state === x ? " selected" : "") + ">" + x + "</option>").join("") + "</select></label>";
  html += '<label style="margin:0">Sort<select data-filter="sort">' +
    [["new","Newest"],["float","Lowest float"],["catalog","Lowest catalog"],["title","Title"]]
      .map(x => '<option value="' + x[0] + '"' + (sort === x[0] ? " selected" : "") + ">" + x[1] + "</option>").join("") + "</select></label>";
  html += '<div style="text-align:right"><b style="font-size:22px">' + list.length + "</b><br><small>shown</small></div>";
  html += "</div></div>";

  if(!list.length){
    html += '<div class="empty">No cards match. Open a pack in the Shop, or let the host issue one from Players.</div>';
  } else {
    html += '<div class="cardgrid">';
    for(const i of list){
      html += '<div class="coll collectible celestial" data-foil data-act="inspect" data-id="'+i.id+'" style="'+visualStyle(i)+'">'+collectibleFront(i)+'</div>';
    }
    html += "</div>";
  }

  html += craftPanel();
  return html;
}

function craftPanel(){
  const a = acting();
  if(!a) return "";
  let html = '<div class="panel" style="margin-top:16px"><h2>Crafting</h2>' +
    "<p><small>Three identical ACTIVE copies convert upward into a strictly more-wanted request from the same set. " +
    "Three REDEEMED cards of yourself from one set convert into a Reclaimed Pack with no personal bidder boost.</small></p>";

  // 3x upgrade candidates
  const groups = {};
  for(const i of S.instances){
    if(i.ownerId !== a.id || i.state !== "ACTIVE") continue;
    (groups[i.designId] = groups[i.designId] || []).push(i);
  }
  const upgradable = Object.keys(groups).filter(k => groups[k].length >= 3);
  if(!upgradable.length){
    html += '<p><small style="color:var(--dim)">' + esc(a.name) + " has no set of three identical ACTIVE cards.</small></p>";
  } else {
    for(const key of upgradable){
      const d = findDesign(Number(key));
      const set = d.set;
      const src = set.snapshot ? (set.snapshot.demand[key] || 0) : 0;
      const eligible = set.snapshot
        ? set.designs.filter(x => (set.snapshot.demand[x.id] || 0) > src) : [];
      html += '<div class="packrow"><div class="grow"><b>' + esc(d.design.title) + "</b> &times;" + groups[key].length +
        "<br><small>desire " + src + " &middot; " + eligible.length + " higher-demand targets</small></div>" +
        '<button class="primary" data-act="craftUpgrade" data-id="' + key + '"' + (eligible.length ? "" : " disabled") + ">" +
        (eligible.length ? "Craft upward" : "Nothing higher") + "</button></div>";
    }
  }

  // reclaim candidates
  const bySet = {};
  for(const i of S.instances){
    if(i.ownerId !== a.id || i.state !== "REDEEMED") continue;
    const d = findDesign(i.designId);
    if(!d || d.design.authorId !== a.id) continue;
    (bySet[i.setId] = bySet[i.setId] || []).push(i);
  }
  for(const setId in bySet){
    if(bySet[setId].length < 3) continue;
    const set = getSet(setId);
    html += '<div class="packrow"><div class="grow"><b>Reclaim from Set ' + set.ordinal + "</b>" +
      "<br><small>" + bySet[setId].length + " redeemed cards of yourself</small></div>" +
      '<button class="primary" data-act="craftReclaim" data-id="' + setId + '">Reclaim a pack</button></div>';
  }
  html += "</div>";
  return html;
}

function inspectCard(id){
  const i = S.instances.find(x => x.id === Number(id));
  if(!i) return;
  const d = findDesign(i.designId);
  const set = getSet(i.setId);
  const snap = set && set.snapshot;
  const p = snap ? (snap.standard.cards[i.designId] || 0) : 0;
  let html = '<button class="x" data-act="closeOverlay">Close &times;</button>';
  html += '<p class="eyebrow">' + esc(d ? playerName(d.design.authorId) : "?") + " &middot; SET " + (set ? set.ordinal : "?") + " &middot; INSTANCE #" + i.id + "</p>";
  html += "<h1>" + esc(d ? d.design.title : "?") + "</h1>";
  html += "<p>" + esc(d ? d.design.meme : "") + "</p>";
  html += '<div class="serial"><b>' + floatText(i.floatValue) + "</b><b>&#8470; " + catalogText(i.catalog) + "</b>" +
    '<b class="state ' + i.state + '" style="font-size:13px;display:flex;align-items:center">' + i.state + "</b></div>";
  html += '<div class="split">';
  html += '<div><p class="eyebrow">The request</p><h3>' + esc(d ? d.design.request : "") + "</h3><p><small>" + esc(d ? d.design.limits : "") + "</small></p></div>";
  html += '<div><p class="eyebrow">Original market</p><table><tbody>' +
    "<tr><td>Desire</td><td class=\"num\">" + (snap ? (snap.demand[i.designId] || 0) : "—") + "</td></tr>" +
    "<tr><td>Scarcity</td><td class=\"num\">" + (snap ? (snap.scarcity[i.designId] || 0).toFixed(6) : "—") + "</td></tr>" +
    "<tr><td>Pack chance</td><td class=\"num\">" + (p ? pct(p) : "—") + "</td></tr>" +
    "<tr><td>Rate</td><td class=\"num\">" + (p ? oneIn(p) : "—") + "</td></tr>" +
    "</tbody></table></div>";
  html += "</div>";
  html += '<p class="eyebrow" style="margin-top:14px">Provenance</p><table><tbody>' +
    "<tr><td>Held by</td><td>" + esc(playerName(i.ownerId)) + "</td></tr>" +
    "<tr><td>First pulled by</td><td>" + esc(playerName(i.pullerId)) + "</td></tr>" +
    "<tr><td>Source</td><td>" + esc(i.source) + "</td></tr>" +
    "<tr><td>Created</td><td>" + when(i.createdAt) + "</td></tr>" +
    "<tr><td>Times traded</td><td>" + i.tradeCount + "</td></tr>" +
    (i.note ? "<tr><td>Note</td><td>" + esc(i.note) + "</td></tr>" : "") +
    "</tbody></table>";
  if(i.state === "ACTIVE" || i.state === "REDEEMED"){
    html += '<div class="row" style="margin-top:16px">';
    if(i.state === "ACTIVE")   html += '<button class="primary" data-act="redeemCard" data-id="' + i.id + '">Mark the promise redeemed</button>';
    if(i.state === "REDEEMED") html += '<button data-act="unredeemCard" data-id="' + i.id + '">Return to ACTIVE</button>';
    html += "</div>";
  }
  showModal(wrapCardInspection(i,html));
}

let activeReelSettle = null;
function showModal(inner){
  document.getElementById("overlayHost").innerHTML =
    '<div class="overlay"><div class="modal">' + inner + "</div></div>";
  activateDialog();
}
function closeOverlay(){
  if(activeReelSettle){ activeReelSettle(); return; }
  document.getElementById("overlayHost").innerHTML = "";
  releaseDialog();
}

/* ============================================================
   13. PLAYERS VIEW — wallets, weekly rewards, ledger
   ============================================================ */

function viewPlayers(){
  let html = '<div class="title"><h1>Players</h1><p>Wallets, the weekly reward button, and the full Credit ledger. Every movement is recorded with a reason.</p></div>';
  html += noticeHtml();
  if(!S.players.length) return html + '<div class="empty">Add players in Setup.</div>';

  const last = S.weekly[0];
  html += '<div class="panel"><div class="row"><div style="flex:1;min-width:240px">' +
    '<p class="eyebrow">Weekly reward</p><h2 style="margin:0">Give everyone +' + S.config.weeklyRefill + " Credits</h2>" +
    "<p style=\"margin:6px 0 0\"><small>Nothing runs on a timer. Press this once per real week, when the group agrees it is due.<br>" +
    "<b>Last pressed:</b> " + (last ? when(last.at) + " — " + last.count + " players, +" + last.amount + " C each" : "never") +
    "</small></p></div>" +
    '<button class="primary big" data-act="weekly">Distribute weekly reward</button></div></div>';

  html += '<div class="panel"><h2>Wallets</h2><div class="tablewrap"><table><thead><tr>' +
    "<th>Player</th><th class=\"num\">Credits</th><th class=\"num\">Cards</th><th class=\"num\">Redeemed</th>" +
    '<th class="num">Sealed packs</th><th></th></tr></thead><tbody>';
  for(const p of S.players){
    const cards = S.instances.filter(i => i.ownerId === p.id && i.state === "ACTIVE").length;
    const red   = S.instances.filter(i => i.ownerId === p.id && i.state === "REDEEMED").length;
    const packs = S.packs.filter(x => x.ownerId === p.id && !x.opened).length;
    html += "<tr><td><b>" + esc(p.name) + "</b></td>" +
      '<td class="num" style="color:var(--gold)">' + p.credits + "</td>" +
      '<td class="num">' + cards + '</td><td class="num">' + red + '</td><td class="num">' + packs + "</td>" +
      '<td class="num"><button data-act="adjust" data-id="' + p.id + '">Adjust Credits</button> ' +
      '<button data-act="issueCard" data-id="' + p.id + '">Issue a card</button></td></tr>';
  }
  html += "</tbody></table></div></div>";

  html += historyControls();
  html += '<div class="split"><div class="panel"><h2>Credit ledger</h2><div class="tablewrap" style="max-height:420px;overflow:auto"><table>' +
    '<thead><tr><th>When</th><th>Player</th><th class="num">Delta</th><th class="num">After</th><th>Type</th></tr></thead><tbody>';
  for(const l of filteredHistory("ledger")){
    html += "<tr><td><small>" + when(l.at) + "</small></td><td>" + esc(playerName(l.playerId)) + "</td>" +
      '<td class="num" style="color:' + (l.delta >= 0 ? "var(--good)" : "var(--bad)") + '">' + (l.delta >= 0 ? "+" : "") + l.delta + "</td>" +
      '<td class="num">' + l.after + "</td><td><small>" + esc(l.type) + (l.note ? " · " + esc(l.note) : "") + "</small></td></tr>";
  }
  if(!filteredHistory("ledger").length) html += '<tr><td colspan="5"><small>No matching entries.</small></td></tr>';
  html += "</tbody></table></div></div>";

  html += '<div class="panel"><h2>Table log</h2><div style="max-height:420px;overflow:auto">';
  if(!filteredHistory("log").length) html += "<small>No matching entries.</small>";
  for(const e of filteredHistory("log")){
    html += '<div style="padding:6px 0;border-bottom:1px solid #1c2331"><small style="color:var(--dim)">' +
      when(e.at) + "</small><br>" + esc(e.text) + "</div>";
  }
  html += "</div></div></div>";
  return html;
}

