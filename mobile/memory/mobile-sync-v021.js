'use strict';
/* Hosted adapter parity patch. Canonical source version: v2.10.23.
   v0.2.1: the hosted mobile view uses the SAME global theme registry as the canonical PC/common HTML. */
const HOSTED_MOBILE_VERSION='0.2.1', HOSTED_SOURCE_VERSION='2.10.23';
const _baseRender=render, _baseOverview=overview;

const MOBILE_THEME_PRESETS={
 'sweet-pink':{name:'스위트 핑크',vars:{
  '--app-bg':'#fff8fb','--panel-bg':'#ffffff','--panel-soft':'#fff1f7','--panel-muted':'#fcf8fb',
  '--accent':'#ff86b6','--accent-strong':'#e95892','--accent-soft':'#ffe0ed','--secondary':'#9a7de8','--secondary-soft':'#eee7ff',
  '--text':'#3f3444','--text-soft':'#7c6f80','--text-faint':'#aa9dab','--border':'#eadce6','--narration':'#706472',
  '--user-bubble':'#ff91bd','--user-text':'#ffffff','--infobox-bg':'#f5efff','--infobox-text':'#574a67'}},
 'lavender-dream':{name:'라벤더 드림',vars:{
  '--app-bg':'#faf8ff','--panel-bg':'#ffffff','--panel-soft':'#f3efff','--panel-muted':'#fbfaff',
  '--accent':'#a884ee','--accent-strong':'#7c5fc7','--accent-soft':'#ede5ff','--secondary':'#f19abd','--secondary-soft':'#ffe7f1',
  '--text':'#393347','--text-soft':'#766e86','--text-faint':'#a39bad','--border':'#e3dcf2','--narration':'#6e6879',
  '--user-bubble':'#a884ee','--user-text':'#ffffff','--infobox-bg':'#f0eaff','--infobox-text':'#51446c'}},
 'sky-blue':{name:'스카이 블루',vars:{
  '--app-bg':'#f6fbff','--panel-bg':'#ffffff','--panel-soft':'#eaf6ff','--panel-muted':'#f8fcff',
  '--accent':'#72b8f4','--accent-strong':'#3f8fd6','--accent-soft':'#dff1ff','--secondary':'#9892ea','--secondary-soft':'#ebe9ff',
  '--text':'#324052','--text-soft':'#6b7a8a','--text-faint':'#9aa9b6','--border':'#d9e8f2','--narration':'#657584',
  '--user-bubble':'#72b8f4','--user-text':'#ffffff','--infobox-bg':'#eaf5ff','--infobox-text':'#3f5870'}},
 'mint-cream':{name:'민트 크림',vars:{
  '--app-bg':'#f7fdfb','--panel-bg':'#ffffff','--panel-soft':'#eaf9f4','--panel-muted':'#f9fdfc',
  '--accent':'#67cfb4','--accent-strong':'#35a98d','--accent-soft':'#dff7f0','--secondary':'#ff9fb2','--secondary-soft':'#ffe8ee',
  '--text':'#33453f','--text-soft':'#6a7f78','--text-faint':'#9baca6','--border':'#d8ebe5','--narration':'#667a73',
  '--user-bubble':'#67cfb4','--user-text':'#ffffff','--infobox-bg':'#e8f8f3','--infobox-text':'#3f635a'}},
 'rose-cream':{name:'로지 크림',vars:{
  '--app-bg':'#f6f1eb','--panel-bg':'#fffdfb','--panel-soft':'#fbf2ee','--panel-muted':'#faf7f3',
  '--accent':'#d78387','--accent-strong':'#bd666d','--accent-soft':'#f7e1e2','--secondary':'#cda899','--secondary-soft':'#f3e8e2',
  '--text':'#4a403d','--text-soft':'#817571','--text-faint':'#ada19b','--border':'#e8ddd5','--narration':'#796e69',
  '--user-bubble':'#d78387','--user-text':'#ffffff','--infobox-bg':'#fbf1e7','--infobox-text':'#5d514c'}},
 'zeta-dark':{name:'제타 기본',vars:{
  '--app-bg':'#111114','--panel-bg':'#1b181f','--panel-soft':'#252129','--panel-muted':'#17151a',
  '--accent':'#684be4','--accent-strong':'#9f8cff','--accent-soft':'#29213d','--secondary':'#8f7bdd','--secondary-soft':'#282238',
  '--text':'#f3eef4','--text-soft':'#a69aa8','--text-faint':'#766d79','--border':'#332e37','--narration':'#b9afb9',
  '--user-bubble':'#654adf','--user-text':'#ffffff','--infobox-bg':'#1d1922','--infobox-text':'#d9cfe0'}}
};
const THEME_VAR_KEYS=['--app-bg','--panel-bg','--panel-soft','--panel-muted','--accent','--accent-strong','--accent-soft','--secondary','--secondary-soft','--text','--text-soft','--text-faint','--border','--narration','--user-bubble','--user-text','--infobox-bg','--infobox-text'];
function mobileCustomThemes(){return {...(state?.settings?.customThemes||{}),...(state?.customThemes||{})}}
function mobileThemeRegistry(){
 const all={...MOBILE_THEME_PRESETS};
 for(const [id,t] of Object.entries(mobileCustomThemes()))if(t&&typeof t==='object')all[id]={name:t.name||'나만의 테마',vars:{...(t.vars||{})},custom:true};
 return all
}
function mobileTheme(){
 const all=mobileThemeRegistry(),id=String(state?.settings?.themeId||'rose-cream');
 if(all[id])return id;
 if(id==='dark-purple')return'zeta-dark';
 return'rose-cream'
}
function injectMobileCustomFont(){
 let st=document.getElementById('mobileCustomFontStyle');if(!st){st=document.createElement('style');st.id='mobileCustomFontStyle';document.head.appendChild(st)}
 const f=state?.settings?.customFont;
 st.textContent=f?.data&&f?.family?`@font-face{font-family:${JSON.stringify(f.family)};src:url(${JSON.stringify(f.data)});font-display:swap;font-style:normal;font-weight:100 900;}`:'';
}
function applyMobileTheme(){
 const id=mobileTheme(),reg=mobileThemeRegistry(),theme=reg[id]||reg['rose-cream'],v=theme.vars||{},root=document.documentElement;
 THEME_VAR_KEYS.forEach(k=>root.style.removeProperty(k));
 Object.entries(v).forEach(([k,val])=>root.style.setProperty(k,String(val)));
 const alias={
  '--bg':v['--app-bg'],'--panel':v['--panel-bg'],'--panel2':v['--panel-soft'],'--muted':v['--panel-muted'],
  '--text':v['--text'],'--soft':v['--text-soft'],'--line':v['--border'],'--accent':v['--accent'],
  '--accent2':v['--secondary'],'--accentSoft':v['--accent-soft'],'--narration':v['--narration'],
  '--userBubble':v['--user-bubble'],'--infoBg':v['--infobox-bg'],'--infoText':v['--infobox-text']
 };
 Object.entries(alias).forEach(([k,val])=>val!=null&&root.style.setProperty(k,String(val)));
 root.dataset.theme=id;
 root.style.setProperty('--app-font',String(state?.settings?.fontFamily||'Pretendard, "Noto Sans KR", system-ui, sans-serif'));
 injectMobileCustomFont();
 const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=v['--app-bg']||'#fff8fb';
}
function mobileThemeCard(id,t,active){
 const v=t.vars||{},custom=!!t.custom;
 return `<div class="theme-mobile-wrap ${custom?'custom':''}">
   <button class="theme-option ${active===id?'active':''}" data-theme-mobile="${esc(id)}">
    <div class="theme-swatch pc-parity" style="--sw1:${esc(v['--app-bg']||'#fff')};--sw2:${esc(v['--panel-soft']||'#eee')};--sw3:${esc(v['--accent']||'#999')};--sw4:${esc(v['--secondary']||'#777')}"><i></i><i></i><i></i><i></i></div>
    <b>${esc(t.name||id)}</b>${custom?'<small>MY</small>':''}
   </button>
   ${custom?`<div class="theme-mobile-actions"><button data-edit-theme-mobile="${esc(id)}">색상 편집</button><button data-delete-theme-mobile="${esc(id)}">삭제</button></div>`:''}
  </div>`
}
function mobileThemeOptionsHtml(){
 const active=mobileTheme(),all=mobileThemeRegistry();
 return Object.entries(all).map(([id,t])=>mobileThemeCard(id,t,active)).join('')
}
function openMobileThemeEditor(id=''){
 const all=mobileThemeRegistry(),editing=!!mobileCustomThemes()[id],baseId=id||mobileTheme(),base=all[baseId]||all['rose-cream'],v={...(base.vars||{})};
 const fields=[['mThemeAppBg','앱 배경','--app-bg'],['mThemePanel','패널','--panel-bg'],['mThemeSoft','보조 패널','--panel-soft'],['mThemeAccent','강조색','--accent'],['mThemeSecondary','보조 강조색','--secondary'],['mThemeText','기본 글자','--text'],['mThemeTextSoft','보조 글자','--text-soft'],['mThemeBubble','사용자 말풍선','--user-bubble'],['mThemeNarration','지문','--narration'],['mThemeInfoBg','InfoBox 배경','--infobox-bg'],['mThemeInfoText','InfoBox 글자','--infobox-text']];
 openSheet(editing?'나만의 테마 수정':'현재 테마 복제',`<div class="field"><label>테마 이름</label><input id="mThemeName" value="${esc(editing?(base.name||'나만의 테마'):`${base.name||'테마'} 커스텀`)}"></div><div class="theme-color-mobile-grid">${fields.map(([fid,label,key])=>`<label><span>${label}</span><input id="${fid}" type="color" data-theme-key="${key}" value="${esc(v[key]||'#ffffff')}"></label>`).join('')}</div><div class="mobile-note">PC 원본과 같은 전역 테마입니다. 저장하면 PC 백업에도 그대로 포함됩니다.</div>`,`<button class="btn" data-act="sheet-close">취소</button><button class="btn primary" data-save-theme-mobile="${esc(editing?id:'')}">저장</button>`);
}
function saveMobileCustomTheme(existingId=''){
 const name=$('#mThemeName')?.value.trim()||'나만의 테마',base=mobileThemeRegistry()[existingId||mobileTheme()]||mobileThemeRegistry()['rose-cream'],vars={...(base.vars||{})};
 document.querySelectorAll('[data-theme-key]').forEach(input=>{vars[input.dataset.themeKey]=input.value});
 const id=existingId||`custom_${Math.random().toString(36).slice(2,8)}`,item={name,vars,createdAt:mobileCustomThemes()[id]?.createdAt||now(),updatedAt:now()};
 state.customThemes=state.customThemes||{};state.settings.customThemes=state.settings.customThemes||{};state.customThemes[id]=item;state.settings.customThemes[id]=item;state.settings.themeId=id;
 persist();closeSheet();applyMobileTheme();settingsView();toast('테마를 저장했어요.')
}
function mobileBottom(active){const nav=[['home','⌂','홈'],['recent','◷','최근 열람'],['backup','▣','백업·복원'],['settings','⚙','앱 설정']];return `<nav class="bottom-nav">${nav.map(([v,i,l])=>`<button data-nav="${v}" class="${active===v?'active':''}"><span class="ico">${i}</span><span>${l}</span></button>`).join('')}</nav>`}
bottom=mobileBottom;
function homeCards(){
 const q=search.trim().toLowerCase(),sort=state.settings.homeSort||'updated',view=state.settings.homeView||'grid';
 let rows=[...state.cards].filter(c=>!q||[c.name,c.description,c.folder].join(' ').toLowerCase().includes(q));
 rows.sort(sort==='name'?((a,b)=>String(a.name).localeCompare(String(b.name),'ko')):((a,b)=>String(b.lastOpenedAt||b.updatedAt||'').localeCompare(String(a.lastOpenedAt||a.updatedAt||''))));
 return `<div class="mcard-grid ${view==='list'?'list':''}">${rows.length?rows.map(mobileCardTile).join(''):empty('카드가 없어요','백업을 가져오거나 새 카드를 만들어 주세요.')}</div>`
}
function mobileCardTile(c){return `<button class="mcard" data-open-card="${esc(c.id)}"><div class="mcard-cover">${c.cover?`<img src="${esc(c.cover)}" alt="">`:''}</div>${c.avatar?`<span class="mcard-avatar"><img src="${esc(c.avatar)}" alt=""></span>`:`<span class="mcard-avatar fallback"></span>`}<div class="mcard-body"><div class="mcard-title">${esc(c.name||'이름 없는 카드')}</div></div></button>`}
home=function(){
 document.body.classList.remove('mobile-in-card','mobile-zeta');applyMobileTheme();const title=state.settings.archiveName||'추억보관함',view=state.settings.homeView||'grid';
 setApp(`${mainWrap(`<section class="mobile-home-head"><h1>${esc(title)}</h1><p>캐릭터별 대화·설정·OOC·사진을 카드 하나에 모아두세요.</p></section>
 <section class="mobile-home-tools"><input class="search" id="homeSearch" placeholder="카드 이름·설명·폴더 검색" value="${esc(search)}"><select id="mobileSort"><option value="updated" ${(state.settings.homeSort||'updated')==='updated'?'selected':''}>최근 수정순</option><option value="name" ${state.settings.homeSort==='name'?'selected':''}>이름순</option></select><div class="view-toggle"><button data-act="view-grid" class="${view!=='list'?'active':''}" aria-label="격자">▦</button><button data-act="view-list" class="${view==='list'?'active':''}" aria-label="목록">☷</button></div></section>
 <button class="create-card" data-act="create-card">＋ 새 카드 만들기</button>${homeCards()}`)}${mobileBottom('home')}`)
}
function mobileHero(c){return `<section class="mhero"><div class="mhero-cover">${c.cover?`<img src="${esc(c.cover)}" alt="">`:''}</div><div class="mhero-info">${c.avatar?`<span class="mcard-avatar"><img src="${esc(c.avatar)}" alt=""></span>`:`<span class="mcard-avatar fallback"></span>`}<div class="mhero-copy"><h1>${esc(c.name)}</h1><p>${esc(c.description||'')}</p></div><div class="mhero-actions"><button data-act="edit-card-mobile">✎ 편집</button><button data-act="card-settings-mobile">⚙ 설정</button></div></div></section>`}
function introView(c){const rows=c.intros||[];return `<section class="section"><div class="section-head"><h2>인트로</h2></div><div class="mobile-list">${rows.length?rows.map((x,i)=>`<div class="card"><div class="card-title">${esc(x.title||`인트로 ${i+1}`)}</div><div class="card-sub">${esc(textPreview(x.text||x.content||x,260))}</div></div>`).join(''):empty('인트로가 없어요','PC판의 인트로 데이터가 여기에 표시됩니다.')}</div></section>`}
function worldView(c){const w=c.worldSettings||{},text=typeof w.raw==='string'?w.raw:textPreview(w.sections||w,2000);return `<section class="section"><div class="section-head"><h2>세계관·설정</h2></div><div class="card"><div class="card-sub" style="white-space:pre-wrap;font-size:13px">${esc(text||'설정이 없어요.')}</div></div></section>`}
function oocView(c){const rows=c.oocEpisodes||[];return `<section class="section"><div class="section-head"><h2>OOC</h2></div><div class="mobile-list">${rows.length?rows.map((x,i)=>`<div class="card"><div class="card-title">${esc(x.title||`OOC ${i+1}`)}</div><div class="card-sub">${esc(textPreview(x.rawOutput||x.text||x.blocks||'',240))}</div></div>`).join(''):empty('OOC가 없어요','PC판 OOC 데이터가 여기에 표시됩니다.')}</div></section>`}
cardPage=function(){
 const c=card();if(!c)return replaceRoute({view:'home',cardId:''});document.body.classList.add('mobile-in-card');document.body.classList.remove('mobile-zeta');applyMobileTheme();c.lastOpenedAt=now();touch(c);
 const tabs=[['overview','카드 홈'],['intro','인트로'],['people','캐릭터'],['world','세계관·설정'],['events','사건'],['memory','기억'],['logs','로그'],['ooc','OOC']];
 const content=route.tab==='intro'?introView(c):route.tab==='people'?peopleView(c):route.tab==='world'?worldView(c):route.tab==='events'?eventsView(c):route.tab==='memory'?memoryView(c):route.tab==='logs'?logsView(c):route.tab==='ooc'?oocView(c):_baseOverview(c);
 setApp(`${topbar('', '', true)}${mainWrap(`${mobileHero(c)}<div class="tabs">${tabs.map(([v,l])=>`<button data-card-tab="${v}" class="${route.tab===v?'active':''}">${l}</button>`).join('')}</div>${content}`)}`);bindScrollTab()
}
function recentView(){document.body.classList.remove('mobile-in-card','mobile-zeta');applyMobileTheme();const rows=[...state.cards].sort((a,b)=>String(b.lastOpenedAt||'').localeCompare(String(a.lastOpenedAt||''))).filter(c=>c.lastOpenedAt);setApp(`${topbar('최근 열람','최근 열어본 카드를 이어서 확인하세요.',false)}${mainWrap(`<div class="mcard-grid list">${rows.length?rows.map(mobileCardTile).join(''):empty('최근 열람이 없어요','카드를 한 번 열면 여기에 나타나요.')}</div>`)}${mobileBottom('recent')}`)}
function backupView(){document.body.classList.remove('mobile-in-card','mobile-zeta');applyMobileTheme();setApp(`${topbar('백업·복원','PC와 같은 state 구조를 유지합니다.',false)}${mainWrap(`<section class="settings-card"><h2>데이터</h2><p>PC 전체 백업 JSON을 가져오거나 모바일 데이터를 다시 내보냅니다.</p><div class="mobile-list"><button class="card" data-act="import"><div class="card-title">PC 백업 가져오기</div><div class="card-sub">기존 카드·캐릭터·사건·기억·로그 구조를 유지합니다.</div></button><button class="card" data-act="export"><div class="card-title">전체 백업 내보내기</div><div class="card-sub">PC판이 다시 읽을 수 있는 JSON으로 저장합니다.</div></button></div></section>`)}${mobileBottom('backup')}`)}
function settingsView(){document.body.classList.remove('mobile-in-card','mobile-zeta');applyMobileTheme();const layout=state.settings.homeLayout||'cover-focus';setApp(`${topbar('앱 설정','PC 원본의 전역 설정을 모바일에서도 같은 데이터로 사용합니다.',false)}${mainWrap(`<section class="settings-card"><h2>카드 홈 배치</h2><p>배치 선택은 전체 카드에 일괄 적용됩니다. 모바일에서는 미리보기만 작게 표시합니다.</p><div class="layout-options"><button class="layout-option ${layout==='cover-focus'?'active':''}" data-layout-mobile="cover-focus"><div class="layout-thumb basic"></div><b>기본형</b></button><button class="layout-option ${layout==='cinematic'?'active':''}" data-layout-mobile="cinematic"><div class="layout-thumb cine"></div><b>시네마틱형</b></button></div></section>
 <section class="settings-card"><h2>보관함 이름</h2><p>PC와 모바일이 같은 이름을 사용합니다.</p><div class="archive-name-row"><input id="archiveNameMobile" value="${esc(state.settings.archiveName||'추억보관함')}"><button data-act="save-archive-name">저장</button></div></section>
 <section class="settings-card"><div class="settings-mobile-head"><div><h2>테마</h2><p>PC 원본의 기본 프리셋과 사용자 테마를 모두 표시합니다. 선택한 하나가 앱 전체에 적용됩니다.</p></div><button class="theme-clone-mobile" data-act="new-custom-theme-mobile">＋ 현재 테마 복제</button></div><div class="theme-options pc-parity-themes">${mobileThemeOptionsHtml()}</div></section>
 <div class="mobile-note"><b>동일 설정 원칙</b><br>색상 테마·사용자 테마·보관함 이름·카드 배치 값은 PC 백업과 동일한 state에 저장됩니다.<br>Mobile ${HOSTED_MOBILE_VERSION} · source ${HOSTED_SOURCE_VERSION}</div>`)}${mobileBottom('settings')}`)}
function renderMobile(){applyMobileTheme();if(route.view==='recent')return recentView();if(route.view==='backup')return backupView();if(route.view==='settings')return settingsView();return _baseRender()}
render=renderMobile;
const _baseLogPage=logPage;logPage=function(){document.body.classList.remove('mobile-in-card');document.body.classList.add('mobile-zeta');applyMobileTheme();const c=card(),log=c?.logBackups?.find(l=>String(l.id)===String(route.logId));if(!c||!log)return history.back();const blocks=log.blocks||[],limit=Math.min(route.logLimit||80,blocks.length),visible=blocks.slice(0,limit);setApp(`<div class="zeta-shell"><header class="zeta-top"><button data-act="back" aria-label="뒤로">‹</button><span class="spacer"></span><button class="zeta-tools" data-act="zeta-tools" aria-label="읽기 도구">☰</button></header><div class="zeta-stream">${renderLog(visible,c)}${limit<blocks.length?`<button class="loadmore" data-act="more-log">다음 ${Math.min(80,blocks.length-limit)}개 불러오기 · ${limit}/${blocks.length}</button>`:''}</div></div>`) };
function editCardMobile(){const c=card();if(!c)return;openSheet('카드 편집',`<div class="field"><label>이름</label><input id="mCardName" value="${esc(c.name)}"></div><div class="field"><label>설명</label><textarea id="mCardDesc">${esc(c.description||'')}</textarea></div>`,`<button class="btn" data-act="sheet-close">취소</button><button class="btn primary" data-act="save-card-mobile">저장</button>`)}
function createCardMobile(){openSheet('새 카드 만들기',`<div class="field"><label>카드 이름</label><input id="newCardName" placeholder="카드 이름"></div><div class="field"><label>설명</label><textarea id="newCardDesc" placeholder="간단한 설명"></textarea></div>`,`<button class="btn" data-act="sheet-close">취소</button><button class="btn primary" data-act="save-new-card">만들기</button>`)}
function exportBackupV020(){const payload={format:'memory-archive-full-backup',schemaVersion:1,createdAt:now(),source:{platform:'mobile-web',mobileVersion:HOSTED_MOBILE_VERSION,mobileSourceVersion:HOSTED_SOURCE_VERSION},state};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`memory_archive_mobile_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
exportBackup=exportBackupV020;
document.addEventListener('change',e=>{if(e.target.id==='mobileSort'){state.settings.homeSort=e.target.value;persist();home()}},true);
document.addEventListener('click',e=>{const t=e.target.closest('[data-act],[data-layout-mobile],[data-theme-mobile],[data-edit-theme-mobile],[data-delete-theme-mobile],[data-save-theme-mobile]');if(!t)return;
 if(t.dataset.layoutMobile){e.preventDefault();state.settings.homeLayout=t.dataset.layoutMobile;state.settings.defaultHomeLayout=t.dataset.layoutMobile;persist();settingsView();return}
 if(t.dataset.themeMobile){e.preventDefault();state.settings.themeId=t.dataset.themeMobile;persist();applyMobileTheme();settingsView();return}
 if(t.dataset.editThemeMobile){e.preventDefault();openMobileThemeEditor(t.dataset.editThemeMobile);return}
 if(t.dataset.deleteThemeMobile){e.preventDefault();const id=t.dataset.deleteThemeMobile;if(!mobileCustomThemes()[id])return;if(!confirm('이 사용자 테마를 삭제할까요?'))return;delete state.customThemes?.[id];delete state.settings.customThemes?.[id];if(state.settings.themeId===id)state.settings.themeId='rose-cream';persist();applyMobileTheme();settingsView();toast('사용자 테마를 삭제했어요.');return}
 if(t.dataset.saveThemeMobile!==undefined){e.preventDefault();saveMobileCustomTheme(t.dataset.saveThemeMobile||'');return}
 const a=t.dataset.act;
 if(a==='view-grid'){e.preventDefault();state.settings.homeView='grid';persist();home();return}
 if(a==='view-list'){e.preventDefault();state.settings.homeView='list';persist();home();return}
 if(a==='create-card'){e.preventDefault();createCardMobile();return}
 if(a==='save-new-card'){e.preventDefault();const name=$('#newCardName')?.value.trim();if(!name)return toast('카드 이름을 입력해 주세요.');const c=normalizeCard({id:uid('card'),name,description:$('#newCardDesc')?.value||'',settings:{},characters:[],intros:[],logBackups:[],logSummaries:[],oocEpisodes:[]});state.cards.unshift(c);persist();closeSheet();home();toast('카드를 만들었어요.');return}
 if(a==='edit-card-mobile'){e.preventDefault();editCardMobile();return}
 if(a==='card-settings-mobile'){e.preventDefault();route.view='settings';history.pushState(route,'');settingsView();return}
 if(a==='save-card-mobile'){e.preventDefault();const c=card();if(!c)return;c.name=$('#mCardName')?.value.trim()||c.name;c.description=$('#mCardDesc')?.value||'';touch(c);closeSheet();cardPage();toast('카드를 저장했어요.');return}
 if(a==='save-archive-name'){e.preventDefault();state.settings.archiveName=$('#archiveNameMobile')?.value.trim()||'추억보관함';persist();settingsView();return}
 if(a==='new-custom-theme-mobile'){e.preventDefault();openMobileThemeEditor('');return}
 if(a==='zeta-tools'){e.preventDefault();openSheet('읽기 도구','<div class="mobile-note">로그는 제타 표시 규칙으로 읽습니다. 페이지 이동은 브라우저 스크롤을 사용하고, 추가 블록은 아래에서 불러옵니다.</div>','<button class="btn primary" data-act="sheet-close">닫기</button>');return}
},true);
const _oldBind=bindScrollTab;bindScrollTab=function(){requestAnimationFrame(()=>{const el=$('.tabs .active');if(el)try{el.scrollIntoView({inline:'center',block:'nearest',behavior:'auto'})}catch{};_oldBind?.()})};
applyMobileTheme();document.title=(state?.settings?.archiveName||'추억보관함')+' Mobile';
console.log('[추억보관함 모바일] v0.2.1 · source v2.10.23 · canonical global theme parity');
