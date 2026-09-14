const PLAYER_TABS=[['cards','My Cards'],['catalog','All Cards'],['packs','Packs'],['trading','Trading']];
let playerBusy=false;
let playerTradeDraft={give:[],receive:[]};
function rememberPlayerUi(){
  try{sessionStorage.setItem('friendsCards.playerUi.'+accountSession.username,JSON.stringify(S.ui));}catch(_){}
}
function preparePlayerUi(){
  let saved={};
  try{saved=JSON.parse(sessionStorage.getItem('friendsCards.playerUi.'+accountSession.username)||'{}');}catch(_){}
  S.ui={...S.ui,...saved,acting:accountSession.playerId};
  if(!PLAYER_TABS.some(t=>t[0]===S.ui.tab))S.ui.tab='cards';
  if(!saved.tab)S.ui.tab='cards';
  document.body.classList.add('player-mode');
}
function myCards(){return S.instances.filter(i=>i.ownerId===accountSession.playerId&&i.state!=='CONSUMED');}
function myPacks(){return S.packs.filter(p=>p.ownerId===accountSession.playerId&&!p.opened);}
function playerItemLabel(value){
  if(!value)return 'No item';
  const [kind,id]=value.split(':');
  const item=(kind==='card'?S.instances:S.packs).find(i=>i.id===Number(id));
  if(!item)return 'Unavailable item';
  if(kind==='pack')return item.type+' pack #'+item.id;
  const d=findDesign(item.designId)?.design;
  return (d?.title||'Card')+' · #'+item.id;
}
function playerItems(owner){
  return [...S.instances.filter(i=>i.ownerId===owner&&i.state!=='CONSUMED').map(i=>'card:'+i.id),...S.packs.filter(p=>p.ownerId===owner&&!p.opened).map(p=>'pack:'+p.id)];
}
function renderPlayerView(){
  const me=player(accountSession.playerId);
  if(!me)return;
  S.ui.acting=me.id;
  document.body.classList.add('player-mode');
  renderHeader();
  document.getElementById('actingSel').innerHTML='<option>'+esc(me.name)+'</option>';
  document.getElementById('actingSel').disabled=true;
  document.querySelector('label[for="actingSel"]').textContent='SIGNED IN';
  document.getElementById('nav').innerHTML=PLAYER_TABS.map(([id,label])=>'<button data-tab="'+id+'" class="'+(S.ui.tab===id?'on':'')+'">'+hudIcon(id==='packs'?'shop':id==='trading'?'market':id)+'<span>'+label+'</span></button>').join('');
  const cards=myCards(),packs=myPacks(),active=cards.filter(i=>i.state==='ACTIVE').length;
  let html='<section class="player-welcome"><div><div class="eyebrow">YOUR SEAT AT THE TABLE</div><h1>Hey, '+esc(me.name)+'.</h1><p>A collection of promises. Make your next move.</p></div><div class="player-balance"><span>YOUR BALANCE</span><strong>'+me.credits.toLocaleString()+'<small> C</small></strong></div></section>';
  html+='<div class="player-summary"><span><b>'+cards.length+'</b> collected cards</span><span><b>'+active+'</b> ready to use</span><span><b>'+packs.length+'</b> unopened packs</span><button data-player-act="refresh" class="ghost">Refresh table</button></div>';
  html+=noticeHtml();
  if(S.ui.tab==='catalog')html+=playerCatalogView();
  else if(S.ui.tab==='packs')html+=playerPacksView();
  else if(S.ui.tab==='trading')html+=playerTradingView();
  else html+=playerCardsView();
  const view=document.getElementById('view');view.innerHTML=html;improveAccessibility(view);
}
function playerCatalogView(){
  const q=(S.ui.catalogQ||'').toLowerCase(),owner=S.ui.catalogOwner||'ALL',set=S.ui.catalogSet||'ALL',state=S.ui.catalogState||'ALL',sort=S.ui.catalogSort||'new';
  const list=S.instances.filter(i=>{
    if(i.state==='CONSUMED'&&state!=='CONSUMED')return false;
    if(owner!=='ALL'&&i.ownerId!==Number(owner))return false;
    if(set!=='ALL'&&i.setId!==Number(set))return false;
    if(state!=='ALL'&&i.state!==state)return false;
    const d=findDesign(i.designId)?.design;
    return !q||(d?.title+' '+d?.meme+' '+d?.request+' '+playerName(d?.authorId)).toLowerCase().includes(q);
  });
  list.sort((a,b)=>sort==='float'?a.floatValue-b.floatValue:sort==='catalog'?a.catalog-b.catalog:sort==='title'?(findDesign(a.designId)?.design.title||'').localeCompare(findDesign(b.designId)?.design.title||''):b.createdAt-a.createdAt);
  let html='<div class="player-section"><div><h2>All cards</h2><p>Browse every card instance at the table and inspect its request, owner, finish, and history.</p></div></div><div class="panel player-catalog-filters">';
  html+='<label>Search<input data-player-filter="catalogQ" value="'+esc(S.ui.catalogQ||'')+'" placeholder="Title, person, request"></label>';
  html+='<label>Owner<select data-player-filter="catalogOwner"><option value="ALL">Everyone</option>'+S.players.map(p=>'<option value="'+p.id+'"'+(owner===String(p.id)?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>';
  html+='<label>Set<select data-player-filter="catalogSet"><option value="ALL">All sets</option>'+S.sets.map(s=>'<option value="'+s.id+'"'+(set===String(s.id)?' selected':'')+'>Set '+s.ordinal+'</option>').join('')+'</select></label>';
  html+='<label>State<select data-player-filter="catalogState">'+['ALL','ACTIVE','REDEEMED','CONSUMED'].map(value=>'<option'+(state===value?' selected':'')+'>'+value+'</option>').join('')+'</select></label>';
  html+='<label>Sort<select data-player-filter="catalogSort">'+[['new','Newest'],['float','Lowest float'],['catalog','Lowest catalog'],['title','Title']].map(([value,label])=>'<option value="'+value+'"'+(sort===value?' selected':'')+'>'+label+'</option>').join('')+'</select></label><div class="catalog-count"><b>'+list.length+'</b><small>shown</small></div></div>';
  if(!list.length)return html+'<div class="empty">No cards match these filters.</div>';
  html+='<div class="cardgrid player-cardgrid">';
  for(const i of list)html+='<div class="coll collectible celestial" data-foil data-act="inspect" data-id="'+i.id+'" style="'+visualStyle(i)+'">'+collectibleFront(i)+'</div>';
  return html+'</div>';
}
function playerCardsView(){
  const q=(S.ui.playerSearch||'').toLowerCase(),filter=S.ui.playerCardState||'ALL';
  const list=myCards().filter(i=>{
    const d=findDesign(i.designId)?.design;
    return (filter==='ALL'||i.state===filter)&&(!q||(d?.title+' '+d?.request+' '+playerName(d?.authorId)).toLowerCase().includes(q));
  }).sort((a,b)=>b.createdAt-a.createdAt);
  let html='<div class="player-section"><div><h2>My collection</h2><p>Inspect a card to see its promise, finish, and history.</p></div></div><div class="player-filters"><input aria-label="Search my cards" data-player-filter="playerSearch" placeholder="Search your collection…" value="'+esc(S.ui.playerSearch||'')+'"><select aria-label="Card status" data-player-filter="playerCardState">'+[['ALL','All cards'],['ACTIVE','Ready to use'],['REDEEMED','Used']].map(([id,label])=>'<option value="'+id+'"'+(id===filter?' selected':'')+'>'+label+'</option>').join('')+'</select></div>';
  if(!list.length)return html+'<div class="empty">'+(myCards().length?'No cards match these filters.':'Your collection starts here. Open a pack to find your first card.')+'</div>';
  html+='<div class="cardgrid player-cardgrid">';
  for(const i of list)html+='<div class="coll collectible celestial" data-foil data-act="inspect" data-id="'+i.id+'" style="'+visualStyle(i)+'">'+collectibleFront(i)+'</div>';
  return html+'</div>';
}
function playerPacksView(){
  const me=acting(),set=liveSet();
  let html='<div class="player-section"><div><h2>Something worth opening</h2><p>Your next card is one pack away.</p></div></div><div class="shopgrid"><section class="panel player-pack-panel"><div class="eyebrow">STANDARD PACK</div><div class="packart"><span>FRIENDS CARDS</span><b>'+(set?'SET '+set.ordinal:'COMING SOON')+'</b></div>';
  if(set){
    const odds=set.snapshot.standard;
    html+='<div class="oddsline"><span>Card chance <b>'+pct(odds.hit,2)+'</b></span><span>No card refund <b>'+set.config.failRefund+' C</b></span></div><button class="primary big" data-player-act="buy"'+(me.credits<set.config.packCost?' disabled':'')+'>Open for '+set.config.packCost+' C</button>';
    if(me.credits<set.config.packCost)html+='<p class="player-hint">You need '+(set.config.packCost-me.credits)+' more credits.</p>';
    html+='<details><summary>See exact odds</summary>'+oddsTable(odds,set)+'</details>';
  }else html+='<p>The host will make packs available when the next set opens.</p>';
  html+='</section><section class="panel"><h2>Your sealed packs</h2>';
  if(!myPacks().length)html+='<div class="empty">No sealed packs waiting.<br>Earn them at the table or trade with a friend.</div>';
  for(const p of myPacks())html+='<div class="packrow"><div class="grow"><span class="ptype '+p.type+'">'+esc(p.type)+'</span><h3>'+esc(p.authorId?playerName(p.authorId)+' pack':'Legacy pack')+'</h3><small>Card chance '+pct(p.odds.hit,2)+'</small><details><summary>See odds</summary>'+oddsTable(p.odds,getSet(p.setId))+'</details></div><button class="primary" data-player-act="open" data-id="'+p.id+'">Open pack</button></div>';
  return html+'</section></div>';
}
function tradeItems(trade,side){
  const plural=trade[side+'Items'];
  if(Array.isArray(plural))return plural;
  const legacy=trade[side+'Item'];
  return legacy?[legacy]:[];
}
function tradeItemTile(value,side,selected=false){
  const [kind,id]=value.split(':');
  const item=(kind==='card'?S.instances:S.packs).find(entry=>entry.id===Number(id));
  if(!item)return '';
  const label=playerItemLabel(value),detail=kind==='card'?(findDesign(item.designId)?.design.request||'Card promise'):(item.type+' sealed pack');
  return '<button type="button" class="trade-inventory-item '+kind+(selected?' selected':'')+'" draggable="true" data-trade-item="'+esc(value)+'" data-trade-side="'+side+'" '+(selected?'data-trade-remove':'data-trade-add')+'="'+side+'"><span class="trade-item-kind">'+(kind==='card'?'CARD':'PACK')+'</span><b>'+esc(label)+'</b><small>'+esc(detail)+'</small></button>';
}
function tradeSideSummary(items,credits){
  const labels=items.map(playerItemLabel);
  return (labels.length?labels.join(', '):'No items')+' + '+credits+' C';
}
function cleanTradeDraft(me,partner){
  playerTradeDraft.give=[...new Set(playerTradeDraft.give)].filter(value=>playerItems(me.id).includes(value));
  playerTradeDraft.receive=[...new Set(playerTradeDraft.receive)].filter(value=>playerItems(partner.id).includes(value));
}
function playerTradingView(){
  const me=acting(),others=S.players.filter(p=>p.id!==me.id),partner=others.find(p=>p.id===Number(S.ui.tradePartner))||others[0];
  const trades=(S.trades||[]).filter(t=>t.from===me.id||t.to===me.id).slice().reverse();
  let html='<div class="player-section"><div><h2>Trade with friends</h2><p>Pick a friend, build both sides of the offer from the two inventories, then add credits if needed.</p></div></div>';
  if(partner){
    cleanTradeDraft(me,partner);
    const inventory=(owner,side)=>{const selected=new Set(playerTradeDraft[side]);const items=playerItems(owner).filter(value=>!selected.has(value));return items.length?items.map(value=>tradeItemTile(value,side)).join(''):'<div class="trade-empty">No available items</div>';};
    const tray=side=>playerTradeDraft[side].length?playerTradeDraft[side].map(value=>tradeItemTile(value,side,true)).join(''):'<div class="trade-drop-empty">Drop items here or tap them above</div>';
    html+='<section class="panel steam-trade"><div class="trade-toolbar"><label>Trading with<select data-player-filter="tradePartner">'+others.map(p=>'<option value="'+p.id+'"'+(p.id===partner.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label><span>Items move only after '+esc(partner.name)+' accepts.</span></div>';
    html+='<div class="trade-inventories"><section><div class="trade-pane-title"><h3>Your inventory</h3><span>'+playerItems(me.id).length+' items</span></div><div class="trade-item-grid">'+inventory(me.id,'give')+'</div></section><section><div class="trade-pane-title"><h3>'+esc(partner.name)+'\'s inventory</h3><span>'+playerItems(partner.id).length+' items</span></div><div class="trade-item-grid">'+inventory(partner.id,'receive')+'</div></section></div>';
    html+='<div class="trade-offer-builder"><section><div class="trade-pane-title"><h3>You offer</h3><span>'+playerTradeDraft.give.length+' selected</span></div><div class="trade-dropzone" data-trade-drop="give">'+tray('give')+'</div><label class="trade-credit">Credits <input id="giveCredits" type="number" min="0" max="'+me.credits+'" value="0"><small>Available: '+me.credits+' C</small></label></section><div class="trade-swap" aria-hidden="true">&#8644;</div><section><div class="trade-pane-title"><h3>You request</h3><span>'+playerTradeDraft.receive.length+' selected</span></div><div class="trade-dropzone" data-trade-drop="receive">'+tray('receive')+'</div><label class="trade-credit">Credits <input id="receiveCredits" type="number" min="0" max="'+partner.credits+'" value="0"><small>'+esc(partner.name)+' has '+partner.credits+' C</small></label></section></div>';
    html+='<div class="trade-submit"><p>'+playerTradeDraft.give.length+' of your items for '+playerTradeDraft.receive.length+' of theirs</p><button class="primary" data-player-act="offer" data-id="'+partner.id+'">Send trade offer</button></div></section>';
  }
  html+='<section class="panel trade-history"><h2>Your offers</h2>';
  if(!trades.length)html+='<div class="empty">No trades yet. Build your first offer above.</div>';
  for(const t of trades){
    const incoming=t.to===me.id,give=tradeItems(t,'give'),receive=tradeItems(t,'receive');
    html+='<article class="player-trade"><div><span class="eyebrow">'+esc(t.status)+'</span><h3>'+(incoming?'From '+esc(playerName(t.from)):'To '+esc(playerName(t.to)))+'</h3><p>'+esc(tradeSideSummary(give,t.giveCredits))+' <span aria-label="in exchange for">&#8596;</span> '+esc(tradeSideSummary(receive,t.receiveCredits))+'</p></div>';
    if(t.status==='PENDING')html+='<div class="row">'+(incoming?'<button class="primary" data-player-act="accept" data-id="'+t.id+'">Accept</button><button data-player-act="decline" data-id="'+t.id+'">Decline</button>':'<button data-player-act="cancel" data-id="'+t.id+'">Cancel</button>')+'</div>';
    html+='</article>';
  }
  return html+'</section>';
}
function checkedTradeItems(values,owner){
  if(!Array.isArray(values)||new Set(values).size!==values.length)throw new Error('The trade contains duplicate or invalid items.');
  return values.map(value=>{
    const [kind,id]=value.split(':');
    const item=(kind==='card'?S.instances:kind==='pack'?S.packs:[]).find(entry=>entry.id===Number(id));
    if(!item||item.ownerId!==owner||(kind==='card'?item.state==='CONSUMED':item.opened))throw new Error('An item in this trade is no longer available.');
    return item;
  });
}
function executePlayerTrade(action,id,inputs){
  const me=accountSession.playerId;
  S.trades=S.trades||[];
  if(action==='offer'){
    const to=Number(id);if(to===me||!player(to))throw Error('Choose another player.');
    for(const amount of [inputs.giveCredits,inputs.receiveCredits])if(!Number.isSafeInteger(amount)||amount<0)throw Error('Credit amounts must be whole numbers, zero or greater.');
    checkedTradeItems(inputs.giveItems,me);checkedTradeItems(inputs.receiveItems,to);
    if(!inputs.giveItems.length&&!inputs.receiveItems.length&&!inputs.giveCredits&&!inputs.receiveCredits)throw Error('Add an item or credits to the offer.');
    if(player(me).credits<inputs.giveCredits)throw Error('You do not have enough credits.');
    if(player(to).credits<inputs.receiveCredits)throw Error(playerName(to)+' does not have that many credits.');
    S.trades.push({id:crypto.randomUUID(),from:me,to,...inputs,status:'PENDING',createdAt:Date.now()});
    playerTradeDraft={give:[],receive:[]};
    logEvent(playerName(me)+' offered a trade to '+playerName(to)+'.');return;
  }
  const trade=S.trades.find(t=>t.id===id);
  if(!trade||trade.status!=='PENDING')throw Error('This offer is no longer pending.');
  if(action==='cancel'){if(trade.from!==me)throw Error('You can only cancel your own offers.');trade.status='CANCELLED';return;}
  if(trade.to!==me)throw Error('This offer is for another player.');
  if(action==='decline'){trade.status='DECLINED';return;}
  const give=checkedTradeItems(tradeItems(trade,'give'),trade.from),receive=checkedTradeItems(tradeItems(trade,'receive'),trade.to);
  if(player(trade.from).credits<trade.giveCredits||player(trade.to).credits<trade.receiveCredits)throw Error('Someone no longer has enough credits for this offer.');
  for(const item of give){item.ownerId=trade.to;item.tradeCount++;}for(const item of receive){item.ownerId=trade.from;item.tradeCount++;}
  credit(trade.from,-trade.giveCredits,'TRADE_TRANSFER','Offer '+trade.id);credit(trade.to,-trade.receiveCredits,'TRADE_TRANSFER','Offer '+trade.id);
  credit(trade.to,trade.giveCredits,'TRADE_TRANSFER','Offer '+trade.id);credit(trade.from,trade.receiveCredits,'TRADE_TRANSFER','Offer '+trade.id);
  trade.status='ACCEPTED';trade.completedAt=Date.now();logEvent(playerName(trade.from)+' and '+playerName(trade.to)+' completed a trade.');
}
function updateTradeDraft(side,value,remove=false){
  if(!['give','receive'].includes(side)||!value)return;
  const list=playerTradeDraft[side];
  const index=list.indexOf(value);
  if(remove&&index>=0)list.splice(index,1);
  else if(!remove&&index<0)list.push(value);
  render();
}
document.addEventListener('dragstart',event=>{
  const item=event.target.closest('[data-trade-item]');
  if(!item||!isPlayer())return;
  event.dataTransfer.setData('text/plain',item.dataset.tradeSide+'|'+item.dataset.tradeItem);
  event.dataTransfer.effectAllowed='move';
});
document.addEventListener('dragover',event=>{if(event.target.closest('[data-trade-drop]'))event.preventDefault();});
document.addEventListener('drop',event=>{
  const zone=event.target.closest('[data-trade-drop]');if(!zone||!isPlayer())return;
  event.preventDefault();const [side,value]=event.dataTransfer.getData('text/plain').split('|');
  if(side===zone.dataset.tradeDrop)updateTradeDraft(side,value);
});
document.addEventListener('click',event=>{
  const add=event.target.closest('[data-trade-add]'),remove=event.target.closest('[data-trade-remove]');
  if(add&&isPlayer())updateTradeDraft(add.dataset.tradeAdd,add.dataset.tradeItem);
  else if(remove&&isPlayer())updateTradeDraft(remove.dataset.tradeRemove,remove.dataset.tradeItem,true);
});
document.addEventListener('change',event=>{
  if(!isPlayer()||backend!=='cloud')return;
  const key=event.target.dataset.playerFilter;
  if(!['playerSearch','playerCardState','tradePartner','catalogQ','catalogOwner','catalogSet','catalogState','catalogSort'].includes(key))return;
  if(key==='tradePartner')playerTradeDraft.receive=[];
  S.ui[key]=event.target.value;rememberPlayerUi();render();
});
document.addEventListener('input',event=>{
  if(!isPlayer()||backend!=='cloud'||event.target.dataset.playerFilter!=='catalogQ')return;
  S.ui.catalogQ=event.target.value;rememberPlayerUi();render();
  const input=document.querySelector('[data-player-filter="catalogQ"]');if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-player-act]');
  if(!button||!isPlayer()||backend!=='cloud'||playerBusy)return;
  if(saveDirty||saveInFlight){flash('Wait for your last change to save before continuing.',true);return;}
  const action=button.dataset.playerAct,id=button.dataset.id;
  if(!['refresh','buy','open','use','offer','accept','decline','cancel'].includes(action))return;
  const inputs=action==='offer'?{giveItems:[...playerTradeDraft.give],receiveItems:[...playerTradeDraft.receive],giveCredits:Number(document.getElementById('giveCredits').value),receiveCredits:Number(document.getElementById('receiveCredits').value)}:null;
  const note=action==='use'?prompt('How was this promise fulfilled?',''):null;
  if(action==='use'&&note===null)return;
  playerBusy=true;button.disabled=true;rememberPlayerUi();let before,result;
  try{
    const cloud=await connectFirebase(),latest=await cloud.readState();validateTable(latest);
    S=hydrate(latest);preparePlayerUi();before=JSON.stringify(S);
    if(action==='buy')result=rollStandard(accountSession.playerId);
    else if(action==='open')result=openPack(Number(id),accountSession.playerId);
    else if(action==='use'){
      const card=S.instances.find(i=>i.id===Number(id)&&i.ownerId===accountSession.playerId&&i.state==='ACTIVE');
      if(!card)throw Error('This card is no longer available to use.');
      card.state='REDEEMED';card.note=note;logEvent(playerName(card.ownerId)+' used '+designText(card.designId)+'.');closeOverlay();
    }else if(action!=='refresh')executePlayerTrade(action,id,inputs);
    if(result?.error)throw Error(result.error);
    if(action!=='refresh'){save();await pushToDb();}
    if(!saveDirty){say(action==='refresh'?'Your collection is up to date.':action==='offer'?'Offer sent. Your friend can accept it in Trading.':'Saved to the table.');}
    render();if(result&&!saveDirty)showPackAnimation(result);
  }catch(error){if(before&&!saveDirty){S=JSON.parse(before);}say(error.message,'err');render();}
  finally{playerBusy=false;button.disabled=false;}
});
