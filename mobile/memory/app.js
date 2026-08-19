'use strict';
const MOBILE_VERSION='0.1.0';
const SOURCE_VERSION='2.10.21';
const PROJECT_ID='memory-archive';
const DB_NAME='if_archive_v1_db',DB_STORE='state',DB_KEY='root';
const EVENT_STATUSES=['미확정','진행','해결','실패','중단','잠복','후속'];
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
const now=()=>new Date().toISOString();
const uid=p=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
let state=null, route={view:'home',cardId:'',tab:'overview',logId:'',logLimit:80}, search='', eventFilter='all';
let deferredInstall=null, saveTimer=0, previousSnapshot='';

function defaultState(){return{schemaVersion:1,appVersion:SOURCE_VERSION,settings:{themeId:'rose-cream',homeView:'grid',homeSort:'updated'},cards:[],trash:[],updatedAt:now()}}
function normalizeCard(c){
  c=(c&&typeof c==='object')?c:{};
  return {...c,id:c.id||uid('card'),name:c.name||'이름 없는 카드',avatar:c.avatar||'',cover:c.cover||'',description:c.description||'',characters:Array.isArray(c.characters)?c.characters:[],intros:Array.isArray(c.intros)?c.intros:[],worldSettings:c.worldSettings||{raw:'',sections:{},versions:[]},logBackups:Array.isArray(c.logBackups)?c.logBackups:[],logSummaries:Array.isArray(c.logSummaries)?c.logSummaries:[],oocEpisodes:Array.isArray(c.oocEpisodes)?c.oocEpisodes:[],diaryNotes:Array.isArray(c.diaryNotes)?c.diaryNotes:[],galleryItems:Array.isArray(c.galleryItems)?c.galleryItems:[],galleryAlbums:Array.isArray(c.galleryAlbums)?c.galleryAlbums:[],anniversaries:Array.isArray(c.anniversaries)?c.anniversaries:[],settings:(c.settings&&typeof c.settings==='object')?c.settings:{},updatedAt:c.updatedAt||now()}
}
function normalizeState(d){
  const base=defaultState(); if(!d||typeof d!=='object')return base;
  const s={...base,...d,settings:{...base.settings,...(d.settings||{})}};
  s.cards=Array.isArray(d.cards)?d.cards.map(normalizeCard):[];
  s.trash=Array.isArray(d.trash)?d.trash:[];
  return s;
}
function openDb(){return new Promise((res,rej)=>{const q=indexedDB.open(DB_NAME,1);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains(DB_STORE))q.result.createObjectStore(DB_STORE)};q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
async function idbGet(key){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readonly'),q=tx.objectStore(DB_STORE).get(key);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
async function idbSet(key,val){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(val,key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function loadState(){
  let data=null;try{data=await idbGet(DB_KEY)}catch{}
  if(!data){try{data=JSON.parse(localStorage.getItem(DB_KEY)||'null')}catch{}}
  state=normalizeState(data);previousSnapshot=JSON.stringify(state);render()
}
async function persist(){
  clearTimeout(saveTimer);state.updatedAt=now();const snap=JSON.stringify(state);
  try{if(previousSnapshot&&previousSnapshot!==snap)await idbSet(DB_KEY+'__previous',JSON.parse(previousSnapshot));await idbSet(DB_KEY,state);localStorage.setItem(DB_KEY,snap);previousSnapshot=snap}catch(e){toast('저장하지 못했어요.')}
}
function touch(card){card.updatedAt=now();clearTimeout(saveTimer);saveTimer=setTimeout(persist,260)}
function card(){return state.cards.find(c=>String(c.id)===String(route.cardId))||null}
function avatarHtml(src,cls='avatar'){return src?`<span class="${cls}"><img src="${esc(src)}" alt=""></span>`:`<span class="${cls} fallback" aria-hidden="true"></span>`}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1600)}
function pushRoute(next){
  route={...route,...next};history.pushState(route,'',location.pathname+location.search+'#'+encodeURIComponent(JSON.stringify(route)));render()
}
function replaceRoute(next){route={...route,...next};history.replaceState(route,'');render()}
window.addEventListener('popstate',e=>{if(e.state)route=e.state;else route={view:'home',cardId:'',tab:'overview',logId:'',logLimit:80};render()});
function setApp(html){$('#app').innerHTML=html;bindScrollTab()}
function topbar(title,sub='',back=true,right=''){return `<header class="topbar"><button class="back ${back?'':'hidden'}" data-act="back" aria-label="뒤로">‹</button><div class="titles"><h1>${esc(title)}</h1>${sub?`<p>${esc(sub)}</p>`:''}</div><div class="right">${right}</div></header>`}
function bottom(active){const nav=[['home','⌂','홈'],['events','◇','사건'],['memory','♡','기억'],['logs','≡','로그'],['more','•••','더보기']];return `<nav class="bottom-nav">${nav.map(([v,i,l])=>`<button data-nav="${v}" class="${active===v?'active':''}"><span class="ico">${i}</span><span>${l}</span></button>`).join('')}</nav>`}
function mainWrap(content){return `<main class="main">${content}</main>`}
function empty(title,desc){return `<div class="empty"><b>${esc(title)}</b><div class="small" style="margin-top:5px">${esc(desc)}</div></div>`}
function stat(n,l){return `<div class="stat"><b>${Number(n||0).toLocaleString()}</b><span>${esc(l)}</span></div>`}
function parseMaybeJson(v){if(typeof v!=='string')return v;const t=v.trim();if(!t)return '';try{return JSON.parse(t)}catch{return v}}
function textPreview(v,limit=180){if(Array.isArray(v))v=v.map(x=>typeof x==='string'?x:(x?.text||x?.summary||JSON.stringify(x))).join(' · ');else if(v&&typeof v==='object')v=v.text||v.summary||JSON.stringify(v);v=String(v||'').replace(/\s+/g,' ').trim();return v.length>limit?v.slice(0,limit)+'…':v}
function home(){
  const q=search.trim().toLowerCase();
  const cards=[...state.cards].filter(c=>!q||[c.name,c.description,c.folder].join(' ').toLowerCase().includes(q)).sort((a,b)=>String(b.lastOpenedAt||b.updatedAt||'').localeCompare(String(a.lastOpenedAt||a.updatedAt||'')));
  const body=`${topbar('추억보관함',`Mobile ${MOBILE_VERSION} · PC ${SOURCE_VERSION}`,false,'<button class="iconbtn" data-act="search-toggle" aria-label="검색">⌕</button>')}
  ${mainWrap(`<div class="hero"><div class="hero-row">${avatarHtml('')}<div><h2>밖에서도 사건·기억을 이어서 정리해요.</h2><p>PC 백업 JSON을 가져오면 같은 카드·화자·로그 구조로 검토할 수 있어요.</p></div></div>
  <div class="stats">${stat(state.cards.length,'카드')}${stat(state.cards.reduce((n,c)=>n+c.logBackups.length,0),'로그')}${stat(state.cards.reduce((n,c)=>n+c.logSummaries.length,0),'사건')}${stat(countReview(),'검토')}</div></div>
  <div class="section"><input class="search ${search?'':'hidden'}" id="homeSearch" placeholder="카드 이름·설명·폴더 검색" value="${esc(search)}"></div>
  <div class="section"><div class="section-head"><h2>카드</h2><span class="spacer"></span><button class="pillbtn" data-act="import">PC 백업 가져오기</button></div>
  <div class="cards">${cards.length?cards.map(cardTile).join(''):empty('카드가 없어요','PC에서 전체 백업 JSON을 가져오면 바로 이어서 볼 수 있어요.')}</div></div>`)}
  ${bottom('home')}`;
  setApp(body)
}
function cardTile(c){
  const chars=c.characters?.length||0,logs=c.logBackups?.length||0,events=c.logSummaries?.length||0;
  return `<button class="card" data-open-card="${esc(c.id)}"><div style="display:grid;grid-template-columns:54px minmax(0,1fr);gap:11px;align-items:center">${avatarHtml(c.avatar,'avatar')}<div><div class="card-title">${esc(c.name)}</div><div class="card-sub">${esc(c.description||'설명 없음')}</div><div class="card-meta"><span class="chip">${chars}명</span><span class="chip">${logs} 로그</span><span class="chip ${c.logSummaries?.some(x=>x.needsReview)?'review':''}">${events} 사건</span></div></div></div></button>`
}
function countReview(){return state.cards.reduce((n,c)=>n+(c.logSummaries||[]).filter(x=>x.needsReview||x.status==='미확정').length,0)}
function cardPage(){
  const c=card();if(!c)return replaceRoute({view:'home',cardId:''});
  c.lastOpenedAt=now();touch(c);
  const tabs=[['overview','개요'],['people','인물'],['events','사건'],['memory','기억'],['logs','로그']];
  const content=route.tab==='people'?peopleView(c):route.tab==='events'?eventsView(c):route.tab==='memory'?memoryView(c):route.tab==='logs'?logsView(c):overview(c);
  setApp(`${topbar(c.name,c.description||'카드',true,'<button class="iconbtn" data-act="export" aria-label="백업 내보내기">⇩</button>')}
  ${mainWrap(`<div class="tabs">${tabs.map(([v,l])=>`<button data-card-tab="${v}" class="${route.tab===v?'active':''}">${l}</button>`).join('')}</div>${content}`)}
  ${bottom(route.tab==='events'?'events':route.tab==='memory'?'memory':route.tab==='logs'?'logs':'home')}`)
}
function overview(c){
  const pc=(c.characters||[]).find(x=>x.kind==='pc'||x.align==='right');
  const latest=[...(c.logBackups||[])].sort((a,b)=>String(b.backupDate||b.updatedAt||'').localeCompare(String(a.backupDate||a.updatedAt||'')))[0];
  return `<section class="section"><div class="hero"><div class="hero-row">${avatarHtml(c.avatar)}<div><h2>${esc(c.name)}</h2><p>${esc(c.description||'설명 없음')}</p></div></div>
  <div class="stats">${stat(c.characters.length,'인물')}${stat(c.logBackups.length,'로그')}${stat(c.logSummaries.length,'사건')}${stat((c.oocEpisodes||[]).length,'OOC')}</div></div></section>
  <section class="section"><div class="section-head"><h2>현재 정보</h2></div><div class="cards">
    <div class="card"><div class="card-title">PC</div><div class="card-sub">${esc(pc?.name||'미지정')}</div></div>
    <div class="card"><div class="card-title">최근 로그</div><div class="card-sub">${esc(latest?.title||'없음')}</div></div>
    <div class="card"><div class="card-title">시점</div><div class="card-sub">${esc(c.startDate||c.worldSettings?.date||'미설정')}</div></div>
  </div></section>`
}
function peopleView(c){
  const rows=c.characters||[];
  return `<section class="section"><div class="section-head"><h2>캐릭터</h2><span class="spacer"></span><span class="small muted">${rows.length}명</span></div><div class="people">${rows.length?rows.map(ch=>`<button class="person" data-edit-person="${esc(ch.id||'')}">${avatarHtml(ch.avatar,'avatar')}<div><b>${esc(ch.name||'이름 없음')}</b><small>${esc(ch.kind==='pc'?'PC':ch.kind==='extra'?'등록 EXTRA':'NPC')} · ${esc(ch.role||ch.description||'')}</small></div><span>›</span></button>`).join(''):empty('등록 인물이 없어요','PC판에서 등록한 PC/NPC/EXTRA 정보가 여기에 표시돼요.')}</div></section>`
}
function eventStatus(e){return e.status||((e.needsReview||e.confidence<.75)?'미확정':'진행')}
function eventsView(c){
  let rows=[...(c.logSummaries||[])];
  if(eventFilter!=='all')rows=rows.filter(e=>eventStatus(e)===eventFilter);
  return `<section class="section"><div class="section-head"><h2>사건</h2><span class="spacer"></span><span class="small muted">${rows.length}건</span></div>
  <div class="toolbar"><button class="pillbtn ${eventFilter==='all'?'active':''}" data-event-filter="all">전체</button>${EVENT_STATUSES.map(s=>`<button class="pillbtn ${eventFilter===s?'active':''}" data-event-filter="${s}">${s}</button>`).join('')}</div>
  <div class="cards" style="margin-top:10px">${rows.length?rows.map((e,i)=>eventCard(e,i)).join(''):empty('조건에 맞는 사건이 없어요','다른 상태를 선택하거나 PC에서 사건 분석 결과를 가져와 주세요.')}</div></section>`
}
function eventCard(e,i){const st=eventStatus(e);return `<button class="card" data-edit-event="${esc(e.id||String(i))}"><div class="card-title">${esc(e.title||`사건 ${i+1}`)}</div><div class="card-sub">${esc(textPreview(e.summary||e.overview||e.events,190))}</div><div class="card-meta"><span class="chip ${st==='미확정'?'review':st==='해결'?'ok':''}">${esc(st)}</span>${e.worldDate?`<span class="chip">${esc(e.worldDate)}</span>`:''}${e.place?`<span class="chip">${esc(e.place)}</span>`:''}</div></button>`}
function collectMemories(c){
  const out=[];
  for(const m of (c.memories||c.longTermMemories||[]))out.push({kind:'object',source:m,title:m.title||m.name||'기억',text:m.text||m.content||m.summary||''});
  (c.logSummaries||[]).forEach((s,i)=>{const v=parseMaybeJson(s.memoryCandidates);if(Array.isArray(v))v.forEach((x,j)=>out.push({kind:'summary-array',summary:s,index:j,title:s.title||`사건 ${i+1}`,text:typeof x==='string'?x:(x.text||x.summary||JSON.stringify(x))}));else if(String(v||'').trim())out.push({kind:'summary-text',summary:s,title:s.title||`사건 ${i+1}`,text:String(v)})});
  return out
}
function memoryView(c){
  const rows=collectMemories(c);
  return `<section class="section"><div class="section-head"><h2>기억</h2><span class="spacer"></span><span class="small muted">${rows.length}개</span></div><div class="cards">${rows.length?rows.map((m,i)=>`<button class="card" data-edit-memory="${i}"><div class="card-title">${esc(m.title)}</div><div class="card-sub">${esc(textPreview(m.text,220))}</div><div class="card-meta"><span class="chip">${m.kind==='object'?'확정/구조 기억':'사건 기억 후보'}</span></div></button>`).join(''):empty('기억 후보가 없어요','사건의 memoryCandidates 또는 장기 기억 데이터가 생기면 여기서 검토할 수 있어요.')}</div></section>`
}
function logsView(c){
  const logs=[...(c.logBackups||[])].sort((a,b)=>String(b.backupDate||b.updatedAt||'').localeCompare(String(a.backupDate||a.updatedAt||'')));
  return `<section class="section"><div class="section-head"><h2>대화 로그</h2><span class="spacer"></span><span class="small muted">${logs.length}개</span></div><div class="loglist">${logs.length?logs.map(l=>`<button class="card logrow" data-open-log="${esc(l.id)}"><div><div class="card-title">${esc(l.title||'로그')}</div><div class="card-sub">${esc(l.worldDate||l.backupDate||'')}</div></div><span class="count">${(l.blocks||[]).length.toLocaleString()}개 ›</span></button>`).join(''):empty('로그가 없어요','PC판에서 백업한 제타 로그를 가져오면 모바일에서 읽을 수 있어요.')}</div></section>`
}
function globalView(kind){
  if(!route.cardId&&state.cards.length===1)route.cardId=state.cards[0].id;
  const c=card();
  if(!c){
    setApp(`${topbar(kind==='events'?'사건':kind==='memory'?'기억':'로그','먼저 카드를 선택해 주세요',false)}${mainWrap(empty('선택된 카드가 없어요','홈에서 카드를 열어 주세요.'))}${bottom(kind)}`);return
  }
  route.tab=kind;route.view='card';cardPage()
}
function moreView(){
  setApp(`${topbar('더보기',`Mobile ${MOBILE_VERSION} · source ${SOURCE_VERSION}`,false)}${mainWrap(`
  <section class="section"><div class="cards">
    <button class="card" data-act="import"><div class="card-title">PC 백업 가져오기</div><div class="card-sub">PC에서 내보낸 전체 JSON을 모바일 저장소에 복원합니다.</div></button>
    <button class="card" data-act="export"><div class="card-title">모바일 전체 백업 내보내기</div><div class="card-sub">PC 추억보관함이 다시 읽을 수 있는 state 래퍼 JSON입니다.</div></button>
    <button class="card" data-act="install"><div class="card-title">홈 화면에 설치</div><div class="card-sub">지원되는 브라우저에서는 PWA로 설치할 수 있어요.</div></button>
    <div class="versionbox"><b>배포 정보</b><br>projectId: ${PROJECT_ID}<br>mobileVersion: ${MOBILE_VERSION}<br>mobileSourceVersion: ${SOURCE_VERSION}<br><span class="muted">모바일에서 독립 AI 분석/수집은 아직 활성화하지 않았어요. 동일 원문을 다른 로직으로 해석하지 않기 위해 PC/Core 결과를 가져와 검토하는 흐름을 우선합니다.</span></div>
  </div></section>`)}${bottom('more')}`)
}
function logPage(){
  const c=card(),log=c?.logBackups?.find(l=>String(l.id)===String(route.logId));if(!c||!log)return history.back();
  const blocks=log.blocks||[],limit=Math.min(route.logLimit||80,blocks.length),visible=blocks.slice(0,limit);
  setApp(`<div class="zeta-shell"><header class="zeta-top"><button data-act="back">‹</button><b>${esc(log.title||'대화 로그')}</b></header><div class="zeta-stream">${renderLog(visible,c)}${limit<blocks.length?`<button class="loadmore" data-act="more-log">다음 ${Math.min(80,blocks.length-limit)}개 불러오기 · ${limit}/${blocks.length}</button>`:''}</div></div>`)
}
function speakerKey(b){
  if(b.type==='user'||b.speakerKind==='pc'||['user','__user__'].includes(String(b.speakerId||''))||b.sourceSide==='right'||b.speakerSide==='right')return'pc';
  if(b.speakerId||b.speakerName||b.guestSpeakerName||b.speakerHint||b.speakerKind==='extra'||b.speakerSide==='left'||b.sourceSide==='left')return'npc';
  return'none'
}
function personForBlock(b,c){
  if(speakerKey(b)==='pc'){const p=(c.characters||[]).find(x=>x.kind==='pc'||x.align==='right');return{name:p?.name||b.speakerName||'사용자',avatar:p?.avatar||''}}
  const id=String(b.speakerId||'');const ch=(c.characters||[]).find(x=>String(x.id)===id)||null;
  return{name:ch?.name||b.speakerName||b.guestSpeakerName||b.speakerHint||id.replace(/^__named__:/,'')||'NPC',avatar:ch?.avatar||b.speakerSnapshot?.avatar||''}
}
function renderLog(blocks,c){
  let html='',i=0;
  while(i<blocks.length){
    const source=blocks[i].sourceId||`__${blocks[i].id||i}`,group=[];let j=i;
    while(j<blocks.length&&(blocks[j].sourceId||`__${blocks[j].id||j}`)===source){group.push(blocks[j]);j++}
    html+=renderGroup(group,c);i=j
  }
  return html
}
function renderGroup(group,c){
  let html='',run=[],key=null;
  const flush=()=>{if(!run.length)return;html+=renderRun(run,key,c);run=[]};
  for(const b of group){
    if(b.type==='infobox'){flush();html+=renderInfo(b,c);key=null;continue}
    if(b.type==='divider'){flush();html+='<div class="zdivider"></div>';key=null;continue}
    const k=speakerKey(b)==='none'?'narr':speakerKey(b);
    if(key!==null&&k!==key)flush();
    key=k;run.push(b)
  }
  flush();return `<div class="zmsg">${html}</div>`
}
function renderRun(run,key,c){
  if(key==='narr'){
    const body=run.map(b=>`<div class="zrich">${rich(b.raw??b.text??'',c,null)}</div>`).join('');
    return `<section class="znarr"><span class="zglyph"><svg viewBox="0 0 12 10"><path d="M0 1.5H12 M0 5H8 M0 8.5H5"/></svg></span>${body}</section>`
  }
  const p=personForBlock(run[0],c),body=run.map(b=>`<div class="zrich">${rich(b.raw??b.text??'',c,p)}</div>`).join('');
  const av=p.avatar?`<img class="zavatar" src="${esc(p.avatar)}" alt="">`:`<span class="zavatar fallback"></span>`;
  const main=`<div class="zmain"><div class="zname">${esc(p.name)}</div><div class="zbubble">${body}</div></div>`;
  return key==='pc'?`<section class="zspeaker pc">${main}${av}</section>`:`<section class="zspeaker npc">${av}${main}</section>`
}
function renderInfo(b,c){
  const raw=String(b.raw??b.text??''),m=b.meta||{},rows={
    date:m.date||matchLine(raw,/^(?:📅\s*)?(?:날짜|일자)\s*[:：]?\s*(.*)$/imu)||'미상',
    time:m.time||matchLine(raw,/^(?:⏰\s*)?(?:시간)\s*[:：]?\s*(.*)$/imu)||'미상',
    place:m.place||m.location||matchLine(raw,/^(?:📍\s*)?(?:장소|위치)\s*[:：]?\s*(.*)$/imu)||'미상',
    situation:m.situation||m.scene||matchLine(raw,/^(?:🎬\s*)?(?:상황|시점)\s*[:：]?\s*(.*)$/imu)||'미상'
  };
  return `<section class="zinfo">${[['📅 날짜',rows.date],['⏰ 시간',rows.time],['📍 장소',rows.place],['🎬 상황',rows.situation]].map(([k,v])=>`<div class="zinfo-row"><b>${k}</b><span>${rich(v,c,null)}</span></div>`).join('')}</section>`
}
function matchLine(raw,re){const m=raw.match(re);return m?m[1].trim():''}
function inline(s,c,p){
  s=esc(s);
  s=s.replace(/\{\{user\}\}/gi,esc((c.characters||[]).find(x=>x.kind==='pc'||x.align==='right')?.name||'사용자'));
  s=s.replace(/\{\{char\}\}/gi,esc(p?.name||(c.characters||[]).find(x=>x.kind!=='pc'&&x.align!=='right')?.name||'캐릭터'));
  const code=[];s=s.replace(/`([^`\n]+)`/g,(_,x)=>`@@C${code.push(x)-1}@@`);
  s=s.replace(/\*\*\*([^*\n]+)\*\*\*/g,'<strong><em>$1</em></strong>');
  s=s.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
  s=s.replace(/~([^~\n]+)~/g,'<s>$1</s>');
  s=s.replace(/@@C(\d+)@@/g,(_,i)=>`<span class="zcode">${code[+i]}</span>`);
  return s
}
function rich(raw,c,p){
  raw=String(raw||'').replace(/\r\n?/g,'\n');
  const info=[];raw=raw.replace(/```InfoBox\s*([\s\S]*?)```/gi,(_,body)=>`@@INFO${info.push(body)-1}@@`);
  const blocks=[];raw=raw.replace(/```([\s\S]*?)```/g,(_,body)=>`@@BLOCK${blocks.push(body)-1}@@`);
  const out=[];for(const line of raw.split('\n')){
    const t=line.trim();
    if(/^@(?:[^:]+)?:\s*$/.test(t))continue;
    if(/^(?:---|___|\*\*\*)$/.test(t)){out.push('<div class="zdivider"></div>');continue}
    let m=t.match(/^(#{1,6})\s+(.+)$/);if(m){const n=Math.min(m[1].length,4);out.push(`<h${n}>${inline(m[2],c,p)}</h${n}>`);continue}
    if(/^@@BLOCK(\d+)@@$/.test(t)){const i=+t.match(/\d+/)[0];out.push(`<div class="zcodeblock">${blocks[i]}</div>`);continue}
    if(/^@@INFO(\d+)@@$/.test(t)){const i=+t.match(/\d+/)[0];out.push(`<details class="zcodeblock"><summary>InfoBox</summary>${inline(info[i],c,p)}</details>`);continue}
    if(/^>\s?/.test(t)){out.push(`<div class="zquote">${inline(t.replace(/^>\s?/,''),c,p)}</div>`);continue}
    if(/^(?:\*|-|\+|•)\s+/.test(t)){out.push(`<div class="zlist">• ${inline(t.replace(/^(?:\*|-|\+|•)\s+/,''),c,p)}</div>`);continue}
    if(!t){out.push('<div style="height:.82em"></div>');continue}
    out.push(`<p>${inline(line,c,p)}</p>`)
  }return out.join('')
}
function openSheet(title,body,actions=''){const root=$('#sheetRoot');root.innerHTML=`<div class="sheet-backdrop" data-act="sheet-close"><section class="sheet" role="dialog" aria-modal="true" onclick="event.stopPropagation()"><h2>${esc(title)}</h2>${body}${actions?`<div class="sheet-actions">${actions}</div>`:''}</section></div>`}
function closeSheet(){$('#sheetRoot').innerHTML=''}
function editEvent(id){
  const c=card(),e=(c.logSummaries||[]).find((x,i)=>String(x.id||i)===String(id));if(!e)return;
  openSheet('사건 검토',`<div class="field"><label>제목</label><input id="evTitle" value="${esc(e.title||'')}"></div><div class="field"><label>상태</label><select id="evStatus">${EVENT_STATUSES.map(s=>`<option ${eventStatus(e)===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="field"><label>날짜 · 시간 · 장소</label><input value="${esc([e.worldDate,e.time,e.place].filter(Boolean).join(' · '))}" disabled></div><div class="field"><label>사건 내용</label><textarea id="evSummary">${esc(e.summary||e.overview||'')}</textarea></div><div class="field"><label>확정 사실</label><textarea id="evFacts">${esc(typeof e.facts==='string'?e.facts:JSON.stringify(e.facts||'',null,2))}</textarea></div><div class="field"><label>기억 후보</label><textarea id="evMemory">${esc(typeof e.memoryCandidates==='string'?e.memoryCandidates:JSON.stringify(e.memoryCandidates||'',null,2))}</textarea></div><div class="field"><label>미해결/후속</label><textarea id="evUnresolved">${esc(e.unresolved||e.foreshadowing||'')}</textarea></div>`,`<button class="btn" data-act="sheet-close">취소</button><button class="btn primary" data-save-event="${esc(e.id||id)}">저장</button>`)
}
function saveEvent(id){
  const c=card(),e=(c.logSummaries||[]).find((x,i)=>String(x.id||i)===String(id));if(!e)return;
  e.title=$('#evTitle').value.trim()||e.title;e.status=$('#evStatus').value;e.summary=$('#evSummary').value;e.facts=$('#evFacts').value;e.memoryCandidates=$('#evMemory').value;e.unresolved=$('#evUnresolved').value;e.needsReview=e.status==='미확정';e.mobileReviewedAt=now();e.updatedAt=now();touch(c);closeSheet();render();toast('사건을 저장했어요.')
}
function editMemory(index){
  const c=card(),rows=collectMemories(c),m=rows[index];if(!m)return;
  openSheet('기억 검토',`<div class="field"><label>출처</label><input value="${esc(m.title)}" disabled></div><div class="field"><label>기억 내용</label><textarea id="memText">${esc(m.text)}</textarea></div>`,`<button class="btn" data-act="sheet-close">취소</button><button class="btn primary" data-save-memory="${index}">저장</button>`)
}
function saveMemory(index){
  const c=card(),rows=collectMemories(c),m=rows[index],v=$('#memText').value;if(!m)return;
  if(m.kind==='object'){m.source.text=v;m.source.content=v;m.source.updatedAt=now()}
  else if(m.kind==='summary-text'){m.summary.memoryCandidates=v;m.summary.updatedAt=now()}
  else if(m.kind==='summary-array'){const arr=parseMaybeJson(m.summary.memoryCandidates);if(Array.isArray(arr)){if(typeof arr[m.index]==='string')arr[m.index]=v;else if(arr[m.index]&&typeof arr[m.index]==='object')arr[m.index].text=v;m.summary.memoryCandidates=JSON.stringify(arr,null,2)}}
  touch(c);closeSheet();render();toast('기억을 저장했어요.')
}
function editPerson(id){
  const c=card(),p=(c.characters||[]).find(x=>String(x.id)===String(id));if(!p)return;
  openSheet('캐릭터 확인',`<div class="field"><label>이름</label><input id="pName" value="${esc(p.name||'')}"></div><div class="field"><label>분류</label><select id="pKind"><option value="pc" ${p.kind==='pc'?'selected':''}>PC</option><option value="npc" ${p.kind!=='pc'&&p.kind!=='extra'?'selected':''}>NPC</option><option value="extra" ${p.kind==='extra'?'selected':''}>등록 EXTRA</option></select></div><div class="field"><label>역할/설명</label><textarea id="pDesc">${esc(p.role||p.description||'')}</textarea></div>`,`<button class="btn" data-act="sheet-close">취소</button><button class="btn primary" data-save-person="${esc(id)}">저장</button>`)
}
function savePerson(id){
  const c=card(),p=(c.characters||[]).find(x=>String(x.id)===String(id));if(!p)return;
  p.name=$('#pName').value.trim()||p.name;p.kind=$('#pKind').value;p.role=$('#pDesc').value;p.description=p.description||p.role;p.updatedAt=now();touch(c);closeSheet();render();toast('캐릭터 정보를 저장했어요.')
}
function exportBackup(){
  const payload={format:'memory-archive-full-backup',schemaVersion:1,createdAt:now(),source:{platform:'mobile-web',mobileVersion:MOBILE_VERSION,mobileSourceVersion:SOURCE_VERSION},state};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`memory_archive_mobile_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)
}
async function importBackup(file){
  try{
    const obj=JSON.parse(await file.text()),d=obj.state||obj.data||obj.payload||obj.backup||obj.appState||obj;
    if(!d||!Array.isArray(d.cards))throw new Error('전체 백업 state를 찾지 못했어요.');
    const old=state;state=normalizeState(d);await idbSet(DB_KEY+'__previous',old);await persist();route={view:'home',cardId:'',tab:'overview',logId:'',logLimit:80};render();toast(`${state.cards.length}개 카드를 가져왔어요.`)
  }catch(e){toast(e.message||'백업을 읽지 못했어요.')}
}
function render(){
  document.documentElement.style.setProperty('--vh',`${visualViewport?.height||innerHeight}px`);
  if(route.view==='log')return logPage();
  if(route.view==='card')return cardPage();
  if(route.view==='events')return globalView('events');
  if(route.view==='memory')return globalView('memory');
  if(route.view==='logs')return globalView('logs');
  if(route.view==='more')return moreView();
  return home()
}
function bindScrollTab(){requestAnimationFrame(()=>$('.tabs .active')?.scrollIntoView({inline:'center',block:'nearest'}))}
document.addEventListener('click',e=>{
  const t=e.target.closest('button,[data-open-card],[data-card-tab],[data-open-log],[data-edit-event],[data-edit-memory],[data-edit-person]');if(!t)return;
  if(t.dataset.nav){const v=t.dataset.nav;if(v==='home')pushRoute({view:'home',cardId:'',tab:'overview'});else pushRoute({view:v,tab:v});return}
  if(t.dataset.openCard){pushRoute({view:'card',cardId:t.dataset.openCard,tab:'overview'});return}
  if(t.dataset.cardTab){replaceRoute({view:'card',tab:t.dataset.cardTab});return}
  if(t.dataset.openLog){pushRoute({view:'log',logId:t.dataset.openLog,logLimit:80});return}
  if(t.dataset.editEvent){editEvent(t.dataset.editEvent);return}
  if(t.dataset.editMemory){editMemory(+t.dataset.editMemory);return}
  if(t.dataset.editPerson){editPerson(t.dataset.editPerson);return}
  if(t.dataset.eventFilter){eventFilter=t.dataset.eventFilter;render();return}
  if(t.dataset.saveEvent){saveEvent(t.dataset.saveEvent);return}
  if(t.dataset.saveMemory){saveMemory(+t.dataset.saveMemory);return}
  if(t.dataset.savePerson){savePerson(t.dataset.savePerson);return}
  const a=t.dataset.act;if(!a)return;
  if(a==='back'){history.back();return}
  if(a==='search-toggle'){$('#homeSearch')?.classList.toggle('hidden');$('#homeSearch')?.focus();return}
  if(a==='import'){$('#importFile').click();return}
  if(a==='export'){exportBackup();return}
  if(a==='sheet-close'){closeSheet();return}
  if(a==='more-log'){route.logLimit+=80;render();return}
  if(a==='install'){if(deferredInstall){deferredInstall.prompt();deferredInstall=null}else toast('브라우저 메뉴의 “홈 화면에 추가”를 이용해 주세요.');return}
});
document.addEventListener('input',e=>{if(e.target.id==='homeSearch'){search=e.target.value;clearTimeout(e.target._t);e.target._t=setTimeout(home,120)}})
$('#importFile').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importBackup(f);e.target.value=''})
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e})
window.addEventListener('appinstalled',()=>toast('추억보관함 모바일을 설치했어요.'))
window.addEventListener('resize',()=>{document.documentElement.style.setProperty('--vh',`${visualViewport?.height||innerHeight}px`)},{passive:true})
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
history.replaceState(route,'');
loadState();
