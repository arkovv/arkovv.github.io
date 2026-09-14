/* ============================================================
   14. ACTIONS
   ============================================================ */

const ACTIONS = {
  addPlayer(){
    const el = document.getElementById("newPlayer");
    const name = (el.value || "").trim();
    if(!name) return say("Type a name first.", "err");
    if(S.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return say("That name is taken.", "err");
    S.players.push({id: nextId("player"), name, credits: 0});
    logEvent(name + " joined the table.");
  },
  renamePlayer(id){
    const p = player(id); if(!p) return;
    const name = prompt("New name for " + p.name + ":", p.name);
    if(name && name.trim()) p.name = name.trim();
  },
  removePlayer(id){
    const p = player(id); if(!p) return;
    const used = S.instances.some(i => i.ownerId === p.id) ||
                 S.sets.some(s => s.participants.indexOf(p.id) >= 0);
    if(used && !confirm(p.name + " already has history in this game. Remove anyway? Their cards stay but become ownerless.")) return;
    S.players = S.players.filter(x => x.id !== p.id);
    if(S.ui.acting === p.id) S.ui.acting = S.players[0] ? S.players[0].id : null;
  },
  createSet(){
    const el = document.getElementById("setName");
    const name = (el.value || "").trim() || "Set " + (S.sets.length + 1);
    if(S.players.length < 2) return say("Add at least two players first.", "err");
    const ordinal = S.sets.reduce((m, s) => Math.max(m, s.ordinal), 0) + 1;
    const set = newSet(ordinal, name, S.config);
    S.sets.push(set);
    S.ui.setId = set.id;
    logEvent("Set " + ordinal + " created: " + name + ".");
    say("Set " + ordinal + " created. Add " + set.config.cardsPerPlayer + " requests per player.");
  },
  selectSet(id){ S.ui.setId = Number(id); },
  deleteSet(id){
    const s = getSet(id); if(!s || s.state !== "DRAFT") return;
    if(!confirm("Delete Set " + s.ordinal + "?")) return;
    S.sets = S.sets.filter(x => x.id !== s.id);
    if(S.ui.setId === s.id) S.ui.setId = null;
  },
  closeSet(id){
    const s = getSet(id); if(!s) return;
    if(!confirm("Close Set " + s.ordinal + "? Its packs stop being sold and it becomes eligible as a Legacy source.")) return;
    needsBackup++;
    s.state = "CLOSED";
    logEvent("Set " + s.ordinal + " closed.");
  },
  addDesign(){
    const set = currentSet();
    if(!set || set.state !== "DRAFT") return say("Pick a DRAFT set first.", "err");
    const authorId = Number(document.getElementById("dAuthor").value);
    const title = (document.getElementById("dTitle").value || "").trim();
    const request = (document.getElementById("dRequest").value || "").trim();
    if(!title || !request) return say("A title and an actual request are required.", "err");
    const have = set.designs.filter(d => d.authorId === authorId).length;
    if(have >= set.config.cardsPerPlayer) return say(playerName(authorId) + " already has " + have + " requests.", "err");
    set.designs.push({
      id: nextId("design"), authorId, title,
      meme: (document.getElementById("dMeme").value || "").trim(),
      request,
      limits: (document.getElementById("dLimits").value || "").trim() || "Reasonable, safe, legal, and within the agreed scope."
    });
    ["dTitle","dMeme","dRequest","dLimits"].forEach(k => { document.getElementById(k).value = ""; });
  },
  delDesign(id){
    const set = currentSet(); if(!set || set.state !== "DRAFT") return;
    set.designs = set.designs.filter(d => d.id !== Number(id));
  },
  openBidding(){
    const set = currentSet();
    if(!set || set.state !== "DRAFT") return say("No DRAFT set selected.", "err");
    const K = set.config.cardsPerPlayer;
    const per = {};
    for(const d of set.designs) per[d.authorId] = (per[d.authorId] || 0) + 1;
    const participants = Object.keys(per).map(Number);
    if(participants.length < 2) return say("At least two people need requests in the set.", "err");
    const bad = participants.filter(id => per[id] !== K);
    if(bad.length) return say("Wrong request count for: " + bad.map(playerName).join(", ") + " (need exactly " + K + ").", "err");
    set.participants = participants;
    set.state = "BIDDING";
    set.bids = {}; set.locked = {}; set.defense = {}; set.defLocked = {};
    for(const id of participants) set.bids[id] = {};
    S.ui.setId = set.id;
    S.ui.acting = participants[0];
    S.ui.tab = "auction";
    logEvent("Set " + set.ordinal + " auction opened for " + participants.length + " players.");
    say("Auction open. Hand the machine to each player in turn.");
  },
  pickBidder(id){ S.ui.acting = Number(id); },
  lockBid(id){
    const set = currentSet();
    const total = sumBids(set, id);
    if(total !== set.config.desireBudget) return say("Allocation must total exactly " + set.config.desireBudget + ".", "err");
    set.locked[id] = true;
    const next = set.participants.find(p => !set.locked[p]);
    if(next) S.ui.acting = next;
    say(playerName(id) + "'s allocation is sealed." + (next ? " Next: " + playerName(next) + "." : " Everyone is in."));
  },
  clearBid(id){
    const set = currentSet();
    set.bids[id] = {};
    set.locked[id] = false;
  },
  closeBidding(){ closeBiddingInner(false); },
  forceCloseBidding(){ closeBiddingInner(true); },
  skipDefense(){
    const set = currentSet();
    if(!set || set.state !== "DEFENSE") return;
    if(!confirm("Skip defense for everyone? Every card is left undefended, so any bid above zero breaches.")) return;
    const previousDefense = {...set.defense}, previousLocks = {...set.defLocked};
    set.defense = {};
    for(const d of set.designs) set.defense[d.id] = 0;
    for(const id of set.participants) set.defLocked[id] = true;
    ACTIONS.finalize();
    if(set.state === "DEFENSE"){ set.defense=previousDefense; set.defLocked=previousLocks; }
  },
  lockDefense(id){
    const set = currentSet();
    const own = set.designs.filter(d => d.authorId === Number(id));
    let total = 0;
    for(const d of own) total += set.defense[d.id] || 0;
    if(total !== set.config.defenseBudget) return say("Defense must total exactly " + set.config.defenseBudget + ".", "err");
    set.defLocked[id] = true;
    const next = set.participants.find(p => !set.defLocked[p]);
    if(next) S.ui.acting = next;
    say(playerName(id) + "'s defense is locked.");
  },
  finalize(){
    const set = currentSet();
    if(!set || set.state !== "DEFENSE") return say("Close bidding first.", "err");
    if(!confirm(revealPreview(set))) return;
    for(const d of set.designs) if(set.defense[d.id] == null) set.defense[d.id] = 0;
    needsBackup++;
    const err = finalizeMarket(set);
    if(err) return say(err, "err");
    S.ui.tab = "market";
    say("Market revealed and frozen. Rewards paid and bidder packs created.");
  },
  setSelect(id, el){ S.ui.setId = Number(el.value); },
  sortMarket(id, el){ S.ui.marketSort = el.getAttribute("data-key"); },
  buyStandard(){
    const a = acting();
    if(!a) return say("Choose who is buying.", "err");
    const r = rollStandard(a.id);
    if(r.error) return say(r.error, "err");
    save();
    render();
    showPackAnimation(r);
    return "skipRender";
  },
  openPack(id){
    const a = acting();
    const r = openPack(id, a.id);
    if(r.error) return say(r.error, "err");
    save();
    render();
    showPackAnimation(r);
    return "skipRender";
  },
  closeOverlay(){ closeOverlay(); },
  inspect(id){ inspectCard(id); return "skipRender"; },
  redeemCard(id){
    const i = S.instances.find(x => x.id === Number(id)); if(!i) return;
    const note = prompt("What actually happened? (kept on the card forever)", i.note || "");
    if(note === null) return;
    i.state = "REDEEMED"; i.note = note;
    logEvent(playerName(i.ownerId) + " redeemed " + designText(i.designId) + ".");
    closeOverlay();
    say("Promise marked redeemed. The collectible survives; the right is spent.");
  },
  unredeemCard(id){
    const i = S.instances.find(x => x.id === Number(id)); if(!i) return;
    i.state = "ACTIVE";
    closeOverlay();
  },
  tradeFrom(id, el){ S.ui.tradeFrom = Number(el.value); },
  moveItem(){
    const item = document.getElementById("tradeItem").value;
    const to = Number(document.getElementById("tradeTo").value);
    if(!item) return say("Choose an item to move.", "err");
    const parts = item.split(":");
    if(parts[0] === "card"){
      const i = S.instances.find(x => x.id === Number(parts[1]));
      if(!i) return say("Card not found.", "err");
      if(i.ownerId === to) return say("Already theirs.", "err");
      i.ownerId = to; i.tradeCount++;
      logEvent(designText(i.designId) + " (#" + i.id + ") moved to " + playerName(to) + ".");
    } else {
      const p = S.packs.find(x => x.id === Number(parts[1]));
      if(!p) return say("Pack not found.", "err");
      if(p.ownerId === to) return say("Already theirs.", "err");
      p.ownerId = to; p.tradeCount++;   // frozen odds deliberately untouched
      logEvent("Pack #" + p.id + " (" + p.type + ") moved to " + playerName(to) + ". Odds unchanged.");
    }
    say("Moved. Frozen pack odds always travel with the pack.");
  },
  sendCredits(){
    const from = S.ui.tradeFrom || (S.players[0] && S.players[0].id);
    const to = Number(document.getElementById("tradeTo").value);
    const amount = Math.floor(Number(document.getElementById("tradeCredits").value) || 0);
    if(from === to) return say("Pick two different players.", "err");
    if(amount <= 0) return say("Amount must be positive.", "err");
    if(!credit(from, -amount, "TRADE_TRANSFER", "to " + playerName(to))) return say(playerName(from) + " does not have " + amount + " C.", "err");
    credit(to, amount, "TRADE_TRANSFER", "from " + playerName(from));
    logEvent(playerName(from) + " sent " + amount + " C to " + playerName(to) + ".");
    say("Credits moved.");
  },
  weekly(){
    if(!confirm("Give every player +" + S.config.weeklyRefill + " Credits now?")) return;
    for(const p of S.players) credit(p.id, S.config.weeklyRefill, "WEEKLY_REWARD", "manual weekly distribution");
    S.weekly.unshift({at: Date.now(), amount: S.config.weeklyRefill, count: S.players.length});
    logEvent("Weekly reward: +" + S.config.weeklyRefill + " C to " + S.players.length + " players.");
    say("Weekly reward distributed to " + S.players.length + " players.");
  },
  adjust(id){
    const p = player(id); if(!p) return;
    const raw = prompt("Credit change for " + p.name + " (negative removes):", "100");
    if(raw === null) return;
    const delta = Math.floor(Number(raw) || 0);
    if(!delta) return;
    const reason = prompt("Reason (kept in the ledger):", "host correction") || "host correction";
    if(!credit(p.id, delta, delta >= 0 ? "HOST_GRANT" : "HOST_TAKE", reason)) return say("That would go below zero.", "err");
    logEvent(p.name + (delta >= 0 ? " received " : " lost ") + Math.abs(delta) + " C — " + reason);
  },
  issueCard(id){
    const finalized = S.sets.filter(s => s.snapshot);
    if(!finalized.length) return say("Finalize a set first.", "err");
    const set = finalized[finalized.length - 1];
    const list = set.designs.map((d, n) => (n + 1) + ") " + playerName(d.authorId) + " — " + d.title).join("\n");
    const raw = prompt("Issue which request from Set " + set.ordinal + " to " + playerName(id) + "?\n\n" + list, "1");
    if(raw === null) return;
    const n = Math.floor(Number(raw));
    const d = set.designs[n - 1];
    if(!d) return say("No such number.", "err");
    const inst = createInstance(d.id, set.id, Number(id), "HOST_ISSUE");
    logEvent("Host issued " + designText(d.id) + " (#" + inst.id + ") to " + playerName(id) + ".");
    say("Issued " + d.title + " · float " + floatText(inst.floatValue) + " · No " + catalogText(inst.catalog));
  },
  craftUpgrade(designId){
    const a = acting();
    const owned = S.instances.filter(i => i.ownerId === a.id && i.state === "ACTIVE" && i.designId === Number(designId));
    if(owned.length < 3) return say("Need three identical ACTIVE copies.", "err");
    const found = findDesign(Number(designId));
    const set = found.set;
    if(!set.snapshot) return say("That set was never finalized.", "err");
    const srcDemand = set.snapshot.demand[designId] || 0;
    const eligible = set.designs.filter(d => (set.snapshot.demand[d.id] || 0) > srcDemand);
    if(!eligible.length) return say("Nothing in the set is more wanted than this card.", "err");
    const weights = {};
    for(const d of eligible) weights[d.id] = set.snapshot.scarcity[d.id];
    const chances = normalize(weights);

    let html = '<button class="x" data-act="closeOverlay">Close &times;</button>';
    html += '<p class="eyebrow">3&times; upgrade craft</p><h1>' + esc(found.design.title) + " &rarr; something more wanted</h1>";
    html += "<p>Three copies are consumed. The result is a brand new instance with its own float and catalog number, drawn from the same historical scarcity weights restricted to strictly higher desire.</p>";
    html += '<div class="oddstable"><table><thead><tr><th>Possible result</th><th class="num">Desire</th><th class="num">Chance</th></tr></thead><tbody>';
    eligible.sort((x, y) => chances[y.id] - chances[x.id]);
    for(const d of eligible){
      html += "<tr><td>" + esc(playerName(d.authorId)) + " — " + esc(d.title) + "</td>" +
        '<td class="num">' + (set.snapshot.demand[d.id] || 0) + '</td><td class="num">' + pct(chances[d.id]) + "</td></tr>";
    }
    html += "</tbody></table></div>";
    html += '<div class="row" style="margin-top:16px"><button class="primary big" data-act="confirmUpgrade" data-id="' + designId + '">Consume three and craft</button></div>';
    showModal(html);
    return "skipRender";
  },
  confirmUpgrade(designId){
    const a = acting();
    const owned = S.instances.filter(i => i.ownerId === a.id && i.state === "ACTIVE" && i.designId === Number(designId)).slice(0, 3);
    if(owned.length < 3) return say("Need three identical ACTIVE copies.", "err");
    const found = findDesign(Number(designId));
    const set = found.set;
    const srcDemand = set.snapshot.demand[designId] || 0;
    const weights = {};
    for(const d of set.designs) if((set.snapshot.demand[d.id] || 0) > srcDemand) weights[d.id] = set.snapshot.scarcity[d.id];
    const outId = Number(pickWeighted(weights));
    for(const i of owned) i.state = "CONSUMED";
    const inst = createInstance(outId, set.id, a.id, "UPGRADE_CRAFT");
    logEvent(a.name + " crafted " + designText(outId) + " from three " + found.design.title + ".");
    closeOverlay();
    say("Crafted " + designText(outId) + " · float " + floatText(inst.floatValue) + " · No " + catalogText(inst.catalog));
  },
  craftReclaim(setId){
    const a = acting();
    const set = getSet(setId);
    if(!set || !set.snapshot) return say("That set was never finalized.", "err");
    const owned = S.instances.filter(i => i.ownerId === a.id && i.state === "REDEEMED" && i.setId === set.id &&
      (design(set.id, i.designId) || {}).authorId === a.id).slice(0, 3);
    if(owned.length < 3) return say("Need three redeemed cards of yourself from that set.", "err");
    const own = set.designs.filter(d => d.authorId === a.id);
    const sc = {};
    for(const d of own) sc[d.id] = set.snapshot.scarcity[d.id];
    const odds = bidderOdds(sc, {}, set.config.desireBudget, set.config.boostBase,
                            set.snapshot.authorDemand[a.id] || 0, set.snapshot.avgAuthor, set.config.bidderFailReward);
    for(const i of owned) i.state = "CONSUMED";
    const pack = {
      id: nextId("pack"), type:"RECLAIMED", setId: set.id, authorId: a.id, originBidderId: null,
      ownerId: a.id, odds, raw:{}, defense:{}, effective:{},
      opened:false, createdAt: Date.now(), tradeCount: 0
    };
    S.packs.push(pack);
    logEvent(a.name + " reclaimed a Set " + set.ordinal + " pack from three redeemed promises.");
    say("Reclaimed Pack created — no personal bidder boost, hit " + pct(odds.hit, 1) + ". Open it in the Shop.");
  },
  demo(){
    if(S.players.length && !confirm("Replace the current table with the 8-friend demo?")) return;
    protectReplacement();
    loadDemo();
    const set = currentSet();
    say("Demo table ready: " + S.players.length + " friends, " + set.designs.length + " requests, and " +
        expectedBudget(S.config) + " C each as a starting bankroll (a DEMO_BANKROLL row in the ledger). " +
        "Market rewards and weekly rewards land on top of that.");
  },
  exportJson(){
    const blob = new Blob([JSON.stringify(S, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "friends-cards-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return "skipRender";
  },
  importJson(){
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/json";
    input.onchange = () => {
      const file = input.files[0]; if(!file) return;
      const reader = new FileReader();
      if(file.size > 32*1024*1024){ say("Backup exceeds the 32 MB limit.", "err"); render(); return; }
      reader.onerror = () => { say("The backup file could not be read.", "err"); render(); };
      reader.onload = () => {
        try{
          const parsed = JSON.parse(reader.result);
          validateTable(parsed);
          if(new TextEncoder().encode(JSON.stringify(parsed)).length > 900000) throw new Error('Backup exceeds the online table size limit (900 KB). Your current table was not replaced.');
          if(!confirm('Import this backup?\n\nIncoming: '+tableSummary(parsed)+'\nPlayers: '+parsed.players.map(p=>p.name).join(', ')+'\n\nReplaces: '+tableSummary(S)+'\nA recovery copy of the current table will be kept.')) return;
          protectReplacement();
          S = hydrate(parsed);
          save(); render();
          say("Table restored from file.");
          render();
        }catch(e){ say("That file could not be read: " + e.message, "err"); render(); }
      };
      reader.readAsText(file);
    };
    input.click();
    return "skipRender";
  },
  wipe(){
    if(!confirm("Clear the entire table?\n\n"+tableSummary(S)+"\nWallets and history will also be cleared. A recovery copy will be kept.")) return;
    if(!confirm("Really? Export a backup first if you are not sure.")) return;
    protectReplacement();
    S = blankState();
    say("Table cleared. The previous table is available through Restore previous table in Setup.");
  }
};

function sumBids(set, id){
  const row = set.bids[id] || {};
  let t = 0;
  for(const k in row) t += row[k] || 0;
  return t;
}

function closeBiddingInner(force){
  const set = currentSet();
  if(!set || set.state !== "BIDDING") return;
  const missing = set.participants.filter(id => !set.locked[id]);
  if(missing.length && !force) return say("Still waiting on: " + missing.map(playerName).join(", "), "err");
  if(missing.length && !confirm(missing.map(playerName).join(", ") + " never locked an allocation. Treat their bids as zero?")) return;
  for(const id of missing){ set.bids[id] = set.bids[id] || {}; set.locked[id] = true; }
  set.state = "DEFENSE";
  for(const d of set.designs) if(set.defense[d.id] == null) set.defense[d.id] = 0;
  S.ui.acting = set.participants[0];
  logEvent("Set " + set.ordinal + " bidding closed. Defense open.");
  say("Bidding sealed. Now each author allocates defense — or skip it entirely.");
}

/* ---- demo table ----------------------------------------- */

function loadDemo(){
  S = blankState();
  const names = ["Alan","Bea","Cem","Dana","Emil","Farah","Goran","Hana"];
  const titles = ["PUBLIC SHAME","KARAOKE DEBT","CHEF FOR A DAY","DRIVER ON CALL"];
  const memes = [
    "Said he has no shame. Market decided to verify.",
    "Claims perfect pitch. Evidence pending.",
    "Owns forty spices, uses salt.",
    "Never offers rides. That ends now."
  ];
  const requests = [
    "Owner may set one reasonable public challenge, agreed in advance.",
    "Owner picks one song. It gets performed in front of the group.",
    "Owner picks the menu. Cooking and washing up included.",
    "One agreed trip within the city, at a time the owner chooses.",
    "Owner chooses the profile picture for one full week.",
    "Owner names one errand; it gets run without complaint."
  ];
  const K = S.config.cardsPerPlayer;
  for(const n of names) S.players.push({id: nextId("player"), name: n, credits: 0});
  const set = newSet(1, "The First Mistake", S.config);
  S.sets.push(set);
  for(const p of S.players){
    for(let i = 0; i < K; i++){
      const n = i % titles.length;
      set.designs.push({
        id: nextId("design"), authorId: p.id,
        title: titles[n] + (i >= titles.length ? " " + (Math.floor(i / titles.length) + 1) : ""),
        meme: memes[n], request: requests[n],
        limits: "Nothing dangerous, illegal, expensive or genuinely harmful."
      });
    }
  }
  // A demo table needs money on it or the Shop has nothing to show. This is one
  // set's expected budget (market reward + the weekly rewards), and it goes
  // through the ledger like every other Credit so it is never a mystery later.
  const bankroll = expectedBudget(S.config);
  for(const p of S.players){
    credit(p.id, bankroll, "DEMO_BANKROLL", "demo table starting bankroll");
  }
  S.ui.setId = set.id;
  S.ui.acting = S.players[0].id;
  S.ui.tab = "setup";
  logEvent("Demo table loaded: " + names.length + " friends, " + set.designs.length +
           " requests, " + bankroll + " C each as a starting bankroll.");
}

