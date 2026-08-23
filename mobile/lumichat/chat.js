import{state,char,thread,persona,memories,lore,extras,guides,uid,now,saveSoon,edge,esc,clone,speakerTextColor,isThreadIntroSeed}from'./core.js';
import{widgetPrompt,parseWidgetBlock,widgetsHtml}from'./widgets.js';
import{detectMemoryConflict}from'./productivity.js';

const words=s=>[...new Set(String(s||'').toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(x=>x.length>1))];
const estimateTokens=s=>{const text=String(s||'');if(!text)return 0;const ascii=(text.match(/[\x00-\x7F]+/g)||[]).join('').length,nonAscii=Math.max(0,text.length-ascii);return Math.max(1,Math.ceil(ascii/4+nonAscii/1.75));};
const clip=(s,b)=>{s=String(s||'');if(!s)return'';const t=estimateTokens(s);if(t<=b)return s;return s.slice(0,Math.max(80,Math.floor(s.length*b/t)))+'…'};
const textOf=x=>`${x?.title||x?.name||''} ${x?.content||x?.description||''} ${(x?.tags||[]).join(' ')} ${(x?.triggerKeywords||x?.keywords||[]).join(' ')}`;
const overlap=(item,hay)=>{const iw=words(textOf(item));if(!iw.length||!hay.length)return 0;let n=0;for(const w of iw)if(hay.some(h=>h===w||h.includes(w)||w.includes(h)))n++;return n};
const policy=x=>['required','auto','keyword','manual'].includes(x?.readPolicy)?x.readPolicy:(x?.mode==='always'?'required':x?.mode==='manual'?'manual':'auto');
const keywordHit=(x,hay)=>{const ks=(x?.triggerKeywords?.length?x.triggerKeywords:x?.keywords)||[];return ks.some(k=>{const q=String(k||'').trim().toLowerCase();return q&&hay.some(h=>h.includes(q)||q.includes(h))})};
function ranked(items,hay,{manualIds=[],pendingIds=[],budget=1200,max=16,render=textOf}={}){
  const manual=new Set(manualIds||[]),pending=new Set(pendingIds||[]);
  const rows=[];
  for(const x of items){
    const p=policy(x),ov=overlap(x,hay),kw=keywordHit(x,hay),forced=p==='required'||pending.has(x.id)||(p==='manual'&&manual.has(x.id));
    if(p==='manual'&&!manual.has(x.id)&&!pending.has(x.id))continue;
    if(p==='keyword'&&!kw&&!pending.has(x.id))continue;
    if(p==='auto'&&!forced&&!ov&&!kw&&!x.pinned)continue;
    const score=(forced?1000:0)+(x.pinned?400:0)+(Number(x.priority||x.importance||5)*12)+(kw?180:0)+(ov*30)+Number(x.useCount||0)*.02;
    rows.push({x,score});
  }
  rows.sort((a,b)=>b.score-a.score||String(b.x.updatedAt||'').localeCompare(String(a.x.updatedAt||'')));
  const out=[];let used=0;
  for(const {x} of rows){const cost=estimateTokens(render(x));if(out.length&&used+cost>budget)continue;out.push(x);used+=Math.min(cost,budget);if(out.length>=max||used>=budget)break}
  return out;
}
function inputContextLimit(th){return Math.max(2000,Math.min(30000,Number(th?.contextSettings?.inputTokenBudget||state.settings.inputContextTokens||5000)))}
function cleanForContext(text){return String(text||'').replace(/<lumichat_widgets_v3>[\s\S]*?<\/lumichat_widgets_v3>/gi,'').replace(/<\/?lumi_(?:pc|char|extra)(?:\s+[^>]*)?>/gi,'').trim()}
function recentForPrompt(th,budget,maxCount=24){const pool=th.messages.slice(-Math.max(4,maxCount)),out=[];let used=0;for(let i=pool.length-1;i>=0;i--){const m=pool[i],content=cleanForContext(m.content);if(!content)continue;const remain=budget-used;if(remain<40)break;const cost=estimateTokens(content);if(cost>remain){if(!out.length&&remain>=80)out.unshift({role:m.role==='assistant'?'assistant':'user',content:clip(content,remain)});break}out.unshift({role:m.role==='assistant'?'assistant':'user',content});used+=cost}return out}
function haystack(th,input=''){return words([input,...th.messages.slice(-8).map(m=>cleanForContext(m.content)),th.scene?.location,th.scene?.state].join(' '))}
function selectedLore(c,th,input='',budget=1300){const hay=haystack(th,input);return ranked(lore(c),hay,{manualIds:th.manualLoreIds,pendingIds:th.pendingEventLoreIds,budget,max:18,render:x=>`${x.title||x.name||''} ${x.content||''}`})}
function selectedGuides(c,th,input='',budget=700){return ranked(guides(c),haystack(th,input),{manualIds:th.manualGuideIds,budget,max:12,render:x=>`${x.title||''} ${x.content||''}`})}
function selectedMemories(c,th,input='',budget=1100){return ranked(memories(c,th),haystack(th,input),{budget,max:Number(th.memorySettings?.limit||state.settings.memoryLimit||12),render:x=>`${x.title||''} ${x.content||''}`})}
function selectedExtras(c,th,input='',budget=850){const all=extras(c),hay=haystack(th,input),named=new Set(th.activeExtraIds||[]);for(const x of all)if(String([input,...th.messages.slice(-6).map(m=>m.content)].join(' ')).includes(x.name))named.add(x.id);return ranked(all,hay,{pendingIds:[...named],budget,max:10,render:x=>`${x.name||''} ${x.role||''} ${x.description||x.content||''} ${x.speech||''} ${x.relationships||''}`})}
function introFor(th){return state.intros.find(x=>x.id===th?.introId)||null}
function noteAllowed(th,input=''){const note=String(th?.userNote||'').trim();if(!note)return false;const p=th.userNotePolicy||'auto';if(p==='required')return true;if(p==='manual')return true;if(p==='keyword'){const h=haystack(th,input);return (th.userNoteKeywords||[]).some(k=>h.some(w=>w.includes(String(k).toLowerCase())||String(k).toLowerCase().includes(w)))}return true}
function oocDirective(input=''){const t=String(input||'').trim();return /^(?:\(\s*OOC\b|\[\s*OOC\b|OOC\s*:)/i.test(t)?'[OOC 메타 지시]\n이번 사용자 입력은 캐릭터 대사가 아니라 역할극 운영 지시다. 지시를 반영하되 OOC 문장을 이야기 속 실제 발화로 만들지 않는다.':''}
function densityDirective(th){const d=th?.outputSettings?.narrationDensity||'auto';return d==='dialogue'?'대사 중심으로 간결하게 진행한다.':d==='low'?'지문은 필요한 행동·공간 정보만 짧게 유지한다.':d==='rich'?'장면 감각, 거리, 표정과 행동 지문을 풍부하게 쓰되 반복은 피한다.':d==='balanced'?'대사와 지문을 균형 있게 배치한다.':''}
function systemPrompt(c,th,input=''){
  const limit=inputContextLimit(th),ctx=th.contextSettings||{},p=persona(th),w=state.works.find(x=>x.id===th.workId),intro=introFor(th),pre=state.presets.find(x=>x.id===th.activePresetId);
  const lr=selectedLore(c,th,input,Math.min(1800,Number(ctx.worldLoreTokenBudget||1300))),gs=selectedGuides(c,th,input,750),mem=selectedMemories(c,th,input,Math.min(1500,Number(th.memorySettings?.tokenBudget||1100))),ex=selectedExtras(c,th,input,900);
  const userName=p?.name||state.profile.name||'사용자',charName=c.name||'캐릭터';
  const mandatory=[
`[역할]\n당신은 LumiChat 역할극의 메인 캐릭터 '${charName}'를 중심으로 현재 장면을 이어 쓰는 소설 엔진이다. 메타 설명 없이 이야기 본문만 쓴다.`,
`[LumiChat 화자 출력 계약]\n캐릭터 본인의 대사·행동·지문 묶음은 <lumi_char>...</lumi_char>, 사용자(${userName})가 사용자가 입력한 의도 범위 안에서 실제로 수행한 대사·행동 재구성은 <lumi_pc>...</lumi_pc>, 등록된 다른 인물의 대사·행동은 <lumi_extra name="정확한 인물명">...</lumi_extra>로 감싼다. 일반적인 장면 지문은 태그 밖에 둘 수 있다. 이 태그는 화면 렌더링용이며 설명하지 않는다.`,
`[핵심 원칙]\n사용자의 새 선택·새 감정 결론·새 속마음·새 대사를 임의로 만들지 않는다. 사용자가 입력한 내용은 핵심 의도를 바꾸지 않고 자연스럽게 구현한다. 빈 전송이면 사용자의 새로운 선택을 만들어내지 말고 직전 장면에서 이미 진행 중인 캐릭터/환경의 반응과 사건만 자연스럽게 이어간다. 미기록 과거를 확정 사실처럼 만들지 않는다.`,
`[현재 장면]\n날짜 ${th.scene?.date||'미정'} / 시간 ${th.scene?.time||'미정'} / 장소 ${th.scene?.location||'미정'}\n${clip(th.scene?.state||'',180)}`
  ];
  const sections=[
    w?`[작품]\n${w.title||''}\n${clip(w.description||'',240)}`:'',
    `[메인 캐릭터]\n설명: ${clip(c.description||'',340)}\n외모: ${clip(c.appearance||'',180)}\n성격: ${clip(c.personality||'',260)}\n가치관/목표: ${clip(`${c.values||''} ${c.desires||''}`,220)}\n말투: ${clip(`${c.speechStyle||''} ${c.calls||''} ${c.vocabulary||''}`,260)}\n현재 관계: ${clip(c.relationship||c.initialRelation||'',240)}\n알고 있는 사실: ${clip(c.knownFacts||'',220)}\n모르는 사실: ${clip(c.unknownFacts||'',220)}\n금지: ${clip(`${c.forbiddenActions||''} ${c.bannedPhrases||''}`,240)}`,
    p?`[사용자 프로필 · ${p.readPolicy||'required'}]\n이름: ${p.name||userName}\n별칭: ${clip(p.aliases||'',100)}\n외형: ${clip(p.appearance||'',180)}\n성격: ${clip(p.personality||'',200)}\n말투: ${clip(p.speech||'',160)}\n배경: ${clip(p.background||p.description||p.content||'',260)}\n관계: ${clip(p.relationship||'',180)}\n현재 상태: ${clip(p.currentState||'',160)}\n알고 있는 사실: ${clip(p.knownFacts||'',180)}\n숨긴 사실: ${clip(p.hiddenFacts||'',180)}\n사용자 주도권: ${clip(p.agencyRules||'',180)}`:'',
    intro?`[현재 에피소드]\n${intro.title||''}\n${clip(intro.summary||intro.plot||intro.scene?.state||'',260)}`:'',
    c.narrativeInstructions?`[서술 지침]\n${clip(c.narrativeInstructions,360)}`:'',
    c.userAgencyRules?`[사용자 입력 재구성]\n${clip(c.userAgencyRules,300)}`:'',
    c.outputFormat?`[출력 형식]\n${clip(c.outputFormat,240)}`:'',
    c.contentRules?`[내용 규칙]\n${clip(c.contentRules,260)}`:'',
    pre?.instructions?`[응답 프리셋 · ${pre.name||''}]\n${clip(pre.instructions,260)}`:'',
    noteAllowed(th,input)?`[이 대화의 유저 노트]\n${clip(th.userNote,260)}`:'',
    ex.length?`[등장 가능한 등록 인물]\n${ex.map(x=>`- ${x.name}${x.role?` (${x.role})`:''}: ${clip(x.description||x.content||'',130)} / 말투 ${clip(x.speech||'',90)} / 관계 ${clip(x.relationships||'',90)} / 앎 ${clip(x.knownFacts||'',80)} / 모름 ${clip(x.unknownFacts||'',80)}`).join('\n')}`:'',
    gs.length?`[추가 지문 지침]\n${gs.map(x=>`- ${x.title||'지침'}: ${clip(x.content||'',180)}`).join('\n')}`:'',
    lr.length?`[세계관·사건 자료]\n${lr.map(x=>`- [${x.collectionType||'world'}] ${x.title||x.name||'자료'}: ${clip(x.content||'',230)}`).join('\n')}`:'',
    mem.length?`[장기 기억 · 연속성 유지]\n${mem.map(x=>`- ${x.title||'기억'}: ${clip(x.content||'',190)}`).join('\n')}`:'',
    densityDirective(th)?`[서술 밀도]\n${densityDirective(th)}`:'',
    th.oneShotInstruction?`[이번 한 번만 적용할 지시]\n${clip(th.oneShotInstruction,320)}`:'',
    oocDirective(input),
    widgetPrompt(th)
  ].filter(Boolean);
  const hard=mandatory.join('\n\n'),budget=Math.max(700,Math.floor(limit*.62)-estimateTokens(hard));let used=0;const chosen=[];
  for(const sec of sections){const cost=estimateTokens(sec);if(used+cost<=budget){chosen.push(sec);used+=cost;continue}const remain=budget-used;if(remain>=120){chosen.push(clip(sec,remain));used=budget}break}
  return{content:[hard,...chosen].filter(Boolean).join('\n\n'),usedLoreIds:lr.map(x=>x.id)};
}
function stripWidgetForCompletion(text){return String(text||'').replace(/<lumichat_widgets_v3>[\s\S]*?<\/lumichat_widgets_v3>/gi,'').replace(/<lumichat_widgets_v3>[\s\S]*$/i,'').trim()}
function incomplete(r,text){const reason=String(r?.finishReason||'');if(/(?:max[_ -]?(?:output[_ -]?)?tokens?|length|incomplete|token[_ -]?limit)/i.test(reason))return true;if(/stop|end_turn|end|complete|tool/i.test(reason))return false;const body=stripWidgetForCompletion(text);if(!body)return false;if(/<lumichat_widgets_v3>/i.test(text)&&!/<\/lumichat_widgets_v3>/i.test(text))return true;return body.length>180&&!/[.!?。！？…"'”’\])}>]$/.test(body)}
const addUsage=(a={},b={})=>({prompt_tokens:Number(a.prompt_tokens||0)+Number(b.prompt_tokens||0),completion_tokens:Number(a.completion_tokens||0)+Number(b.completion_tokens||0),reasoning_tokens:Number(a.reasoning_tokens||0)+Number(b.reasoning_tokens||0),total_tokens:Number(a.total_tokens||0)+Number(b.total_tokens||0)});
function rebuildWidgetState(th){th.statusWidgetState={};for(const m of th.messages||[]){for(const snap of m.statusWidgetSnapshots||[]){const w=snap?.widget,id=w?.id;if(!id)continue;th.statusWidgetState[id]={values:{...(snap.values||{})},updatedAt:m.createdAt||now()}}}return th.statusWidgetState}
function queueEventLore(c,th,content,usedIds=[]){const hay=words(cleanForContext(content)),used=new Set(usedIds||[]),pending=new Set(th.pendingEventLoreIds||[]);for(const x of lore(c)){if((x.collectionType||'world')!=='event'||used.has(x.id))continue;if(keywordHit(x,hay)||overlap(x,hay)>=2)pending.add(x.id)}for(const id of used)pending.delete(id);th.pendingEventLoreIds=[...pending].slice(0,30)}
function requestInput(text){return text.trim()?text.trim():'[빈 전송] 사용자가 새 대사나 행동을 지정하지 않았다. 현재 진행 중인 장면에서 캐릭터와 환경의 반응만 자연스럽게 이어가고, 사용자의 새 선택을 대신 만들지 마.'}

function variantSnapshot(m){return{id:uid('variant'),content:m.content||'',createdAt:m.createdAt||now(),model:m.model||'',provider:m.provider||'',usage:clone(m.usage||{}),estimatedCostKRW:Number(m.estimatedCostKRW||0),estimatedCostUSD:Number(m.estimatedCostUSD||0),latencyMs:Number(m.latencyMs||0),autoContinuationCount:Number(m.autoContinuationCount||0),statusWidgetSnapshots:clone(m.statusWidgetSnapshots||null)}}
export async function send(text='',regenId=null){
  const c=char(),th=thread();if(!c||!th)throw new Error('대화방을 먼저 선택해 주세요.');
  let regenBase=null,regenIndex=-1;
  if(regenId){regenIndex=th.messages.findIndex(m=>m.id===regenId);if(regenIndex>=0){regenBase=clone(th.messages[regenIndex]);th.messages.splice(regenIndex,1);rebuildWidgetState(th)}}
  else if(text.trim())th.messages.push({id:uid('msg'),role:'user',content:text.trim(),speakerType:'player',speakerName:persona(th)?.name||state.profile.name||'사용자',sceneSnapshot:clone(th.scene||{}),createdAt:now()});
  const inputLimit=inputContextLimit(th),built=systemPrompt(c,th,text),sysText=built.content,historyBudget=Math.max(500,Math.floor(inputLimit*.94)-estimateTokens(sysText)-estimateTokens(requestInput(text))),recent=recentForPrompt(th,historyBudget,Number(th.outputSettings?.recentMessages||state.settings.recentMessageCount||24)),pre=state.presets.find(x=>x.id===th.activePresetId),provider=th.provider||pre?.provider||c.defaultProvider||state.settings.defaultProvider||'google',model=th.activeModel||pre?.model||c.defaultModel||state.settings.defaultModel||'gemini-3.6-flash',temperature=Number(th.outputSettings?.temperature??pre?.temperature??state.settings.temperature??.85),maxTokens=Math.max(256,Number(th.outputSettings?.maxTokens??pre?.maxTokens??state.settings.maxTokens??2500));
  const prompt=[{role:'system',content:sysText},...recent];if(!text.trim())prompt.push({role:'user',content:requestInput(text)});
  const started=performance.now();let r=await edge('chat',{provider,model,temperature,maxTokens,messages:prompt}),content=String(r.content||''),usage=r.usage||{},count=0,costKrw=Number(r.estimatedCostKRW||0),costUsd=Number(r.estimatedCostUSD||0);
  for(let i=0;i<8&&incomplete(r,content);i++){
    const lastUser=[...prompt].reverse().find(m=>m.role==='user')?.content||requestInput(text),tail=await edge('chat',{provider,model,temperature:Math.min(.8,temperature),maxTokens:Math.max(240,Math.min(1200,Math.floor(maxTokens*.22))),messages:[{role:'system',content:'직전 assistant 답변이 출력 한도에서 끊겼다. 이미 쓴 내용은 반복하지 말고 마지막 지점 바로 다음부터 현재 턴만 완결한다. 새 사건·새 사용자 선택을 만들지 않는다. LumiChat 상태 위젯 JSON은 다시 출력하지 않는다. 기존 화자 태그 형식은 유지한다.'},{role:'user',content:String(lastUser).slice(-1800)},{role:'assistant',content:content.slice(-3600)},{role:'user',content:'마지막 지점 다음부터 반복 없이 현재 턴을 완결해.'}]});
    const piece=String(tail.content||'').trim();usage=addUsage(usage,tail.usage||{});costKrw+=Number(tail.estimatedCostKRW||0);costUsd+=Number(tail.estimatedCostUSD||0);count++;if(piece)content=`${content.trimEnd()}\n\n${piece}`;r={...tail,content,usage};if(!piece)break
  }
  if(incomplete(r,content))throw new Error('답변이 반복해서 끊겨 완결본을 만들지 못했어요. 잘린 본문은 저장하지 않았어요.');
  let parsed;
  const widgetEnabled=(th.statusWidgets||[]).some(w=>w&&w.enabled!==false&&(w.fields||[]).length);const widgetClosed=/<lumichat_widgets_v3>[\s\S]*?<\/lumichat_widgets_v3>/i.test(content);
  let finalContent='';
  if(widgetClosed){parsed=parseWidgetBlock(content,th);finalContent=String(parsed.content||'').trim()}
  else{
    finalContent=stripWidgetForCompletion(content).trim();
    if(widgetEnabled){try{const repair=await edge('chat',{provider,model,temperature:.2,maxTokens:Math.max(600,Math.min(2200,600+(th.statusWidgets||[]).reduce((n,w)=>n+(w.fields||[]).length*24,0))),messages:[{role:'system',content:`${widgetPrompt(th)}\n\n역할극은 이미 끝났다. 설명이나 본문을 쓰지 말고 <lumichat_widgets_v3>...</lumichat_widgets_v3>만 출력한다.`},{role:'user',content:`[이번 턴 입력]\n${String(text||'').slice(-1800)}\n\n[이번 턴 AI 본문]\n${finalContent.slice(-6000)}`}]});parsed=parseWidgetBlock(repair.content,th);usage=addUsage(usage,repair.usage||{});costKrw+=Number(repair.estimatedCostKRW||0);costUsd+=Number(repair.estimatedCostUSD||0)}catch(e){console.warn('모바일 상태 위젯 자동 복구 실패',e)}}
  }
  if(!finalContent)throw new Error('AI가 빈 답변을 반환했어요. 다시 시도해 주세요.');
  queueEventLore(c,th,finalContent,built.usedLoreIds);
  const msg={id:regenBase?.id||uid('msg'),role:'assistant',content:finalContent,createdAt:now(),model:r.model||model,provider,usage,estimatedCostKRW:costKrw,estimatedCostUSD:costUsd,latencyMs:Math.max(0,Math.round(performance.now()-started)),autoContinuationCount:count,statusWidgetSnapshots:parsed.snapshots||null,sceneSnapshot:clone(th.scene||{}),bookmarked:Boolean(regenBase?.bookmarked)};
  if(regenBase){const old=Array.isArray(regenBase.variants)&&regenBase.variants.length?regenBase.variants.map(clone):[variantSnapshot(regenBase)];msg.variants=[...old,variantSnapshot(msg)];msg.activeVariantIndex=msg.variants.length-1;th.messages.splice(Math.min(regenIndex,th.messages.length),0,msg)}else th.messages.push(msg);
  th.oneShotInstruction='';th.updatedAt=now();saveSoon();return{...r,content:finalContent,usage,autoContinuationCount:count,messageId:msg.id}
}
export function editMessage(id,text){const th=thread(),m=th?.messages.find(x=>x.id===id);if(!m)return;m.content=text.trim();if(isThreadIntroSeed(m,th.introId)){m.introSourceId=m.introSourceId||th.introId;m.introDetached=true;m.provider='manual-intro';m.model='manual-intro'}m.editedAt=now();if(Array.isArray(m.variants)&&m.variants[m.activeVariantIndex])m.variants[m.activeVariantIndex].content=m.content;if(m.role==='assistant')rebuildWidgetState(th);th.updatedAt=now();saveSoon()}
export function deleteMessage(id){const th=thread();if(!th)return;th.messages=th.messages.filter(x=>x.id!==id);rebuildWidgetState(th);th.updatedAt=now();saveSoon()}
export function toggleBookmark(id){const th=thread(),m=th?.messages.find(x=>x.id===id);if(!m)return false;m.bookmarked=!m.bookmarked;th.updatedAt=now();saveSoon();return m.bookmarked}
export function selectVariant(id,index){const th=thread(),m=th?.messages.find(x=>x.id===id),v=m?.variants?.[Number(index)];if(!m||!v)return false;Object.assign(m,{content:v.content,model:v.model,provider:v.provider,usage:clone(v.usage||{}),estimatedCostKRW:Number(v.estimatedCostKRW||0),estimatedCostUSD:Number(v.estimatedCostUSD||0),latencyMs:Number(v.latencyMs||0),autoContinuationCount:Number(v.autoContinuationCount||0),statusWidgetSnapshots:clone(v.statusWidgetSnapshots||null),activeVariantIndex:Number(index),editedAt:now()});rebuildWidgetState(th);th.updatedAt=now();saveSoon();return true}
export function branchFromMessage(id){const source=thread();if(!source)return null;const i=source.messages.findIndex(x=>x.id===id);if(i<0)return null;const t=now(),b=clone(source);b.id=uid('thread');b.title=`${source.title||char()?.name||'대화'} · 분기`;b.branchedFrom={threadId:source.id,messageId:id};b.parentThreadId=source.id;b.branchFromMessageId=id;b.messages=clone(source.messages.slice(0,i+1));const snap=[...b.messages].reverse().find(m=>m.sceneSnapshot)?.sceneSnapshot;if(snap)b.scene=clone(snap);b.createdAt=t;b.updatedAt=t;b.archived=false;b.lastMemoryExtractionMessageId=null;rebuildWidgetState(b);state.threads.unshift(b);state.settings.activeThreadId=b.id;state.settings.activeCharacterId=b.characterId;state.settings.activeWorkId=b.workId||state.settings.activeWorkId;saveSoon();return b}
export async function extractMemory(count=16){const c=char(),th=thread();if(!c||!th)throw new Error('대화가 없어요.');const msgs=th.messages.slice(-Math.max(2,count));if(msgs.length<2)throw new Error('기억으로 정리할 대화가 아직 부족해요.');const r=await edge('memory-extract',{provider:state.settings.memoryProvider||state.settings.defaultProvider,model:state.settings.memoryModel||state.settings.defaultModel,characterName:c.name,personaName:persona(th)?.name||state.profile.name||'사용자',range:{label:`최근 ${msgs.length}개 메시지`,startPreview:cleanForContext(msgs[0]?.content).slice(0,100),endPreview:cleanForContext(msgs.at(-1)?.content).slice(0,100)},messages:msgs.map(m=>({role:m.role,content:cleanForContext(m.content)}))});for(const m of r.memories||[]){const candidate={id:uid('memory'),characterId:c.id,threadId:null,status:'approved',enabled:true,pinned:false,scope:'character',readPolicy:'auto',triggerKeywords:[],useCount:0,createdAt:now(),updatedAt:now(),sourceThreadId:th.id,sourceMessageIds:msgs.map(x=>x.id),...m},hits=detectMemoryConflict(candidate,state.memories.filter(x=>x.characterId===c.id));if(hits[0]?.similarity>=.75){const old=hits[0].item;old.content=String(candidate.content||'').length>String(old.content||'').length?candidate.content:old.content;old.title=old.title||candidate.title;old.tags=[...new Set([...(old.tags||[]),...(candidate.tags||[])])];old.sourceMessageIds=[...new Set([...(old.sourceMessageIds||[]),...(candidate.sourceMessageIds||[])])];old.importance=Math.max(Number(old.importance||5),Number(candidate.importance||5));old.updatedAt=now()}else{if(hits.length)candidate.conflictWithIds=hits.map(x=>x.item.id);state.memories.push(candidate)}}th.lastMemoryExtractionMessageId=msgs.at(-1)?.id||null;saveSoon();return r}

function taggedSegments(raw){
  const text=String(raw||''),re=/<lumi_(pc|char|extra|narration)(?:\s+name=(?:"([^"]+)"|'([^']+)'))?\s*>([\s\S]*?)<\/lumi_\1>/gi,out=[];let last=0,m;
  while((m=re.exec(text))){if(m.index>last&&text.slice(last,m.index).trim())out.push({type:'legacy',name:'',content:text.slice(last,m.index).trim()});out.push({type:m[1],name:m[2]||m[3]||'',content:m[4].trim()});last=re.lastIndex}
  if(last<text.length&&text.slice(last).trim())out.push({type:'legacy',name:'',content:text.slice(last).trim()});return out.length?out:[{type:'legacy',name:'',content:text.trim()}]
}
function validHex(value){const c=String(value||'').trim();return /^#[0-9a-f]{6}$/i.test(c)?c:''}
function mobileSpeakerColor(th,kind,key,fallback=''){
  const custom=validHex(th?.displaySettings?.speakerStyles?.[key]?.color);
  return custom||speakerTextColor(kind,key,fallback);
}
function mobileSpeakerKey(kind,c,th,name='',speakerId=''){
  if(kind==='pc')return`persona:${persona(th)?.id||'user'}`;
  if(kind==='char'||kind==='character')return`character:${c?.id||'main'}`;
  if(kind==='extra'){
    const matched=state.extras.find(x=>x.id===speakerId)||extras(c).find(x=>String(x.name||'').toLowerCase()===String(name||'').toLowerCase());
    return matched?`extra:${matched.id}`:`extra-name:${name||speakerId||'unknown'}`;
  }
  return'';
}
function mobileSpeakerCatalog(c,th){
  const p=persona(th),rows=[
    {kind:'pc',name:p?.name||state.profile.name||'사용자',key:mobileSpeakerKey('pc',c,th),aliases:[p?.name,state.profile.name,'사용자','유저','PC'].filter(Boolean)},
    {kind:'char',name:c?.name||'캐릭터',key:mobileSpeakerKey('char',c,th),aliases:[c?.name,...(c?.aliases||[])].filter(Boolean)},
    ...extras(c).map(x=>({kind:'extra',name:x.name,key:mobileSpeakerKey('extra',c,th,x.name,x.id),aliases:[x.name,...(x.aliases||[])].filter(Boolean)}))
  ];return rows
}
function mobileOwnerAtStart(text,c,th){
  const source=String(text||'').trim().replace(/^[*_~\s“”"'‘’「」『』()（）\[\]]+/,'').slice(0,220);if(!source)return null;
  const pc=mobileSpeakerCatalog(c,th).find(x=>x.kind==='pc');if(/^(?:나는|난|내가|저는|전|제가|나의|내|저의)(?=\s|[,.!?…]|$)/.test(source))return pc;
  const prefix='(?:잠시\\s*(?:후|뒤)|이윽고|곧|그러자|그\\s*순간|순간|잠깐)?\\s*[,，]?\\s*';
  for(const row of mobileSpeakerCatalog(c,th).flatMap(candidate=>candidate.aliases.map(alias=>({candidate,alias:String(alias||'').trim()}))).filter(x=>x.alias).sort((a,b)=>b.alias.length-a.alias.length)){
    const escaped=row.alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(new RegExp(`^${prefix}${escaped}(?:은|는|이|가|께서)(?=\\s|[,.!?…“”"'‘’]|$)`,'i').test(source)||new RegExp(`^${prefix}${escaped}의\\s{0,2}[^\\s,.!?…]{1,20}(?:은|는|이|가)(?=\\s|[,.!?…“”"'‘’]|$)`,'i').test(source))return row.candidate;
  }return null
}
function mobileSceneNarration(text,c,th){const source=String(text||'').trim().replace(/^\*|\*$/g,'').trim();if(!source||mobileOwnerAtStart(source,c,th))return false;return /^(?:그때\s+(?:방|복도|창밖|주변|저편|등\s*뒤|문밖)|방\s*(?:안|밖|안쪽)|복도|창밖|창문\s*(?:밖|너머)|주변|공기|정적|침묵|바람|햇빛|빛|어둠|밤|아침|저녁|시간|시계|문밖|멀리서|어디선가)(?=\s|[,，.。!?…]|$)/.test(source)}
function mobileOtherPrimary(owner,c,th){const rows=mobileSpeakerCatalog(c,th);if(owner?.kind==='char')return rows.find(x=>x.kind==='pc')||owner;if(owner?.kind==='pc')return rows.find(x=>x.kind==='char')||owner;return rows.find(x=>x.kind==='char')||rows.find(x=>x.kind==='pc')||owner}
function mobileTurnContinuation(text){const source=String(text||'').trim().replace(/^\*|\*$/g,'').trim();if(!source)return false;if(source.length<=34&&!/[.!?。！？]$/.test(source))return true;return /^(?:그는|그가|그의|그녀는|그녀가|그녀의|자신은|자신이|자신의|(?:손|손끝|시선|눈|눈썹|입가|입술|고개|어깨|목소리|숨|표정|얼굴|몸|발|걸음)(?:은|는|이|가|을|를|에|에는|에서|으로|로|도|만|의)?|헉|망했다|젠장|이런|아차)(?=\s|[,，.。!?…]|$)/.test(source)}
function mobileTurnLeadIn(text){const source=String(text||'').trim().replace(/^\*|\*$/g,'').trim();return Boolean(source)&&source.length<=54&&/^(?:헉|망했다|젠장|이런|아차|설마|어쩌지|왜|뭐지|잠깐|아니|그래|좋아|싫어|안돼|안\s*돼)/.test(source)}
function mobileLegacySegments(raw,c,th){
  const paragraphs=String(raw||'').split(/\n{2,}/).map(x=>x.trim()).filter(Boolean),owners=paragraphs.map(x=>mobileOwnerAtStart(x,c,th)),out=[];let lastDialogue=null,currentOwner=null;
  const add=(type,owner,content,hint=null)=>{const text=String(content||'').trim();if(!text)return;out.push({type,owner:owner||null,hint:hint||null,content:text})};
  const quoteRx=/(\*[^*\n]+\*|“[^”\n]+”|「[^」\n]+」|『[^』\n]+』|"[^"\n]+")/g;
  for(let i=0;i<paragraphs.length;i++){
    const part=paragraphs[i],direct=owners[i];let cursor=0,m,found=false;quoteRx.lastIndex=0;
    while((m=quoteRx.exec(part))){found=true;const before=part.slice(cursor,m.index).trim();if(before){const hint=mobileOwnerAtStart(before,c,th)||direct;add('narration',null,before,hint);if(hint&&!mobileSceneNarration(before,c,th))currentOwner=hint}const token=m[0];
      if(token.startsWith('*'))add('narration',null,token.slice(1,-1),direct);else{const quoteOnly=part.replace(token,'').trim()==='',nextOwner=quoteOnly?owners.slice(i+1,i+3).find(Boolean)||null:null;let speaker=direct||nextOwner||null;if(!speaker&&quoteOnly&&lastDialogue)speaker=mobileOtherPrimary(lastDialogue,c,th);speaker=speaker||currentOwner||mobileSpeakerCatalog(c,th).find(x=>x.kind==='char');add('dialogue',speaker,token);lastDialogue=speaker;currentOwner=speaker}cursor=m.index+token.length
    }
    const tail=part.slice(cursor).trim();if(tail){const hint=mobileOwnerAtStart(tail,c,th)||direct;add('narration',null,tail,hint);if(hint&&!mobileSceneNarration(tail,c,th))currentOwner=hint}else if(!found&&direct&&!mobileSceneNarration(part,c,th))currentOwner=direct;
  }
  const beforeSpeaker=(i)=>{for(let j=i-1;j>=0;j--)if(out[j].owner)return out[j].owner;return null},afterSpeaker=(i)=>{for(let j=i+1;j<out.length;j++)if(out[j].owner)return out[j].owner;return null};
  for(let i=0;i<out.length;i++){const seg=out[i];if(seg.type!=='narration'||seg.owner||mobileSceneNarration(seg.content,c,th)||!seg.hint)continue;const prev=beforeSpeaker(i),next=afterSpeaker(i);if(prev?.key===seg.hint.key)seg.owner=seg.hint;else if(next?.key===seg.hint.key)seg.owner=seg.hint}
  for(let i=0;i<out.length;i++){const seg=out[i];if(seg.type!=='narration'||seg.owner||mobileSceneNarration(seg.content,c,th))continue;const prev=beforeSpeaker(i),next=afterSpeaker(i);if(prev&&next&&prev.key===next.key)seg.owner=prev;else if(next&&mobileTurnLeadIn(seg.content))seg.owner=next;else if(prev&&mobileTurnContinuation(seg.content))seg.owner=prev}
  return out
}
function proseHtml(text,kind='narration',color='',type='narration'){
  const style=validHex(color)?` style="--mobile-speaker-color:${color}"`:'';
  const parts=String(text||'').split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);
  return parts.map(part=>{const clean=/^\*[^*]+\*$/.test(part)?part.slice(1,-1):part,safe=esc(clean).replace(/\n/g,'<br>'),dialogue=type==='dialogue'||/^[“"「『]/.test(clean);return `<p class="${dialogue?'mobile-dialogue':kind==='pc'?'mobile-pc-line':'mobile-narration'}"${dialogue||kind==='pc'?style:''}>${safe}</p>`}).join('')
}
function mobileSpeakerAvatar(owner,c,th){if(owner?.kind==='char')return c?.avatar||'';if(owner?.kind==='pc')return persona(th)?.avatar||'';if(owner?.kind==='extra'){const id=String(owner.key||'').replace(/^extra:/,'');return state.extras.find(x=>x.id===id||x.name===owner.name)?.avatar||''}return''}
function mobileSpeakerBlock(owner,parts,c,th){
  const kind=owner?.kind||'char',name=owner?.name||(kind==='pc'?(persona(th)?.name||state.profile.name||'사용자'):c?.name||'캐릭터'),key=owner?.key||mobileSpeakerKey(kind,c,th,name),color=mobileSpeakerColor(th,kind==='char'?'character':kind,key,kind==='pc'?'#65b9ff':'#e1b722'),style=` style="--mobile-speaker-color:${color}"`,img=mobileSpeakerAvatar(owner,c,th);
  return `<section class="mobile-speaker-block ${kind}" data-speaker-key="${esc(key)}"${style}><div class="mobile-speaker-meta"><span class="mobile-speaker-avatar">${img?`<img src="${esc(img)}" alt="">`:esc(name.slice(0,1))}</span><b class="mobile-inline-speaker">${esc(name)}</b></div><div class="mobile-speaker-bubble">${parts.map(part=>proseHtml(part.content,kind,color,part.type)).join('')}</div></section>`
}
function groupSemanticSegments(segments){const groups=[];let current=null;for(const seg of segments){const owner=seg.owner||null,signature=owner?`${owner.kind}|${owner.key}`:'narration';if(!current||current.signature!==signature){current={signature,owner,parts:[]};groups.push(current)}current.parts.push(seg)}return groups}
function renderMobileSemanticSegments(segments,c,th){return groupSemanticSegments(segments).map(group=>group.owner?mobileSpeakerBlock(group.owner,group.parts,c,th):`<section class="mobile-narration-block">${group.parts.map(part=>proseHtml(part.content,'narration','',part.type)).join('')}</section>`).join('')}
function mobileUserParts(raw){const text=String(raw||''),out=[];let cursor=0;const rx=/\*([^*\n]+)\*/g;let m;while((m=rx.exec(text))){const before=text.slice(cursor,m.index).trim();if(before)out.push({type:'dialogue',content:before});out.push({type:'narration',content:m[1]});cursor=m.index+m[0].length}const tail=text.slice(cursor).trim();if(tail)out.push({type:'dialogue',content:tail});return out.length?out:[{type:'dialogue',content:text}]}
function forcedOwner(message,c,th){const type=message?.speakerType||'';if(!['player','pc','character','extra'].includes(type))return null;const kind=type==='player'||type==='pc'?'pc':type==='character'?'char':'extra',name=kind==='pc'?(message.speakerName||persona(th)?.name||state.profile.name||'사용자'):kind==='extra'?(message.speakerName||state.extras.find(x=>x.id===message.speakerId)?.name||'등장인물'):(message.speakerName||c?.name||'캐릭터');return{kind,name,key:mobileSpeakerKey(kind,c,th,name,message.speakerId)}}
function ownerSegments(content,owner,c,th){
  const parsed=mobileLegacySegments(content,c,th);
  if(!parsed.length)return[{type:'narration',owner,content:String(content||'')}];
  return parsed.map(seg=>({...seg,owner}));
}
function forcedStoryHtml(message,c,th){const owner=forcedOwner(message,c,th);return owner?mobileSpeakerBlock(owner,ownerSegments(message.content,owner,c,th),c,th):''}
function mobileChatStoryHtml(text,role='assistant',c=null,th=null,message=null){
  const raw=String(text||'');if(role==='user'){const key=mobileSpeakerKey('pc',c,th),owner={kind:'pc',name:persona(th)?.name||state.profile.name||'사용자',key};return mobileSpeakerBlock(owner,mobileUserParts(raw),c,th)}
  const forced=forcedStoryHtml(message,c,th);if(forced)return forced;const rendered=[];for(const seg of taggedSegments(raw)){if(seg.type==='legacy'){rendered.push(renderMobileSemanticSegments(mobileLegacySegments(seg.content,c,th),c,th));continue}if(seg.type==='narration'){rendered.push(`<section class="mobile-narration-block">${proseHtml(seg.content,'narration')}</section>`);continue}const kind=seg.type==='character'?'char':seg.type,name=kind==='pc'?(persona(th)?.name||state.profile.name||'사용자'):kind==='extra'?(seg.name||'등장인물'):(c?.name||'캐릭터'),owner={kind,name,key:mobileSpeakerKey(kind,c,th,name)};rendered.push(mobileSpeakerBlock(owner,ownerSegments(seg.content,owner,c,th),c,th))}return rendered.join('')
}
function mobileNovelGroup(owner,parts,c,th){if(!owner)return`<section class="mobile-novel-block narration">${parts.map(p=>proseHtml(p.content,'narration','',p.type)).join('')}</section>`;const kind=owner.kind||'char',key=owner.key||mobileSpeakerKey(kind,c,th,owner.name),color=mobileSpeakerColor(th,kind==='char'?'character':kind,key,kind==='pc'?'#65b9ff':'#e1b722');return`<section class="mobile-novel-block ${kind}" data-speaker-key="${esc(key)}" style="--mobile-speaker-color:${color}">${parts.map(p=>proseHtml(p.content,kind,color,p.type)).join('')}</section>`}
function renderNovelSemanticSegments(segments,c,th){return groupSemanticSegments(segments).map(g=>mobileNovelGroup(g.owner,g.parts,c,th)).join('')}
function mobileNovelStoryHtml(text,role='assistant',c=null,th=null,message=null){const raw=String(text||'');if(role==='user'){const owner={kind:'pc',name:persona(th)?.name||state.profile.name||'사용자',key:mobileSpeakerKey('pc',c,th)};return mobileNovelGroup(owner,mobileUserParts(raw),c,th)}const force=forcedOwner(message,c,th);if(force)return renderNovelSemanticSegments(ownerSegments(raw,force,c,th),c,th);const rendered=[];for(const seg of taggedSegments(raw)){if(seg.type==='legacy'){rendered.push(renderNovelSemanticSegments(mobileLegacySegments(seg.content,c,th),c,th));continue}if(seg.type==='narration'){rendered.push(mobileNovelGroup(null,[{type:'narration',content:seg.content}],c,th));continue}const kind=seg.type==='character'?'char':seg.type,name=kind==='pc'?(persona(th)?.name||state.profile.name||'사용자'):kind==='extra'?(seg.name||'등장인물'):(c?.name||'캐릭터'),owner={kind,name,key:mobileSpeakerKey(kind,c,th,name)};rendered.push(renderNovelSemanticSegments(ownerSegments(seg.content,owner,c,th),c,th))}return rendered.join('')}
function mobileStoryHtml(text,role='assistant',c=null,th=null,message=null){return th?.displayMode==='chat'?mobileChatStoryHtml(text,role,c,th,message):mobileNovelStoryHtml(text,role,c,th,message)}
export function plainMessageText(text){return cleanForContext(text)}
export function messageHtml(m,c){const th=thread(),isIntro=isThreadIntroSeed(m,th?.introId),narration=m.speakerType==='narration',u=m.usage||{},meta=!isIntro&&m.role==='assistant'?[Number(u.total_tokens||0)?`${Number(u.total_tokens).toLocaleString()}t`:'',Number(m.estimatedCostKRW||0)>0?`약 ₩${Math.max(1,Math.round(Number(m.estimatedCostKRW))).toLocaleString()}`:'',Number(m.latencyMs||0)>0?`${(Number(m.latencyMs)/1000).toFixed(1)}s`:''].filter(Boolean).join(' · '):'',variants=Array.isArray(m.variants)?m.variants:[];return`<article class="msg ${m.role}${narration?' narration':''}${isIntro?' intro-seed':''}${m.bookmarked&&!isIntro?' bookmarked':''}" data-id="${m.id}"><div class="msg-body">${mobileStoryHtml(m.content,m.role,c,th,m)}</div>${meta?`<div class="mobile-message-usage">${esc(meta)}${m.autoContinuationCount?` · 자동 이어쓰기 ${m.autoContinuationCount}회`:''}</div>`:''}${isIntro?'':`<footer><button data-act="copy" aria-label="복사">복사</button><button data-act="edit" aria-label="수정">수정</button><button data-act="delete" aria-label="삭제">삭제</button><button data-act="bookmark">${m.bookmarked?'★ 해제':'☆ 북마크'}</button>${m.role==='assistant'&&!narration?`<button data-act="regen">재생성</button>${variants.length>1?`<button data-act="variants">후보 ${Number(m.activeVariantIndex||0)+1}/${variants.length}</button>`:''}<button data-act="branch">분기</button><button data-act="speak">읽기</button>`:''}</footer>${m.role==='assistant'&&!narration?widgetsHtml(m,th):''}`}</article>`}
