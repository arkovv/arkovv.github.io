/* Visual edition 1. Pure deterministic decoration; never uses gameplay RNG. */
function visualHash(value){
  let h=2166136261;
  for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
function visualRandom(seed){
  let n=seed||1;
  return ()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return (n>>>0)/4294967296;};
}
function authorSignature(authorId){
  // Alik's supplied emblem is preserved as-is in a local image asset.
  if(Number(authorId)===1)return {name:'Cyberpunk',ink:'#f096a0',secondary:'#70d5df',emblem:'alik-samurai',family:'circuit',theme:'cyberpunk'};
  // Local-table override: author 2 is Azat. Ownership/name changes do not affect it.
  if(Number(authorId)===2)return {name:'Amaterasu',ink:'#f1a1a7',secondary:'#946baf',emblem:'itachi',family:'blackflame',theme:'itachi'};
  const h=visualHash('author-v1:'+authorId);
  const palettes=[['Aurora','#a7e2cd','#719bcc'],['Solstice','#edd095','#d49272'],['Nocturne','#c3bbef','#80aacd'],['Roseglass','#e9b5cb','#c09bd6'],['Verdant','#c5dda5','#77bbaa'],['Ember','#eab594','#ce879e']];
  const [name,ink,secondary]=palettes[h%palettes.length];
  return {name,ink,secondary,emblem:(h>>>8)%6,family:(h>>>16)%3,...(Number(authorId)===5?{name:'Doppler',ink:'#d0e9ed',secondary:'#53bcdf',theme:'doppler'}:{})};
}
function cardFingerprint(i){return visualHash(['card-v1',i.setId,i.designId,i.id,i.floatValue,i.catalog].join(':'));}
function cardSignature(i){
  const found=findDesign(i.designId);
  return authorSignature(found?found.design.authorId:'missing-design-'+i.designId);
}
// Author identity is independent of per-card finishes. Boundaries use stored integers.
function cardFinish(i){
  const signature=cardSignature(i);
  if(signature.theme==='cyberpunk')return {effect:Number(i.catalog)===999?'silence':'terminal',name:'SAMURAI · LIVE TERMINAL',blindness:0};
  if(signature.theme==='doppler')return {effect:'doppler',name:Number(i.catalog)===999?'DOPPLER · EMERALD':'DOPPLER · '+(dopplerProfile(i).greenPercent).toFixed(2)+'% GREEN',blindness:0};
  if(signature.theme!=='itachi')return {effect:'celestial',name:signature.name+' engraving',blindness:0};
  const value=Math.max(0,Math.min(100000,Number(i.floatValue)||0));
  const effect=value>=50000?'leaves':value>=20000?'akatsuki':'amaterasu';
  return {effect,name:{leaves:'Falling leaves · HIDDEN LEAF',akatsuki:'Akatsuki · RED CLOUDS',amaterasu:'Amaterasu · BLACK FLAME'}[effect],blindness:1-Math.sqrt(value/100000)};
}
function reflectionProfile(i){
  const category=cardFinish(i).effect;
  const random=visualRandom(cardFingerprint(i)^visualHash('reflection-v2:'+category));
  const angle=Math.floor(random()*360),x=20+Math.floor(random()*60),y=20+Math.floor(random()*60);
  const width=5+Math.floor(random()*10),spacing=18+Math.floor(random()*24);
  let pattern;
  if(category==='leaves'){
    // Broken green light through leaves: narrow, directional streaks.
    pattern='repeating-linear-gradient('+angle+'deg,transparent 0 '+spacing+'px,#207b554d '+(spacing+3)+'px,#54b79599 '+(spacing+width)+'px,transparent '+(spacing+width+8)+'px),radial-gradient(ellipse at '+x+'% '+y+'%,#238c7166,transparent 60%)';
  }else if(category==='akatsuki'){
    // Rounded cloud contours in crimson, rose, and plum.
    pattern='repeating-radial-gradient(ellipse at '+x+'% '+y+'%,transparent 0 '+spacing+'px,#b6235f66 '+(spacing+4)+'px,#bd65bf99 '+(spacing+width)+'px,transparent '+(spacing+width+9)+'px),linear-gradient('+angle+'deg,transparent 30%,#e94c7155 48%,transparent 65%)';
  }else{
    // Fractured oil-slick facets for Amaterasu.
    const gap=30+Math.floor(random()*35);
    pattern='conic-gradient(from '+angle+'deg at '+x+'% '+y+'%,transparent 0deg,#7132dcaa '+gap+'deg,#b3297f99 '+(gap+22)+'deg,transparent '+(gap+40)+'deg,transparent 150deg,#147a8a88 180deg,#5955d6bb 211deg,transparent 240deg,transparent 290deg,#a12fb799 323deg,transparent 360deg)';
  }
  return {category,pattern,duration:11+Math.floor(random()*12),delay:-(random()*18).toFixed(2),scale:135+Math.floor(random()*90)};
}
function visualStyle(i){
  const s=cardSignature(i),finish=cardFinish(i);
  let style='--card-ink:'+s.ink+';--card-secondary:'+s.secondary+';--blindness:'+finish.blindness.toFixed(5);
  if(s.theme==='itachi'){
    const r=reflectionProfile(i);
    style+=';--reflection-pattern:'+r.pattern+';--reflection-duration:'+r.duration+'s;--reflection-delay:'+r.delay+'s;--reflection-scale:'+r.scale+'%';
  }
  if(s.theme==='cyberpunk'&&finish.effect!=='silence'){
    const p=cyberpunkClarity(i);
    style+=';--cyber-clarity:'+p+';--cyber-saturation:'+(1+p*1.1)+';--cyber-contrast:'+(1+p*.45)+';--cyber-glow:'+(4+p*18)+'px';
  }
  return style;
}
function cyberpunkClarity(i){return Math.max(0,Math.min(1,(50000-(Number(i.floatValue)||0))/50000));}
function signatureEmblem(s){
  if(s.emblem==='alik-samurai')return '<img class="alik-emblem" src="alik-emblem.png" alt="" draggable="false">';
  if(s.emblem==='itachi')return itachiEmblem();
  const shapes=['<path d="m20 5 5 10 10 5-10 5-5 10-5-10L5 20l10-5z"/>','<circle cx="20" cy="20" r="12"/><path d="m20 5 13 23H7z"/>','<path d="M27 8a13 13 0 1 0 0 24 15 15 0 0 1 0-24Z"/><circle cx="27" cy="20" r="2"/>','<path d="m20 5 13 8v14l-13 8-13-8V13zM7 13l26 14M33 13 7 27M20 5v30"/>','<ellipse cx="20" cy="20" rx="7" ry="16"/><ellipse cx="20" cy="20" rx="16" ry="7"/><circle cx="20" cy="20" r="3"/>','<path d="M6 28 20 5l14 23ZM6 12l14 23 14-23Z"/>'];
  return '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">'+shapes[s.emblem]+'</svg>';
}
function constellationArt(i){
  const signature=cardSignature(i),random=visualRandom(cardFingerprint(i));
  if(signature.theme==='doppler')return '<div class="star-art doppler-art"><span class="author-sigil">'+signatureEmblem(signature)+'</span></div>';
  if(signature.theme==='cyberpunk')return cyberpunkArt(i);
  if(signature.theme==='itachi')return amaterasuArt(i);
  const points=Array.from({length:7},()=>[25+random()*210,18+random()*130]);
  let marks='';
  if(signature.family===0)marks='<circle cx="130" cy="85" r="59"/><circle cx="130" cy="85" r="67" stroke-dasharray="1 8"/>';
  if(signature.family===1)marks='<ellipse cx="130" cy="85" rx="104" ry="39" transform="rotate(-26 130 85)"/><ellipse cx="130" cy="85" rx="104" ry="39" transform="rotate(26 130 85)"/>';
  if(signature.family===2)marks='<path d="M130 12 230 85 130 158 30 85ZM130 27 215 85 130 143 45 85Z"/>';
  let svg='<svg class="constellation" viewBox="0 0 260 170" fill="none" aria-hidden="true"><g stroke="currentColor" opacity=".22" stroke-width=".7">'+marks+'</g>';
  for(let k=0;k<32;k++){const x=(random()*260).toFixed(2),y=(random()*170).toFixed(2);svg+='<circle cx="'+x+'" cy="'+y+'" r="'+(.35+random()*.65).toFixed(2)+'" fill="currentColor" opacity="'+(.2+random()*.4).toFixed(2)+'"/>';}
  svg+='<path d="'+points.map(([x,y],k)=>(k?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' ')+'" stroke="currentColor" stroke-width=".7" opacity=".7"/>';
  for(const [x,y] of points)svg+='<circle cx="'+x.toFixed(2)+'" cy="'+y.toFixed(2)+'" r="2" fill="currentColor"/><circle cx="'+x.toFixed(2)+'" cy="'+y.toFixed(2)+'" r="5" stroke="currentColor" stroke-width=".5" opacity=".6"/>';
  return '<div class="star-art">'+svg+'</svg><span class="author-sigil">'+signatureEmblem(signature)+'</span></div>';
}
function cyberpunkArt(i){
  if(cardFinish(i).effect==='silence')return '<div class="star-art cyberpunk-art quiet-art"><span class="author-sigil cyberpunk-sigil">'+signatureEmblem(cardSignature(i))+'</span></div>';
  return '<div class="star-art cyberpunk-art"><span class="cyberpunk-corner top-left"></span><span class="cyberpunk-corner bottom-right"></span><span class="author-sigil cyberpunk-sigil">'+signatureEmblem(cardSignature(i))+'</span><span class="cyberpunk-tag">IDENTITY // '+cardFingerprint(i).toString(16).toUpperCase().padStart(8,'0')+'</span></div>';
}
function pixelNumbers(i){
  const glyphs=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001010010010','111101111101111','111101111001111'];
  const random=visualRandom(cardFingerprint(i)^0x8b17);let groups='';
  for(let n=0;n<66;n++){
    let pixels='';
    for(let d=0;d<3;d++)for(const [k,bit] of [...glyphs[Math.floor(random()*10)]].entries())if(bit==='1')pixels+='<rect x="'+(d*9+k%3*2)+'" y="'+(Math.floor(k/3)*2)+'" width="1.5" height="1.5"/>';
    groups+='<g transform="translate('+(n%6*45+4)+' '+(Math.floor(n/6)*44+12)+')"><g class="pixel-number" style="--digit-delay:-'+(random()*8).toFixed(2)+'s;--digit-time:'+(5+random()*5).toFixed(2)+'s">'+pixels+'</g></g>';
  }
  return '<svg class="pixel-numbers" viewBox="0 0 270 496" preserveAspectRatio="xMidYMid slice" aria-hidden="true" shape-rendering="crispEdges">'+groups+'</svg>';
}
function silenceMessage(){
  const phrase='silence is deafening?';let time=.6;
  return '<p class="silent-card" aria-label="'+phrase+'"><span aria-hidden="true">'+[...phrase].map((ch,n)=>{time+=ch===' '?.28:.07+(n%4)*.035;return '<span class="typed-letter" style="--letter-delay:'+time.toFixed(3)+'s">'+(ch===' '?' ':ch)+'</span>';}).join('')+'</span></p>';
}
function terminalProfile(i){
  const catalog=Math.max(0,Math.min(999,Number(i.catalog)||0));
  if(catalog===999)return {silent:true,rows:0,columns:0,linesPerSecond:0,duration:0};
  const intensity=catalog/998,rows=7+Math.floor(intensity*25),columns=14+Math.floor(intensity*36),linesPerSecond=.45+intensity*6;
  return {silent:false,rows,columns,linesPerSecond,lineHeight:22-Math.floor(intensity*13),duration:rows/linesPerSecond};
}
function terminalField(i,veil=false){
  const profile=terminalProfile(i);if(profile.silent)return '';
  const random=visualRandom(cardFingerprint(i)^0x7e12),alphabet='0123456789ABCDEF{}[]<>/\\:=+$#';
  const commands=['exec','trace','read','decode','sync','scan','link'];
  const lines=Array.from({length:profile.rows},(_,n)=>{
    let symbols='';for(let k=0;k<profile.columns;k++)symbols+=alphabet[Math.floor(random()*alphabet.length)];
    return '<span class="terminal-line" style="--type-delay:'+(n/profile.linesPerSecond).toFixed(3)+'s;--type-time:'+(1/profile.linesPerSecond*.85).toFixed(3)+'s;--type-steps:'+(profile.columns+10)+'">'+esc('>'+n.toString(16).padStart(2,'0')+' '+commands[n%commands.length]+' '+symbols)+'</span>';
  }).join('');
  return '<div class="'+(veil?'terminal-veil':'terminal-field')+'" aria-hidden="true"><div class="terminal-scroll" style="--terminal-duration:'+profile.duration.toFixed(3)+'s;--terminal-step:'+(profile.rows*profile.lineHeight)+'px;--terminal-line-height:'+profile.lineHeight+'px">'+lines+'</div></div>';
}

function itachiEmblem(){
  // Adapted from ShounenSuki's Mangekyou_Sharingan_Itachi.svg, CC BY-SA 3.0.
  // See ART-CREDITS.md. Original path, recolored iris; no external runtime assets.
  return '<svg class="itachi-eye" viewBox="0 0 300 300" aria-hidden="true"><circle cx="150" cy="150" r="145" fill="#bb2738" stroke="#070609" stroke-width="10"/><circle cx="150" cy="150" r="128" fill="none" stroke="#ec5263" stroke-opacity=".3" stroke-width="2"/><path fill="#070609" d="M177.6 10.7C135 68.4 155.4 100.7 179.8 118.5C260.9 160.6 274.8 214.5 255.9 244.9C237.3 191.9 198 172.4 158.5 194.9C86.9 238.6 40.7 231.2 15.7 196.6C58.2 203.1 109.1 193.5 107.9 128.3C109.5 97.6 111.5 16.6 177.6 10.7Z"/><circle cx="150" cy="150" r="20" fill="#d33a48"/></svg>';
}
function blackFlames(i,veil=false){
  const random=visualRandom(cardFingerprint(i)^(veil?0x7429:0x1947));
  const height=veil?460:180,width=260;
  let paths='';
  for(let k=0;k<13;k++){
    const x=k*22-15,tip=height-(50+random()*(veil?230:118)),bend=(random()-.5)*40,w=13+random()*16;
    paths+='<path class="blackflame" style="--flame-delay:-'+(random()*5).toFixed(2)+'s" d="M '+(x-w).toFixed(1)+' '+height+' C '+(x-30).toFixed(1)+' '+(tip+56).toFixed(1)+', '+(x+22).toFixed(1)+' '+(tip+48).toFixed(1)+', '+(x+bend).toFixed(1)+' '+tip.toFixed(1)+' C '+(x+bend+42).toFixed(1)+' '+(tip+35).toFixed(1)+', '+(x-4).toFixed(1)+' '+(tip+69).toFixed(1)+', '+(x+14).toFixed(1)+' '+(height-39)+' Q '+(x+25).toFixed(1)+' '+(height-56)+', '+(x+21).toFixed(1)+' '+(height-80)+' Q '+(x+51).toFixed(1)+' '+(height-35)+', '+(x+w).toFixed(1)+' '+height+' Z"/>';
  }
  return '<svg class="'+(veil?'amaterasu-veil':'amaterasu-flames')+'" viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="none" aria-hidden="true">'+paths+'</svg>';
}
function amaterasuArt(i){
  const finish=cardFinish(i);
  return '<div class="star-art amaterasu-art azat-art effect-'+finish.effect+'" data-finish="'+finish.effect+'"><div class="sharingan-aura"></div>'+azatBackground(i)+'<span class="author-sigil itachi-sigil">'+itachiEmblem()+'</span><div class="blindness-fog" aria-hidden="true"></div><div class="blindness-holo" aria-hidden="true"></div><span class="eye-caption">ITACHI · MANGEKYŌ SHARINGAN</span></div>';
}
function akatsukiClouds(i,veil=false){
  const random=visualRandom(cardFingerprint(i)^0x614cd),height=veil?460:180;
  let clouds='';
  for(let k=0;k<(veil?10:6);k++){
    const x=k%2===0?-10+random()*55:145+random()*35,y=12+Math.floor(k/2)*(veil?88:51)+random()*12,scale=.62+random()*.38;
    clouds+='<g class="akatsuki-cloud" transform="translate('+x.toFixed(2)+' '+y.toFixed(2)+') scale('+scale.toFixed(2)+')"><path d="M8 39C-3 34 2 21 14 22C12 8 30 2 40 14C48-3 71 0 76 16C91 10 109 22 102 36C121 40 110 58 92 53L48 53C27 59 5 55 8 39Z"/><path class="cloud-curl" d="M18 29C30 14 54 23 48 37C45 46 30 43 35 34M62 19C74 13 89 21 83 32M50 53C68 40 84 39 97 44"/></g>';
  }
  return '<svg class="'+(veil?'technique-veil':'technique-background')+' cloud-field" viewBox="0 0 260 '+height+'" preserveAspectRatio="none" aria-hidden="true">'+clouds+'</svg>';
}
function fallingLeaves(i,veil=false){
  const random=visualRandom(cardFingerprint(i)^0x1eaf),height=veil?460:180;
  let leaves='';
  for(let k=0;k<(veil?14:12);k++){
    const x=random()*260,y=random()*height,angle=random()*300-150,scale=.55+random()*.8;
    const color=['#24563e','#326b4d','#1d4637','#3b7253'][k%4];
    leaves+='<g transform="translate('+x.toFixed(2)+' '+y.toFixed(2)+')"><g class="falling-leaf" style="--leaf-delay:-'+(random()*12).toFixed(2)+'s;--leaf-duration:'+(8+random()*7).toFixed(2)+'s;--leaf-drift:'+(12+random()*25).toFixed(2)+'px"><g transform="rotate('+angle.toFixed(2)+') scale('+scale.toFixed(2)+')"><path d="M0 22C-20 13-16-6 0-23C18-9 20 12 0 22Z" fill="'+color+'"/><path d="M0 27Q-4 3 0-18M-1 9l-9-8M-2 0l9-10M-2 13l10-8" fill="none" stroke="#24301e" stroke-width="1.1" opacity=".75"/></g></g></g>';
  }
  return '<svg class="'+(veil?'technique-veil':'technique-background')+' leaf-field" viewBox="0 0 260 '+height+'" preserveAspectRatio="none" aria-hidden="true">'+leaves+'</svg>';
}
function azatBackground(i,veil=false){
  const effect=cardFinish(i).effect;
  return effect==='leaves'?fallingLeaves(i,veil):effect==='akatsuki'?akatsukiClouds(i,veil):blackFlames(i,veil);
}
function collectibleFront(i){
  const found=findDesign(i.designId),set=getSet(i.setId),s=cardSignature(i);
  const silent=cardFinish(i).effect==='silence';
  const probability=set?.snapshot?.standard.cards[i.designId]||0;
  if(silent)return silenceMessage()+cyberpunkArt(i)+
    '<div class="who">'+esc(found?playerName(found.design.authorId):'Unknown author')+'</div><h3>'+esc(found?.design.title||'Card #'+i.designId)+'</h3>'+
    '<div class="ser"><span><small>FLOAT</small><b>'+floatText(i.floatValue)+'</b></span><span><small>CATALOG</small><b>№ '+catalogText(i.catalog)+'</b></span></div>'+
    '<div class="card-bottom"><span class="state '+i.state+'">'+i.state+'</span></div>';

  return (s.theme==='doppler'?dopplerSurface(i):s.theme==='itachi'?azatBackground(i,true)+'<div class="curse-surface" aria-hidden="true"></div><div class="curse-foil" aria-hidden="true"></div>':s.theme==='cyberpunk'&&!silent?'<div class="cyber-display" aria-hidden="true">'+terminalField(i)+pixelNumbers(i)+'<div class="cyber-holo"></div></div>':'')+'<div class="who">'+esc(found?playerName(found.design.authorId):'Unknown author')+' <span>SET '+esc(set?.ordinal??'?')+'</span></div>'+constellationArt(i)+
    '<div class="finish-name">'+(silent?'SAMURAI · SILENT EDITION':cardFinish(i).name)+' <span>◇</span></div><h3>'+esc(found?.design.title||'Card #'+i.designId)+'</h3>'+(silent?silenceMessage():'<p class="card-meme">'+esc(found?.design.meme||'')+'</p>')+
    '<div class="ser"><span><small>FLOAT</small><b>'+floatText(i.floatValue)+'</b></span><span><small>CATALOG</small><b>№ '+catalogText(i.catalog)+'</b></span></div>'+
    '<div class="card-bottom"><span class="state '+i.state+'">'+i.state+'</span><span>'+ (probability?pct(probability):'—')+' pack chance</span></div><div class="card-owner">Held by '+esc(playerName(i.ownerId))+'</div>';
}
function wrapCardInspection(i,details){
  const close=details.slice(0,details.indexOf('</button>')+9);
  const back=details.slice(details.indexOf('</button>')+9);
  return close+'<div class="inspection-toolbar"><span class="eyebrow">COLLECTIBLE / #'+i.id+'</span><button type="button" data-card-flip aria-controls="inspectFront inspectBack" aria-label="Show card details">Flip to details ↻</button></div>'+
    '<div class="inspection-face" id="inspectFront"><div class="collectible celestial inspect-collectible" data-foil style="'+visualStyle(i)+'">'+collectibleFront(i)+'</div><p class="inspection-hint">'+(cardFinish(i).effect==='silence'?'Flip for the promise and its details.':'Move your pointer or drag across the card to catch the foil.<br>Artwork is cosmetic. Flip for the promise and its details.')+'</p></div>'+
    '<div class="inspection-face inspection-back" id="inspectBack" hidden>'+back+'</div>';
}
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-card-flip]');if(!button)return;
  const front=document.getElementById('inspectFront'),back=document.getElementById('inspectBack');
  if(!front||!back)return;
  const showBack=back.hidden;front.hidden=showBack;back.hidden=!showBack;
  button.textContent=showBack?'Flip to artwork ↻':'Flip to details ↻';
  button.setAttribute('aria-label',showBack?'Show card artwork':'Show card details');
  improveAccessibility(showBack?back:front);
});
function resetCardFoil(card){for(const key of ['--tilt-x','--tilt-y','--shine-x','--shine-y','--doppler-angle','--reflect-x','--reflect-y','--edge-light'])card.style.removeProperty(key);card.classList.remove('foil-active');}
document.addEventListener('pointermove',e=>{
  const card=e.target.closest('[data-foil]');if(!card||card.querySelector('.silent-card')||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  if(e.pointerType==='touch'&&!e.buttons)return;
  const r=card.getBoundingClientRect(),x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));
  card.style.setProperty('--tilt-x',((.5-y)*8).toFixed(2)+'deg');card.style.setProperty('--tilt-y',((x-.5)*10).toFixed(2)+'deg');
  if(card.querySelector('.doppler-surface')){
    card.style.setProperty('--doppler-angle',(100+x*55-y*20).toFixed(2)+'deg');
    card.style.setProperty('--reflect-x',((1-x)*100).toFixed(2)+'%');
    card.style.setProperty('--reflect-y',((1-y)*100).toFixed(2)+'%');
    card.style.setProperty('--edge-light',(.12+Math.pow(Math.max(Math.abs(x-.5),Math.abs(y-.5))*2,3)*.35).toFixed(3));
  }
  card.style.setProperty('--shine-x',(x*100).toFixed(1)+'%');card.style.setProperty('--shine-y',(y*100).toFixed(1)+'%');card.classList.add('foil-active');
});
document.addEventListener('pointerout',e=>{const card=e.target.closest('[data-foil]');if(card&&!card.contains(e.relatedTarget))resetCardFoil(card);});
for(const event of ['pointerup','pointercancel'])document.addEventListener(event,e=>{const card=e.target.closest('[data-foil]');if(card&&e.pointerType!=='mouse')resetCardFoil(card);});

// Catalogue alone selects the finish. Float, owner and instance ID cannot change it.
function dopplerProfile(i){
  const catalog=Math.max(0,Math.min(999,Math.floor(Number(i.catalog)||0)));
  return {catalog,emerald:catalog===999,greenPercent:catalog===999?100:catalog/20,greenCells:catalog===999?2000:catalog};
}
const dopplerCache=new Map();
function dopplerSurface(i){
  const p=dopplerProfile(i);if(dopplerCache.has(p.catalog))return dopplerCache.get(p.catalog);
  const random=visualRandom(visualHash('kadyr-doppler-v1:'+p.catalog));
  const phases=Array.from({length:6},()=>random()*Math.PI*2),cells=[];
  for(let y=0;y<100;y++)for(let x=0;x<80;x++){
    const u=x/80,v=y/100;
    const warp=Math.sin(u*6+v*4+phases[0])*.8+Math.sin(v*10-u*5+phases[1])*.35;
    const field=Math.sin(u*8+v*9+warp*3+phases[2])+.4*Math.sin(u*17-v*13+warp*2+phases[3]);
    const flow=u*10-v*8+warp*3+phases[4];
    const light=Math.max(0,Math.min(1,(Math.sin(flow)+1)/2*.8+(Math.sin(flow*3+Math.sin(v*16+phases[5]))+1)*.1));
    cells.push({x,y,field,light,green:false});
  }
  [...cells].sort((a,b)=>a.field-b.field).slice(0,p.greenCells*4).forEach(c=>c.green=true);
  let rects='';
  for(let y=0;y<100;y++){
    let start=0,last='';
    for(let x=0;x<=80;x++){
      const c=cells[y*80+x];
      const color=x===80?'':c.green?'hsl('+(142+Math.round(c.light*3)*4)+' 88% '+(13+Math.round(c.light*7)*4)+'%)':'hsl('+(215+Math.round(c.light*5)*6)+' 85% '+(14+Math.round(c.light*7)*4)+'%)';
      if(color!==last){if(x>start)rects+='<rect x="'+start+'" y="'+y+'" width="'+(x-start)+'" height="1" fill="'+last+'"/>';start=x;last=color;}
    }
  }
  const html='<div class="doppler-surface'+(p.emerald?' doppler-emerald':'')+'" aria-hidden="true" data-green-percent="'+p.greenPercent+'"><svg class="doppler-marble" viewBox="0 0 80 100" preserveAspectRatio="none">'+rects+'</svg><svg class="doppler-marble doppler-reflection" viewBox="0 0 80 100" preserveAspectRatio="none">'+rects+'</svg><div class="doppler-light"></div></div>';
  if(dopplerCache.size>=64)dopplerCache.delete(dopplerCache.keys().next().value);
  dopplerCache.set(p.catalog,html);return html;
}
