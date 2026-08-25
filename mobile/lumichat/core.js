import { demoSeed } from './demo.js';

export const APP_VERSION='0.15.36';
export const SCHEMA_VERSION=19;
const EDGE='https://vulpttgewjfkxojimyxl.supabase.co/functions/v1/lumichat-mobile';
const EDGE_TIMEOUT=30000,BOOT_TIMEOUT=9000;
const ACTION_TIMEOUTS={health:9000,bootstrap:9000,'sync-get':15000,'sync-put':20000,'provider-config-get':15000,'provider-config-set':20000,models:30000,'provider-test':60000,chat:180000,'memory-extract':120000};
const STATE_KEY='lumichat-mobile-state-v19';
const LEGACY_KEY='lumichat-mobile-state-v18';
const DEV_KEY='lumichat-device-token-v1';
const SYNC_META_KEY='lumichat-mobile-sync-meta-v2';

export const $=(q,r=document)=>r.querySelector(q);
export const $$=(q,r=document)=>[...r.querySelectorAll(q)];
export const uid=(p='id')=>{const r=typeof crypto?.randomUUID==='function'?crypto.randomUUID().replaceAll('-','').slice(0,8):Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>b.toString(16).padStart(2,'0')).join('').slice(0,8);return`${p}_${Date.now().toString(36)}_${r}`};
export const now=()=>new Date().toISOString();
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const clone=v=>JSON.parse(JSON.stringify(v));
export const SPEAKER_TEXT_PALETTES={
  pc:['#65b9ff','#79d7ff','#8aa7ff','#7fc8e8'],
  character:['#e1b722','#f0a66b','#e5c85f','#d9a1ff'],
  extra:['#79d4c0','#e58aae','#c7a6ff','#f29f67','#8ec5ff','#8fd179','#f08b8b','#d8b977','#73c9e6','#e39acb']
};
function stableSpeakerIndex(key,length){let hash=2166136261;for(const ch of String(key||'')){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619)}return Math.abs(hash>>>0)%Math.max(1,length)}
export function defaultSpeakerTextColor(kind,key=''){const palette=SPEAKER_TEXT_PALETTES[kind]||SPEAKER_TEXT_PALETTES.extra;return palette[stableSpeakerIndex(`${kind}:${key}`,palette.length)]||'#c8d7ed'}
export function speakerTextColor(kind,key='',fallback=''){
  const raw=String(key||''),id=raw.includes(':')?raw.slice(raw.indexOf(':')+1):raw;
  let entity=null;
  if(kind==='character')entity=state?.characters?.find(x=>x.id===id)||null;
  else if(kind==='pc')entity=state?.personas?.find(x=>x.id===id)||state?.profile||null;
  else if(kind==='extra')entity=state?.extras?.find(x=>x.id===id)||null;
  const saved=String(entity?.dialogueTextColor||'').trim();
  return /^#[0-9a-f]{6}$/i.test(saved)?saved:(fallback||defaultSpeakerTextColor(kind,key));
}
const arr=v=>Array.isArray(v)?v:[];
const stamp=x=>String(x?.updatedAt||x?.createdAt||'');
const deletedStamp=x=>String(x?.deletedAt||'');

function randomToken(){
  const b=new Uint8Array(32);crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function token(){
  let t=localStorage.getItem(DEV_KEY)||'';
  if(!/^[A-Za-z0-9_-]{32,160}$/.test(t)){t=randomToken();localStorage.setItem(DEV_KEY,t)}
  return t;
}
export function getRecoveryKey(){return token()}
export function setRecoveryKey(value){
  const key=String(value||'').trim();
  if(!/^[A-Za-z0-9_-]{32,160}$/.test(key))throw new Error('복구키 형식이 올바르지 않아요.');
  localStorage.setItem(DEV_KEY,key);
  revision=0;
  writeSyncMeta({dirty:false,lastSyncedRevision:0,lastSyncedAt:null});
  return key;
}

export function getSyncMeta(){
  try{return{dirty:false,lastSyncedRevision:0,lastSyncedAt:null,...JSON.parse(localStorage.getItem(SYNC_META_KEY)||'{}')}}catch{return{dirty:false,lastSyncedRevision:0,lastSyncedAt:null}}
}
function writeSyncMeta(patch){const next={...getSyncMeta(),...patch};localStorage.setItem(SYNC_META_KEY,JSON.stringify(next));try{window.dispatchEvent(new CustomEvent('lumichat-sync-status',{detail:next}))}catch{}return next}
function persistLocal(dirty=true){
  state.updatedAt=state.updatedAt||now();
  localStorage.setItem(STATE_KEY,JSON.stringify(state));
  writeSyncMeta({dirty:Boolean(dirty),lastLocalAt:now()});
}

export async function edge(action,payload={},timeoutMs=ACTION_TIMEOUTS[action]||EDGE_TIMEOUT){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);let r;
  try{
    r=await fetch(EDGE,{method:'POST',headers:{'content-type':'application/json','x-lumichat-device':token()},body:JSON.stringify({action,...payload}),cache:'no-store',signal:controller.signal});
  }catch(e){
    if(e?.name==='AbortError')throw new Error('모바일 서버 응답이 늦어 요청을 중단했어요. 잠시 후 다시 시도해 주세요.');
    throw new Error('모바일 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
  }finally{clearTimeout(timer)}
  let d={};try{d=await r.json()}catch{}
  if(!r.ok){const e=new Error(d.error||`요청 실패 (${r.status})`);e.status=r.status;e.code=d.code;e.data=d;throw e}
  return d;
}

export function fresh(){
  const t=now();
  return{
    schemaVersion:SCHEMA_VERSION,
    profile:{name:'사용자',theme:'midnight',fontScale:1,uiFont:'system',bodyFont:'serif',chatFont:'system',inputFont:'system',dialogueTextColor:'#65b9ff',updatedAt:t},
    works:[],characters:[],intros:[],extras:[],guides:[],threads:[],memories:[],lorebooks:[],personas:[],widgetTemplates:[],presets:[],portableFonts:[],
    settings:{activeWorkId:null,activeCharacterId:null,activeThreadId:null,activePersonaId:null,currentView:'home',defaultProvider:'google',defaultModel:'gemini-3.6-flash',memoryProvider:'google',memoryModel:'gemini-3.6-flash',temperature:.85,maxTokens:1800,inputContextTokens:5000,recentMessageCount:24,memoryLimit:12,memoryMode:'manual',memoryEveryTurns:6,favoriteModels:[],defaultDisplayMode:'novel',deletedItems:[],trash:[],threadListSort:'updated-desc',threadListShowArchived:false,mediaMeta:{},tts:{voiceURI:'',rate:1,pitch:1,volume:1,autoRead:false}},
    appMeta:{},updatedAt:t
  }
}

function normalizeReadPolicy(value,fallback='auto'){return['required','auto','keyword','manual'].includes(value)?value:fallback}
export function normalize(s){
  s=s&&typeof s==='object'?s:fresh();
  if(s.state&&typeof s.state==='object'&&!s.characters)s=s.state;
  const base=fresh();
  for(const k of ['works','characters','intros','extras','guides','threads','memories','lorebooks','personas','widgetTemplates','presets','portableFonts'])s[k]=arr(s[k]);
  s.profile={...base.profile,...(s.profile||{})};
  s.settings={...base.settings,...(s.settings||{})};
  s.settings.deletedItems=arr(s.settings.deletedItems);s.settings.trash=arr(s.settings.trash).filter(x=>x&&x.deletedAt&&Date.now()-new Date(x.deletedAt).getTime()<30*86400000);s.settings.mediaMeta=s.settings.mediaMeta&&typeof s.settings.mediaMeta==='object'?s.settings.mediaMeta:{};s.settings.tts={voiceURI:'',rate:1,pitch:1,volume:1,autoRead:false,...(s.settings.tts||{})};
  s.settings.inputContextTokens=Math.max(2000,Math.min(30000,Number(s.settings.inputContextTokens||5000)));
  for(const x of s.extras){x.enabled=true}
  for(const p of s.personas){p.readPolicy=normalizeReadPolicy(p.readPolicy,'required');p.triggerKeywords=arr(p.triggerKeywords)}
  for(const g of s.guides){g.readPolicy=normalizeReadPolicy(g.readPolicy,'required');g.triggerKeywords=arr(g.triggerKeywords)}
  for(const m of s.memories){if(m.status==='candidate')m.status='approved';m.readPolicy=normalizeReadPolicy(m.readPolicy,m.pinned?'required':'auto');m.triggerKeywords=arr(m.triggerKeywords);m.tags=arr(m.tags)}
  for(const l of s.lorebooks){l.collectionType=['world','event'].includes(l.collectionType)?l.collectionType:'world';l.readPolicy=normalizeReadPolicy(l.readPolicy,l.mode==='always'?'required':l.mode==='manual'?'manual':'auto');l.triggerKeywords=arr(l.triggerKeywords?.length?l.triggerKeywords:l.keywords);l.keywords=arr(l.keywords?.length?l.keywords:l.triggerKeywords)}
  for(const th of s.threads){
    th.messages=arr(th.messages);th.manualLoreIds=arr(th.manualLoreIds);th.manualGuideIds=arr(th.manualGuideIds);th.pendingEventLoreIds=arr(th.pendingEventLoreIds);th.statusWidgets=arr(th.statusWidgets);th.statusWidgetState=th.statusWidgetState&&typeof th.statusWidgetState==='object'?th.statusWidgetState:{};
    th.memorySettings={limit:s.settings.memoryLimit||12,tokenBudget:1200,...(th.memorySettings||{})};
    th.contextSettings=th.contextSettings&&typeof th.contextSettings==='object'?th.contextSettings:{};
    th.contextSettings.inputTokenBudget=Math.max(2000,Math.min(30000,Number(th.contextSettings.inputTokenBudget||s.settings.inputContextTokens||5000)));
    th.userNotePolicy=normalizeReadPolicy(th.userNotePolicy,'auto');th.userNoteKeywords=arr(th.userNoteKeywords);
    th.displaySettings=th.displaySettings&&typeof th.displaySettings==='object'?th.displaySettings:{};
    th.displaySettings.speakerStyles=th.displaySettings.speakerStyles&&typeof th.displaySettings.speakerStyles==='object'?th.displaySettings.speakerStyles:{};th.pinned=Boolean(th.pinned);th.archived=Boolean(th.archived);th.tags=arr(th.tags);th.folder=String(th.folder||'');th.draftText=String(th.draftText||'');th.oneShotInstruction=String(th.oneShotInstruction||'');if(!th.branchedFrom&&th.parentThreadId)th.branchedFrom={threadId:th.parentThreadId,messageId:th.branchFromMessageId||null};if(th.branchedFrom?.threadId){th.parentThreadId=th.branchedFrom.threadId;th.branchFromMessageId=th.branchedFrom.messageId||th.branchFromMessageId||null}const le=th.displaySettings.ebook&&typeof th.displaySettings.ebook==='object'?th.displaySettings.ebook:{};th.displaySettings.ebook={enabled:le.enabled??Boolean(th.displaySettings.ebookMode),hideAvatars:le.hideAvatars??Boolean(th.displaySettings.ebookHideAvatars),fontFamily:le.fontFamily||th.displaySettings.ebookFontFamily||'serif',fontSize:Number(le.fontSize??th.displaySettings.ebookFontSize??19),fontWeight:Number(le.fontWeight??th.displaySettings.ebookFontWeight??400),lineHeight:Number(le.lineHeight??th.displaySettings.ebookLineHeight??1.9),letterSpacing:Number(le.letterSpacing??th.displaySettings.ebookLetterSpacing??0),narrationColor:le.narrationColor||th.displaySettings.ebookNarrationColor||th.displaySettings.narrationColor||'#d9d9d9',pcColor:le.pcColor||th.displaySettings.ebookPcColor||th.displaySettings.pcDialogueColor||'#59aefb',characterColor:le.characterColor||th.displaySettings.ebookCharacterColor||th.displaySettings.characterDialogueColor||'#ffb000',extraColor:le.extraColor||th.displaySettings.ebookExtraColor||th.displaySettings.extraDialogueColor||'#c8d7ed'};Object.assign(th.displaySettings,{ebookMode:th.displaySettings.ebook.enabled,ebookHideAvatars:th.displaySettings.ebook.hideAvatars,ebookFontFamily:th.displaySettings.ebook.fontFamily,ebookFontSize:th.displaySettings.ebook.fontSize,ebookFontWeight:th.displaySettings.ebook.fontWeight,ebookLineHeight:th.displaySettings.ebook.lineHeight,ebookLetterSpacing:th.displaySettings.ebook.letterSpacing,ebookNarrationColor:th.displaySettings.ebook.narrationColor,ebookPcColor:th.displaySettings.ebook.pcColor,ebookCharacterColor:th.displaySettings.ebook.characterColor,ebookExtraColor:th.displaySettings.ebook.extraColor});th.voiceSettings={...s.settings.tts,...(th.voiceSettings||{})};for(const m of th.messages){const legacyTags=arr(m.bookmarkTags);if(m.bookmarkNote&&typeof m.bookmarkNote==='object')m.bookmarkNote={title:String(m.bookmarkNote.title||''),note:String(m.bookmarkNote.note||''),tags:arr(m.bookmarkNote.tags).length?arr(m.bookmarkNote.tags):legacyTags};else m.bookmarkNote={title:'',note:String(m.bookmarkNote||''),tags:legacyTags};m.bookmarkTags=m.bookmarkNote.tags}
  }
  s.appMeta={...(s.appMeta||{})};s.schemaVersion=SCHEMA_VERSION;s.updatedAt=s.updatedAt||now();
  return s;
}

const stored=localStorage.getItem(STATE_KEY)||localStorage.getItem(LEGACY_KEY)||'null';
export let state=normalize(JSON.parse(stored));
export let revision=Number(getSyncMeta().lastSyncedRevision||0);
export let config=null;
export function setState(s,{dirty=false}={}){state=normalize(s);persistLocal(dirty)}

export function work(id=state.settings.activeWorkId){return state.works.find(x=>x.id===id)||state.works.find(x=>!x.archived)||null}
export function char(id=state.settings.activeCharacterId){return state.characters.find(x=>x.id===id)||state.characters.find(x=>!x.archived)||null}
export function thread(id=state.settings.activeThreadId){return state.threads.find(x=>x.id===id)||null}
export function persona(th=thread()){return state.personas.find(x=>x.id===th?.personaId)||state.personas.find(x=>x.id===state.settings.activePersonaId)||state.personas[0]||null}
export function scoped(items,c=char(),w=work(c?.workId)){return arr(items).filter(x=>{if(x.enabled===false)return false;if(x.scopeType==='global')return true;if(x.scopeType==='character')return x.characterId===c?.id;return !x.workId||x.workId===w?.id||x.characterId===c?.id})}
export function memories(c=char(),th=thread()){return state.memories.filter(m=>m.characterId===c?.id&&m.status==='approved'&&m.enabled!==false&&(!m.threadId||m.threadId===th?.id))}
export function extras(c=char()){return scoped(state.extras,c)}
export function presets(c=char()){return scoped(state.presets,c)}
export function guides(c=char()){return scoped(state.guides,c).sort((a,b)=>(b.priority||0)-(a.priority||0))}
export function lore(c=char()){return scoped(state.lorebooks,c).sort((a,b)=>(b.priority||0)-(a.priority||0))}

function mergeDeletedItems(localItems=[],remoteItems=[]){
  const map=new Map();
  for(const entry of [...arr(remoteItems),...arr(localItems)]){if(!entry?.key||!entry?.id)continue;const k=`${entry.key}:${entry.id}`,other=map.get(k);if(!other||deletedStamp(entry)>=deletedStamp(other))map.set(k,entry)}
  return[...map.values()];
}
function mergeItems(key,localItems=[],remoteItems=[],deletedItems=[]){
  const map=new Map(arr(remoteItems).filter(x=>x?.id).map(x=>[x.id,x]));
  for(const item of arr(localItems)){if(!item?.id)continue;const other=map.get(item.id);if(!other||stamp(item)>=stamp(other))map.set(item.id,item)}
  const tomb=new Map(deletedItems.filter(x=>x.key===key).map(x=>[x.id,x]));
  for(const[id,item]of map){const d=tomb.get(id);if(d&&deletedStamp(d)>=stamp(item))map.delete(id)}
  return[...map.values()];
}
export function mergeStates(local,remote){
  const l=normalize(clone(local||fresh())),r=normalize(clone(remote||fresh()));
  const deletedItems=mergeDeletedItems(l.settings?.deletedItems,r.settings?.deletedItems);
  const settings={...r.settings,...l.settings,deletedItems};
  const out={...r,...l,profile:{...r.profile,...l.profile},settings,schemaVersion:SCHEMA_VERSION};
  for(const key of ['works','characters','intros','extras','guides','threads','memories','lorebooks','personas','widgetTemplates','presets','portableFonts'])out[key]=mergeItems(key,l[key],r[key],deletedItems);
  out.updatedAt=stamp(l)>=stamp(r)?l.updatedAt:r.updatedAt;
  return normalize(out);
}
export function markDeleted(key,id){
  if(!key||!id)return;
  state.settings.deletedItems=arr(state.settings.deletedItems);const t=now(),old=state.settings.deletedItems.find(x=>x.key===key&&x.id===id);
  if(old)old.deletedAt=t;else state.settings.deletedItems.push({key,id,deletedAt:t});
  if(state.settings.deletedItems.length>5000)state.settings.deletedItems.sort((a,b)=>deletedStamp(b).localeCompare(deletedStamp(a))).splice(5000);
}

export function ensureDemoSeed(){
  if(state.appMeta?.mobileDemoSeed>=2)return false;
  const d=demoSeed,put=(key,item)=>{if(!state[key].some(x=>x.id===item.id))state[key].push(clone(item))};
  put('works',d.work);put('characters',d.character);put('personas',d.persona);put('intros',d.intro);d.extras.forEach(x=>put('extras',x));d.guides.forEach(x=>put('guides',x));d.lorebooks.forEach(x=>put('lorebooks',x));put('presets',d.preset);
  if(!state.settings.activeWorkId)state.settings.activeWorkId=d.work.id;if(!state.settings.activeCharacterId)state.settings.activeCharacterId=d.character.id;
  state.appMeta={...(state.appMeta||{}),mobileDemoSeed:2,mobileDemoSeedAt:now()};state.updatedAt=now();persistLocal(true);return true;
}

export async function boot(){
  const meta=getSyncMeta();ensureDemoSeed();
  try{
    const b=await edge('bootstrap',{},BOOT_TIMEOUT);revision=Number(b.revision||0);config=b.config||{};
    if(b.state){
      const remote=normalize(b.state);
      if(meta.dirty){state=mergeStates(state,remote);persistLocal(true);save(false).catch(e=>console.warn('초기 병합 저장 보류',e))}
      else setState(remote,{dirty:false});
    }else{
      persistLocal(true);save(false).catch(e=>console.warn('초기 서버 저장 보류',e))
    }
    const changed=ensureDemoSeed();if(changed)save(false).catch(console.warn);
    return{online:true,merged:Boolean(meta.dirty&&b.state)};
  }catch(e){console.warn(e);ensureDemoSeed();return{online:false,error:e}}
}

let timer;
export function saveSoon(){state.updatedAt=now();persistLocal(true);clearTimeout(timer);timer=setTimeout(()=>save(false).catch(console.warn),650)}
export async function save(forceReplace=false){
  state.updatedAt=now();persistLocal(true);
  let payload=state;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const r=await edge('sync-put',{revision,state:payload});revision=Number(r.revision||revision);state=normalize(payload);persistLocal(false);writeSyncMeta({dirty:false,lastSyncedRevision:revision,lastSyncedAt:now()});return r;
    }catch(e){
      if(e.status!==409)throw e;
      const remote=normalize(e.data?.state||fresh());revision=Number(e.data?.revision||revision);
      payload=forceReplace?normalize(payload):mergeStates(payload,remote);state=payload;persistLocal(true);
    }
  }
  throw new Error('동시에 여러 저장이 반복되어 동기화하지 못했어요. 로컬 변경은 기기에 안전하게 남아 있어요.');
}
export async function pull(overwrite=false){
  const r=await edge('sync-get');revision=Number(r.revision||0);
  if(r.state){state=overwrite?normalize(r.state):mergeStates(state,r.state);persistLocal(!overwrite&&getSyncMeta().dirty)}
  ensureDemoSeed();writeSyncMeta({lastSyncedRevision:revision,lastSyncedAt:now(),dirty:overwrite?false:getSyncMeta().dirty});return state;
}

function introSeedMessages(intro,c,{scene=null,createdAt=now(),previous=[]}={}){
  if(!intro)return[];const snap=clone(scene||intro.scene||{}),blocks=arr(intro.contentBlocks);let source=[];
  if(blocks.length){source=blocks.filter(b=>String(b.content||'').trim()).map(b=>{const who=b.speakerType==='player'||b.speaker==='player'?'user':'assistant';return{role:who,content:b.content,speakerType:b.speakerType||b.speaker||(who==='user'?'player':'character'),speakerId:b.speakerId||null,speakerName:b.speakerName||null}})}
  else if(intro.messages?.length)source=arr(intro.messages).map(m=>clone(m));
  else if(intro.content)source=[{role:'assistant',content:intro.content,speakerType:'auto'}];
  return source.map((m,index)=>{const prior=previous.find((x,legacyIndex)=>Number(x.introSourceIndex??legacyIndex)===index)||previous[index]||null;if(prior?.introDetached)return prior;return{...clone(m),id:prior?.id||uid('msg'),createdAt:prior?.createdAt||createdAt,sceneSnapshot:snap,provider:'intro',model:'intro',bookmarked:Boolean(prior?.bookmarked),introSourceId:intro.id,introSourceIndex:index,introBlockId:blocks[index]?.id||null,introRevision:intro.updatedAt||createdAt}})
}
export function isThreadIntroSeed(message,introId){if(!message)return false;if(message.introSourceId)return message.introSourceId===introId;return message.provider==='intro'||message.model==='intro'}
export function syncThreadsFromIntro(intro,c=null){
  if(!intro?.id)return 0;c=c||state.characters.find(x=>x.id===intro.characterId)||null;let changed=0;
  for(const th of state.threads){if(th.introId!==intro.id)continue;const messages=arr(th.messages),indices=[];messages.forEach((m,i)=>{if(isThreadIntroSeed(m,intro.id))indices.push(i)});if(!indices.length&&messages.length)continue;const first=indices.length?indices[0]:0,last=indices.length?indices.at(-1):-1,oldIntro=indices.map(i=>messages[i]),before=indices.length?messages.slice(0,first):[],after=indices.length?messages.slice(last+1):messages,seed=introSeedMessages(intro,c,{scene:intro.scene||{},createdAt:oldIntro[0]?.createdAt||th.createdAt||now(),previous:oldIntro});th.messages=[...before,...seed,...after];if(!after.length)th.scene=clone(intro.scene||{});th.updatedAt=now();changed++}
  return changed
}

export function makeThread(c,intro=null,opt={}){
  const t=now(),preset=state.presets.find(x=>x.id===opt.presetId)||null,scene=intro?.scene||{date:'',time:'',location:'',state:''};
  const defaultWidgets=clone(opt.statusWidgets||c.defaultStatusWidgets||[]),personaId=opt.personaId||intro?.recommendedPersonaId||state.personas.find(x=>x.workId===c.workId)?.id||state.personas[0]?.id||null;
  const th={id:uid('thread'),characterId:c.id,workId:c.workId||null,introId:intro?.id||null,title:opt.title||intro?.threadTitle||intro?.title||`${c.name}과의 대화`,personaId,scene:clone(scene),messages:[],createdAt:t,updatedAt:t,currentSceneStartMessageId:null,lastMemoryExtractionMessageId:null,displayMode:opt.displayMode||state.settings.defaultDisplayMode||'novel',activePresetId:preset?.id||intro?.recommendedPresetId||null,provider:preset?.provider||c.defaultProvider||state.settings.defaultProvider,activeModel:preset?.model||c.defaultModel||state.settings.defaultModel,manualLoreIds:arr(opt.manualLoreIds||intro?.initialLoreIds),manualGuideIds:arr(opt.manualGuideIds||intro?.initialGuideIds),activeExtraIds:arr(opt.activeExtraIds||intro?.initialExtraIds),pendingEventLoreIds:[],statusWidgets:defaultWidgets,statusWidgetState:{},displaySettings:{speakerStyles:{},ebook:{enabled:false,hideAvatars:true,fontFamily:'serif',fontSize:19,fontWeight:400,lineHeight:1.9,letterSpacing:0,narrationColor:'#d9d9d9',pcColor:'#59aefb',characterColor:'#ffb000',extraColor:'#c8d7ed'}},voiceSettings:clone(state.settings.tts||{voiceURI:'',rate:1,pitch:1,volume:1,autoRead:false}),userNote:'',userNotePolicy:'auto',userNoteKeywords:[],outputSettings:{maxTokens:Number(state.settings.maxTokens||2500),temperature:Number(state.settings.temperature??.85),recentMessages:Number(state.settings.recentMessageCount||24),narrationDensity:'auto'},memorySettings:{limit:state.settings.memoryLimit||12,tokenBudget:1200},contextSettings:{inputTokenBudget:Math.max(2000,Math.min(30000,Number(state.settings.inputContextTokens||5000))),worldLoreTokenBudget:1200,eventTokenBudget:1600}};
  if(intro)th.messages=introSeedMessages(intro,c,{scene,createdAt:t});
  state.threads.unshift(th);state.settings.activeThreadId=th.id;state.settings.activeCharacterId=c.id;state.settings.activeWorkId=c.workId||state.settings.activeWorkId;saveSoon();return th;
}

export function exportState(){
  const blob=new Blob([JSON.stringify({exportedAt:now(),app:'LumiChat',version:APP_VERSION,state},null,2)],{type:'application/json'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=`LumiChat_backup_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
export async function importState(file,mode='replace'){const raw=JSON.parse(await file.text()),next=clone(raw.state||raw);next.portableFonts=arr(raw.portableFonts||next.portableFonts);state=mode==='merge'?mergeStates(state,next):normalize(next);persistLocal(true);ensureDemoSeed();await save(mode!=='merge');return state}
