const PLAYER_TABS=[['cards','My Cards'],['packs','Packs'],['trading','Trading']];
let playerBusy=false;
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
  if(S.ui.tab==='packs')html+=playerPacksView();
  else if(S.ui.tab==='trading')html+=playerTradingView();
  else html+=playerCardsView();
  const view=document.getElementById('view');view.innerHTML=html;improveAccessibility(view);
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
function playerTradingView(){
  const me=acting(),others=S.players.filter(p=>p.id!==me.id),partner=others.find(p=>p.id===Number(S.ui.tradePartner))||others[0];
  const trades=(S.trades||[]).filter(t=>t.from===me.id||t.to===me.id).slice().reverse();
  let html='<div class="player-section"><div><h2>Trading</h2><p>Make an offer. Both sides move together when your friend accepts.</p></div></div>';
  if(partner){
    const options=owner=>'<option value="">No item</option>'+playerItems(owner).map(id=>'<option value="'+id+'">'+esc(playerItemLabel(id))+'</option>').join('');
    html+='<section class="panel"><h3>Make an offer</h3><label>Trade with<select data-player-filter="tradePartner">'+others.map(p=>'<option value="'+p.id+'"'+(p.id===partner.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label><div class="split"><div><h3>You give</h3><label>Card or pack<select id="giveItem">'+options(me.id)+'</select></label><label>Credits<input id="giveCredits" type="number" min="0" max="'+me.credits+'" value="0"></label></div><div><h3>You receive</h3><label>Card or pack<select id="receiveItem">'+options(partner.id)+'</select></label><label>Credits<input id="receiveCredits" type="number" min="0" value="0"></label></div></div><button class="primary" data-player-act="offer" data-id="'+partner.id+'">Send offer</button><p class="player-hint">Items stay with their owners until the offer is accepted.</p></section>';
  }
  html+='<section class="panel"><h2>Your offers</h2>';
  if(!trades.length)html+='<div class="empty">No trades yet. Send your first offer above.</div>';
  for(const t of trades){
    const incoming=t.to===me.id;
    html+='<article class="player-trade"><div><span class="eyebrow">'+esc(t.status)+'</span><h3>'+(incoming?'From '+esc(playerName(t.from)):'To '+esc(playerName(t.to)))+'</h3><p>'+esc(playerItemLabel(t.giveItem))+' + '+t.giveCredits+' C <span aria-label="in exchange for">↔</span> '+esc(playerItemLabel(t.receiveItem))+' + '+t.receiveCredits+' C</p></div>';
    if(t.status==='PENDING')html+='<div class="row">'+(incoming?'<button class="primary" data-player-act="accept" data-id="'+t.id+'">Accept</button><button data-player-act="decline" data-id="'+t.id+'">Decline</button>':'<button data-player-act="cancel" data-id="'+t.id+'">Cancel</button>')+'</div>';
    html+='</article>';
  }
  return html+'</section>';
}
function checkedTradeItem(value,owner){
  if(!value)return null;
  const [kind,id]=value.split(':');
  const item=(kind==='card'?S.instances:kind==='pack'?S.packs:[]).find(i=>i.id===Number(id));
  if(!item||item.ownerId!==owner||(kind==='card'?item.state==='CONSUMED':item.opened))throw new Error('An item in this trade is no longer available.');
  return item;
}
function executePlayerTrade(action,id,inputs){
  const me=accountSession.playerId;
  S.trades=S.trades||[];
  if(action==='offer'){
    const to=Number(id);if(to===me||!player(to))throw Error('Choose another player.');
    for(const amount of [inputs.giveCredits,inputs.receiveCredits])if(!Number.isSafeInteger(amount)||amount<0)throw Error('Credit amounts must be whole numbers, zero or greater.');
    checkedTradeItem(inputs.giveItem,me);checkedTradeItem(inputs.receiveItem,to);
    if(!inputs.giveItem&&!inputs.receiveItem&&!inputs.giveCredits&&!inputs.receiveCredits)throw Error('Add an item or credits to the offer.');
    if(player(me).credits<inputs.giveCredits)throw Error('You do not have enough credits.');
    S.trades.push({id:crypto.randomUUID(),from:me,to,...inputs,status:'PENDING',createdAt:Date.now()});
    logEvent(playerName(me)+' offered a trade to '+playerName(to)+'.');return;
  }
  const trade=S.trades.find(t=>t.id===id);
  if(!trade||trade.status!=='PENDING')throw Error('This offer is no longer pending.');
  if(action==='cancel'){if(trade.from!==me)throw Error('You can only cancel your own offers.');trade.status='CANCELLED';return;}
  if(trade.to!==me)throw Error('This offer is for another player.');
  if(action==='decline'){trade.status='DECLINED';return;}
  const give=checkedTradeItem(trade.giveItem,trade.from),receive=checkedTradeItem(trade.receiveItem,trade.to);
  if(player(trade.from).credits<trade.giveCredits||player(trade.to).credits<trade.receiveCredits)throw Error('Someone no longer has enough credits for this offer.');
  if(give){give.ownerId=trade.to;give.tradeCount++;}if(receive){receive.ownerId=trade.from;receive.tradeCount++;}
  credit(trade.from,-trade.giveCredits,'TRADE_TRANSFER','Offer '+trade.id);credit(trade.to,-trade.receiveCredits,'TRADE_TRANSFER','Offer '+trade.id);
  credit(trade.to,trade.giveCredits,'TRADE_TRANSFER','Offer '+trade.id);credit(trade.from,trade.receiveCredits,'TRADE_TRANSFER','Offer '+trade.id);
  trade.status='ACCEPTED';trade.completedAt=Date.now();logEvent(playerName(trade.from)+' and '+playerName(trade.to)+' completed a trade.');
}
document.addEventListener('change',event=>{
  if(!isPlayer()||backend!=='cloud')return;
  const key=event.target.dataset.playerFilter;if(!['playerSearch','playerCardState','tradePartner'].includes(key))return;
  S.ui[key]=event.target.value;rememberPlayerUi();render();
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-player-act]');
  if(!button||!isPlayer()||backend!=='cloud'||playerBusy)return;
  if(saveDirty||saveInFlight){flash('Wait for your last change to save before continuing.',true);return;}
  const action=button.dataset.playerAct,id=button.dataset.id;
  if(!['refresh','buy','open','use','offer','accept','decline','cancel'].includes(action))return;
  const inputs=action==='offer'?{giveItem:document.getElementById('giveItem').value,receiveItem:document.getElementById('receiveItem').value,giveCredits:Number(document.getElementById('giveCredits').value),receiveCredits:Number(document.getElementById('receiveCredits').value)}:null;
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
