/* ============================================================
   2. RANDOMNESS  (crypto, never Math.random)
   ============================================================ */

function randUnit(){                       // uniform double in [0,1)
  const b = new Uint32Array(2);
  crypto.getRandomValues(b);
  return (b[0] * 4294967296 + b[1]) / 18446744073709551616;
}
function randInt(n){                       // uniform integer 0..n-1, rejection sampled
  if(n <= 0) return 0;
  const limit = Math.floor(4294967296 / n) * n;
  const b = new Uint32Array(1);
  let x;
  do{ crypto.getRandomValues(b); x = b[0]; } while(x >= limit);
  return x % n;
}
function chance(p){ return randUnit() < p; }
function pickWeighted(weights){            // {key: weight} -> key
  const keys = Object.keys(weights);
  if(!keys.length) return null;
  let total = 0;
  for(const k of keys) total += Math.max(0, weights[k]);
  if(total <= 0) return keys[randInt(keys.length)];
  let point = randUnit() * total, run = 0;
  for(const k of keys){
    run += Math.max(0, weights[k]);
    if(point < run) return k;
  }
  return keys[keys.length - 1];
}

/* ============================================================
   3. ECONOMY MATH  (the formulas from the design)
   ============================================================ */

// S_c = (1 + D_c / Dbar_c) ^ -exponent
function scarcity(demand, avgDemand, exponent){
  if(avgDemand <= 0) return 1;
  return Math.pow(1 + demand / avgDemand, -exponent);
}

// h = T(C - F) / (B - T*F)
function standardHit(budget, target, cost, refund){
  const den = budget - target * refund;
  if(den <= 0 || cost <= refund) return 0;
  return Math.max(0, Math.min(1, target * (cost - refund) / den));
}

// expected credits available per player per set
function expectedBudget(cfg){
  return cfg.avgSetReward + cfg.weeklyRefill * cfg.expectedRefills;
}

function normalize(weights){
  const out = {};
  const keys = Object.keys(weights);
  if(!keys.length) return out;
  let total = 0;
  for(const k of keys) total += Math.max(0, weights[k]);
  if(total <= 0){ for(const k of keys) out[k] = 1 / keys.length; return out; }
  for(const k of keys) out[k] = Math.max(0, weights[k]) / total;
  return out;
}

// R_a = R_avg * D_a / Dbar_a, integerised so the pool is exactly N * R_avg
function largestRemainder(demands, avgReward){
  const keys = Object.keys(demands);
  const out = {};
  if(!keys.length) return out;
  const pool = keys.length * avgReward;
  let total = 0;
  for(const k of keys) total += demands[k];
  if(total <= 0){ for(const k of keys) out[k] = avgReward; return out; }
  const exact = {}, frac = [];
  let used = 0;
  for(const k of keys){
    exact[k] = pool * demands[k] / total;
    out[k] = Math.floor(exact[k]);
    used += out[k];
    frac.push(k);
  }
  frac.sort((a,b)=>{
    const fa = exact[a] - Math.floor(exact[a]);
    const fb = exact[b] - Math.floor(exact[b]);
    if(fb !== fa) return fb - fa;
    return Number(a) - Number(b);
  });
  let left = pool - used;
  for(let i = 0; i < left; i++) out[frac[i % frac.length]] += 1;
  return out;
}

// e_ic = b_ic if b_ic > d_c, else 0
function effectiveBid(raw, defense){ return raw > defense ? raw : 0; }

// M_ic = G ^ (e_ic / B_D);  W = S_c * M_ic;  q = W / sum W
function bidderOdds(scarcities, effective, desireBudget, boostBase, authorDemand, avgAuthorDemand, failReward){
  const hit = avgAuthorDemand <= 0 ? 1 : 1 / (1 + authorDemand / avgAuthorDemand);
  const weighted = {};
  for(const id in scarcities){
    const e = effective[id] || 0;
    weighted[id] = scarcities[id] * Math.pow(boostBase, e / desireBudget);
  }
  const conditional = normalize(weighted);
  const cards = {};
  for(const id in conditional) cards[id] = hit * conditional[id];
  return {hit, fail: 1 - hit, conditional, cards, failReward};
}

function standardOdds(scarcities, hit, failReward){
  const conditional = normalize(scarcities);
  const cards = {};
  for(const id in conditional) cards[id] = hit * conditional[id];
  return {hit, fail: 1 - hit, conditional, cards, failReward};
}

function oddsSum(odds){
  let t = odds.fail;
  for(const id in odds.cards) t += odds.cards[id];
  return t;
}

/* ============================================================
   4. LOOKUPS + CREDIT LEDGER
   ============================================================ */

function player(id){ return S.players.find(p => p.id === Number(id)) || null; }
function playerName(id){ const p = player(id); return p ? p.name : "—"; }
function getSet(id){ return S.sets.find(s => s.id === Number(id)) || null; }
function design(setId, designId){
  const s = getSet(setId);
  return s ? s.designs.find(d => d.id === Number(designId)) || null : null;
}
function findDesign(designId){
  for(const s of S.sets){
    const d = s.designs.find(x => x.id === Number(designId));
    if(d) return {set:s, design:d};
  }
  return null;
}
function liveSet(){ return S.sets.find(s => s.state === "LIVE") || null; }
function currentSet(){
  if(S.ui.setId){ const s = getSet(S.ui.setId); if(s) return s; }
  return S.sets.find(s => s.state !== "CLOSED") || S.sets[S.sets.length - 1] || null;
}
function acting(){ return player(S.ui.acting); }

function credit(playerId, delta, type, note){
  const p = player(playerId);
  if(!p) return false;
  if(p.credits + delta < 0) return false;
  p.credits += delta;
  S.ledger.unshift({
    id: nextId("ledger"), at: Date.now(), playerId: p.id,
    delta, after: p.credits, type, note: note || "", setId: currentSet()?.id || null
  });
  if(S.ledger.length > 2000) S.ledger.length = 2000;
  return true;
}

/* ============================================================
   5. FORMATTING HELPERS
   ============================================================ */

function pct(v, digits){
  if(!isFinite(v) || v <= 0) return "0%";
  const d = digits != null ? digits : (v < 0.001 ? 4 : 2);
  return (v * 100).toFixed(d) + "%";
}
function oneIn(v){
  if(!isFinite(v) || v <= 0) return "never";
  const n = 1 / v;
  return "1 in " + (n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString());
}
function floatText(v){ return (v / 100000).toFixed(5); }
function catalogText(v){ return String(v).padStart(3, "0"); }
function when(ts){ return ts ? new Date(ts).toLocaleString() : "—"; }
function esc(s){
  return String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function initials(name){ return String(name || "?").trim().slice(0,1).toUpperCase(); }


/* ---- finalisation: the one moment everything freezes ------ */

function finalizeMarket(set){
  const cfg = set.config;
  const designs = set.designs;
  const ids = set.participants;
  if(!designs.length || !ids.length) return "nothing to finalize";
  // Rewards and bidder packs are granted exactly once. The snapshot is the
  // receipt: if it exists, this set has already paid out.
  if(set.snapshot) return "Set " + set.ordinal + " has already been finalized; rewards were paid once.";

  // D_c
  const demand = demandMap(set);
  let totalDemand = 0;
  for(const id in demand) totalDemand += demand[id];

  const avgCard   = designs.length ? totalDemand / designs.length : 0;   // Dbar_c
  const avgAuthor = ids.length ? totalDemand / ids.length : 0;           // Dbar_a

  // D_a
  const authorDemand = {};
  for(const id of ids){
    authorDemand[id] = designs.filter(d => d.authorId === id)
      .reduce((a, d) => a + (demand[d.id] || 0), 0);
  }

  // R_a with an exact N * R_avg pool
  const rewards = largestRemainder(authorDemand, cfg.avgSetReward);

  // S_c
  const scar = {};
  for(const d of designs) scar[d.id] = scarcity(demand[d.id], avgCard, cfg.scarcityExponent);

  // h and the standard distribution
  const hit = standardHit(expectedBudget(cfg), cfg.targetHits, cfg.packCost, cfg.failRefund);
  const std = standardOdds(scar, hit, cfg.failRefund);

  // h_a per author
  const authorHit = {};
  for(const id of ids){
    authorHit[id] = avgAuthor <= 0 ? 1 : 1 / (1 + authorDemand[id] / avgAuthor);
  }

  // pay the authors
  let pool = 0;
  for(const id of ids){
    credit(id, rewards[id], "SET_MARKET_REWARD", "Set " + set.ordinal + " desire market");
    pool += rewards[id];
  }

  // original bidder packs: one per bidder per author, if any card was breached
  let packsMade = 0;
  for(const bidderId of ids){
    for(const authorId of ids){
      if(bidderId === authorId) continue;
      const own = designs.filter(d => d.authorId === authorId);
      const raw = {}, eff = {}, def = {}, sc = {};
      let breached = false;
      for(const d of own){
        raw[d.id] = (set.bids[bidderId] || {})[d.id] || 0;
        def[d.id] = set.defense[d.id] || 0;
        eff[d.id] = effectiveBid(raw[d.id], def[d.id]);
        sc[d.id]  = scar[d.id];
        if(eff[d.id] > 0) breached = true;
      }
      if(!breached) continue;
      const odds = bidderOdds(sc, eff, cfg.desireBudget, cfg.boostBase,
                              authorDemand[authorId], avgAuthor, cfg.bidderFailReward);
      S.packs.push({
        id: nextId("pack"), type: "BIDDER", setId: set.id, authorId, originBidderId: bidderId,
        ownerId: bidderId, odds, raw, defense: def, effective: eff,
        opened: false, createdAt: Date.now(), tradeCount: 0
      });
      packsMade++;
    }
  }

  set.snapshot = {
    totalDemand, avgCard, avgAuthor,
    demand, scarcity: scar, authorDemand, rewards, authorHit,
    standard: std, rewardPool: pool, config: Object.assign({}, cfg),
    finalizedAt: Date.now()
  };
  set.state = "LIVE";
  logEvent("Set " + set.ordinal + " finalized: " + totalDemand + " desire, " + pool + " C paid, " + packsMade + " bidder packs.");
  return null;
}

/* ============================================================
   9. PACKS — rolling, opening, legacy
   ============================================================ */

function createInstance(designId, setId, ownerId, source, packId){
  const inst = {
    id: nextId("instance"), designId: Number(designId), setId,
    ownerId, pullerId: ownerId,
    floatValue: randInt(100001),   // 0..100000, shown at 5 decimals
    catalog: randInt(1000),        // 000..999
    state: "ACTIVE", source, sourcePackId: packId || null,
    createdAt: Date.now(), tradeCount: 0, note: ""
  };
  S.instances.push(inst);
  return inst;
}

// L_s = 1 / (k - s)^gamma over finalized older sets
function legacyPool(currentSet){
  const gamma = currentSet.config.legacyAgeExponent;
  const pool = {};
  for(const s of S.sets){
    if(s.ordinal >= currentSet.ordinal || !s.snapshot) continue;
    const d = currentSet.ordinal - s.ordinal;
    pool[s.id] = 1 / Math.pow(d, gamma);
  }
  return pool;
}

function rollStandard(playerId){
  const set = liveSet();
  if(!set || !set.snapshot) return {error:"No set is LIVE."};
  const cfg = set.config;
  const p = player(playerId);
  if(!p) return {error:"Pick who is buying."};
  if(p.credits < cfg.packCost) return {error: p.name + " needs " + cfg.packCost + " C and has " + p.credits + " C."};

  credit(playerId, -cfg.packCost, "STANDARD_PACK_PURCHASE", "Set " + set.ordinal + " Standard Pack");
  const odds = set.snapshot.standard;
  const out = {type:"STANDARD", setId:set.id, odds, playerId};

  if(chance(odds.hit)){
    const designId = Number(pickWeighted(odds.conditional));
    out.outcome = "CARD";
    out.instance = createInstance(designId, set.id, playerId, "STANDARD");
    logEvent(p.name + " pulled " + designText(designId) + " from a Standard Pack.");
  } else {
    credit(playerId, cfg.failRefund, "STANDARD_FAIL_REFUND", "Standard Pack fail");
    out.outcome = "FAIL";
    out.refund = cfg.failRefund;
    // hidden independent legacy roll — only ever on a CURRENT standard fail
    const pool = legacyPool(set);
    if(Object.keys(pool).length && chance(cfg.legacyTrigger)){
      const srcId = Number(pickWeighted(pool));
      const src = getSet(srcId);
      const pack = {
        id: nextId("pack"), type:"LEGACY", setId: srcId, authorId:null, originBidderId:null,
        ownerId: playerId,
        odds: {
          hit: src.snapshot.standard.hit, fail: src.snapshot.standard.fail,
          conditional: src.snapshot.standard.conditional, cards: src.snapshot.standard.cards,
          failReward: src.config.failRefund
        },
        opened:false, createdAt:Date.now(), tradeCount:0
      };
      S.packs.push(pack);
      out.legacy = pack;
      logEvent(p.name + " uncovered a Legacy Pack from Set " + src.ordinal + ".");
    }
  }
  return out;
}

function openPack(packId, playerId){
  const pack = S.packs.find(p => p.id === Number(packId));
  if(!pack) return {error:"Pack not found."};
  if(pack.opened) return {error:"Already opened."};
  if(pack.ownerId !== playerId) return {error:"That pack belongs to " + playerName(pack.ownerId) + "."};
  const out = {type: pack.type, setId: pack.setId, odds: pack.odds, playerId, packId: pack.id};
  if(chance(pack.odds.hit)){
    const designId = Number(pickWeighted(pack.odds.conditional));
    out.outcome = "CARD";
    out.instance = createInstance(designId, pack.setId, playerId, pack.type, pack.id);
    logEvent(playerName(playerId) + " opened a " + pack.type + " pack: " + designText(designId) + ".");
  } else {
    const reward = pack.odds.failReward || 0;
    if(reward) credit(playerId, reward, pack.type + "_FAIL_REWARD", pack.type + " pack fail");
    out.outcome = "FAIL";
    out.refund = reward;
    logEvent(playerName(playerId) + " opened a " + pack.type + " pack: no card.");
  }
  // a legacy pack NEVER rolls another legacy pack — the chain stops here
  pack.opened = true;
  pack.openedAt = Date.now();
  return out;
}

function designText(designId){
  const f = findDesign(designId);
  return f ? (playerName(f.design.authorId) + " — " + f.design.title) : "card #" + designId;
}

