/* Backup validation is deliberately separate from the game economy. */
function validateTable(data){
  const fail=message=>{ throw new Error(message); };
  const obj=(v,path)=>{ if(!v || typeof v!=='object' || Array.isArray(v)) fail(path+' must be an object'); };
  const integer=(v,path,min=0)=>{ if(!Number.isSafeInteger(v)||v<min) fail(path+' must be an integer ≥ '+min); };
  const text=(v,path)=>{ if(typeof v!=='string') fail(path+' must be text'); };
  obj(data,'Table');
  if(data.version!==1) fail('Unsupported backup version (expected 1)');
  function walk(v,path){
    if(typeof v==='number' && !Number.isFinite(v)) fail(path+' contains a non-finite number');
    if(v && typeof v==='object') for(const k of Object.keys(v)){
      if(['__proto__','constructor','prototype'].includes(k)) fail('Unsafe property at '+path);
      walk(v[k],path+'.'+k);
    }
  }
  walk(data,'Table');
  for(const key of ['players','sets','instances','packs','ledger','log','weekly'])
    if(!Array.isArray(data[key])) fail(key+' must be an array');
  obj(data.config,'config'); obj(data.ids,'ids'); obj(data.ui,'ui');
  function config(c,path){
    obj(c,path);
    for(const key of Object.keys(DEFAULTS)) if(typeof c[key]!=='number'||!Number.isFinite(c[key])) fail(path+'.'+key+' must be a finite number');
    for(const key of ['cardsPerPlayer','desireBudget','defenseBudget','weeklyRefill','avgSetReward','packCost','failRefund','bidderFailReward']){
      integer(c[key],path+'.'+key,['cardsPerPlayer','desireBudget','packCost'].includes(key)?1:0);
      if(c[key]>1000000000)fail(path+'.'+key+' is too large');
    }
    for(const key of ['expectedRefills','targetHits','scarcityExponent','legacyAgeExponent'])if(c[key]<0||c[key]>1000000)fail(path+'.'+key+' is out of range');
    if(c.boostBase<=0||c.boostBase>1000000)fail(path+'.boostBase must be greater than zero and at most 1000000');
    if(c.legacyTrigger<0||c.legacyTrigger>1)fail(path+'.legacyTrigger must be between zero and one');
    if(c.failRefund>=c.packCost)fail(path+'.failRefund must be less than packCost');
  }
  config(data.config,'config');
  function unique(rows,path){
    const ids=new Set();
    rows.forEach((r,i)=>{obj(r,path+'['+i+']');integer(r.id,path+' id',1);if(ids.has(r.id)) fail('Duplicate '+path+' id '+r.id);ids.add(r.id);});
    return ids;
  }
  const players=unique(data.players,'player'), sets=unique(data.sets,'set');
  const designs=new Map();
  const refs=(v,ids,path)=>{integer(v,path,1);if(!ids.has(v)) fail(path+' refers to a missing record');};
  // Removed players may legitimately remain in historical records.
  data.players.forEach(p=>{text(p.name,'Player name');integer(p.credits,'Player credits');});
  function numberMap(m,path){obj(m,path);for(const [k,v] of Object.entries(m)){if(!/^\d+$/.test(k)||typeof v!=='number'||!Number.isFinite(v)||v<0) fail(path+' contains an invalid amount');}}
  function odds(o,path){
    obj(o,path);numberMap(o.cards,path+'.cards');numberMap(o.conditional,path+'.conditional');
    for(const key of ['hit','fail']) if(typeof o[key]!=='number'||o[key]<0||o[key]>1) fail(path+'.'+key+' must be a probability');
    integer(o.failReward,path+'.failReward');
    if(Object.keys(o.cards).sort().join(',')!==Object.keys(o.conditional).sort().join(',')) fail(path+' card lists do not match');
    if(Object.keys(o.cards).length && Math.abs(Object.values(o.conditional).reduce((a,b)=>a+b,0)-1)>1e-8) fail(path+' conditional probabilities do not sum to 1');
    for(const key of Object.keys(o.cards)) if(o.cards[key]>1||o.conditional[key]>1||Math.abs(o.cards[key]-o.hit*o.conditional[key])>1e-8) fail(path+' has inconsistent card probabilities');
    if(Math.abs(o.hit+o.fail-1)>1e-8 || Math.abs(Object.values(o.cards).reduce((a,b)=>a+b,0)+o.fail-1)>1e-8) fail(path+' probabilities do not sum to 1');
  }
  data.sets.forEach(s=>{
    text(s.name,'Set name');integer(s.ordinal,'Set ordinal',1);config(s.config,'Set config');
    if(!['DRAFT','BIDDING','DEFENSE','LIVE','CLOSED'].includes(s.state)) fail('Unknown set stage');
    if(!Array.isArray(s.participants)||new Set(s.participants).size!==s.participants.length) fail('Set participants must be a unique list');
    s.participants.forEach(p=>integer(p,'Participant',1));
    if(!Array.isArray(s.designs)) fail('Set designs must be an array');
    unique(s.designs,'design');
    s.designs.forEach(d=>{if(designs.has(d.id)) fail('Duplicate design across sets');designs.set(d.id,s.id);integer(d.authorId,'Author',1);text(d.title,'Card title');for(const k of ['meme','request','limits']) text(d[k],'Card '+k);});
    const ownIds=new Set(s.designs.map(d=>d.id));
    const cardRefs=(m,label)=>{for(const key of Object.keys(m)) if(!ownIds.has(Number(key))) fail(label+' refers to a card outside this set');};
    obj(s.bids,'Bids');for(const [bidder,row] of Object.entries(s.bids)){if(!s.participants.includes(Number(bidder))) fail('Bidder is not a set participant');numberMap(row,'Bids');cardRefs(row,'Bids');}
    numberMap(s.defense,'Defense');obj(s.locked,'Bid locks');obj(s.defLocked,'Defense locks');
    cardRefs(s.defense,'Defense');
    for(const locks of [s.locked,s.defLocked]) if(Object.values(locks).some(v=>typeof v!=='boolean')) fail('Locks must be true or false');
    if(['LIVE','CLOSED'].includes(s.state)&&!s.snapshot) fail('Revealed sets need a frozen snapshot');
    if(s.snapshot){
      const snap=s.snapshot;obj(snap,'Snapshot');config(snap.config,'Snapshot config');odds(snap.standard,'Standard odds');
      for(const key of ['demand','scarcity','authorDemand','rewards','authorHit']) numberMap(snap[key],'Snapshot '+key);
      for(const key of ['demand','scarcity']){cardRefs(snap[key],'Snapshot '+key);if(Object.keys(snap[key]).length!==ownIds.size) fail('Snapshot '+key+' is incomplete');}
      cardRefs(snap.standard.cards,'Standard odds');
      for(const key of ['totalDemand','avgCard','avgAuthor','rewardPool','finalizedAt']) if(typeof snap[key]!=='number'||snap[key]<0) fail('Invalid snapshot '+key);
    }
  });
  const instances=unique(data.instances,'instance'), packs=unique(data.packs,'pack');
  data.instances.forEach(i=>{
    refs(i.setId,sets,'Card set');if(designs.get(i.designId)!==i.setId) fail('Card design does not belong to its set');
    for(const k of ['ownerId','pullerId','floatValue','catalog','createdAt','tradeCount']) integer(i[k],'Card '+k);
    if(i.floatValue>100000||i.catalog>999) fail('Card serial is out of range');
    if(!['ACTIVE','REDEEMED','CONSUMED'].includes(i.state)) fail('Unknown card state');
    text(i.note,'Card note');text(i.source,'Card source');
  });
  data.packs.forEach(p=>{
    refs(p.setId,sets,'Pack set');integer(p.ownerId,'Pack owner');
    if(!['BIDDER','LEGACY','RECLAIMED'].includes(p.type)) fail('Unknown pack type');
    if(typeof p.opened!=='boolean') fail('Pack opened must be true or false');
    odds(p.odds,'Pack odds');
    for(const key of ['createdAt','tradeCount']) integer(p[key],'Pack '+key);
    for(const key of ['raw','defense','effective']) if(p[key]!=null) numberMap(p[key],'Pack '+key);
    for(const id of Object.keys(p.odds.cards)) if(designs.get(Number(id))!==p.setId) fail('Pack odds refer to a card outside its set');
  });
  const ledger=unique(data.ledger,'ledger');
  data.ledger.forEach(l=>{integer(l.playerId,'Ledger player');integer(l.at,'Ledger date');if(!Number.isSafeInteger(l.delta)) fail('Ledger delta must be an integer');integer(l.after,'Ledger balance');text(l.type,'Ledger type');text(l.note,'Ledger note');});
  data.log.forEach(l=>{obj(l,'Log entry');integer(l.at,'Log date');text(l.text,'Log text');});
  data.weekly.forEach(w=>{obj(w,'Weekly entry');for(const k of ['at','amount','count']) integer(w[k],'Weekly '+k);});
  if(data.trades!==undefined){
    if(!Array.isArray(data.trades))fail('Trades must be an array');
    const seen=new Set();
    for(const t of data.trades){
      obj(t,'Trade');text(t.id,'Trade ID');if(!/^[a-zA-Z0-9_-]{1,100}$/.test(t.id)||seen.has(t.id))fail('Invalid or duplicate trade ID');seen.add(t.id);
      integer(t.from,'Trade sender',1);integer(t.to,'Trade recipient',1);if(t.from===t.to)fail('Trade participants must differ');
      for(const key of ['giveCredits','receiveCredits','createdAt'])integer(t[key],'Trade '+key);
      if(!['PENDING','ACCEPTED','DECLINED','CANCELLED'].includes(t.status))fail('Unknown trade status');
      if(t.completedAt!==undefined)integer(t.completedAt,'Trade completion date');
      const all=[];
      for(const side of ['give','receive']){
        const values=t[side+'Items']??(t[side+'Item']?[t[side+'Item']]:[]);
        if(!Array.isArray(values))fail('Trade items must be an array');
        for(const value of values){
          if(typeof value!=='string'||!/^(card|pack):[1-9][0-9]*$/.test(value))fail('Invalid trade item');
          const [kind,id]=value.split(':');if(!(kind==='card'?instances:packs).has(Number(id)))fail('Trade item is missing');
          if(all.includes(value))fail('Duplicate trade item');all.push(value);
        }
      }
      if(!all.length&&!t.giveCredits&&!t.receiveCredits)fail('Empty trade');
      if(t.conditions!==undefined){obj(t.conditions,'Trade conditions');for(const [key,value] of Object.entries(t.conditions)){if(!all.includes(key))fail('Unexpected trade condition');text(value,'Trade condition');}}
    }
  }
  if(data.operations!==undefined){
    if(!Array.isArray(data.operations)||data.operations.length>256)fail('Invalid operation receipts');
    const seen=new Set();for(const operation of data.operations){obj(operation,'Operation');text(operation.id,'Operation ID');if(seen.has(operation.id))fail('Duplicate operation ID');seen.add(operation.id);integer(operation.at,'Operation timestamp');}
  }
  for(const [key,ids] of Object.entries({player:players,set:sets,design:new Set(designs.keys()),instance:instances,pack:packs,ledger})){
    integer(data.ids[key],'Next '+key+' ID',1);
    for(const id of ids) if(data.ids[key]<=id) fail('Next '+key+' ID would collide with existing history');
  }
  return data;
}

function tableSummary(table){
  return table.players.length+' players, '+table.sets.length+' sets, '+table.instances.length+' cards, '+table.packs.filter(p=>!p.opened).length+' sealed packs';
}
