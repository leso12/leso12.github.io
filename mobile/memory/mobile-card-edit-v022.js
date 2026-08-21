'use strict';
/* Memory Archive hosted mobile v0.2.2 — card editor parity patch.
   Keeps the same card fields used by PC/common source v2.10.23. */
(()=>{
const MOBILE_EDIT_VERSION='0.2.2', SOURCE_VERSION_EDIT='2.10.23';
let cardMediaDraft=null;
const baseOpenSheet=openSheet, baseCloseSheet=closeSheet;

function dataUrlFromFile(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('사진을 읽지 못했어요.'));r.readAsDataURL(file)
  })
}
function mediaState(kind){
  if(!cardMediaDraft)return null;
  return kind==='avatar'?{valueKey:'avatar',originalKey:'avatarOriginal'}:{valueKey:'cover',originalKey:'coverOriginal'}
}
function mediaPreviewHtml(kind,src){
  if(src)return `<img src="${esc(src)}" alt="${kind==='avatar'?'카드 프사':'카드 커버'} 미리보기">`;
  return kind==='avatar'?'<span class="m-card-media-fallback" aria-hidden="true"></span>':'<span class="m-card-cover-empty">선택 안 함</span>'
}
function syncMediaPreview(kind){
  const st=mediaState(kind);if(!st)return;
  const el=document.getElementById(kind==='avatar'?'mCardAvatarPreview':'mCardCoverPreview');if(!el)return;
  el.innerHTML=mediaPreviewHtml(kind,cardMediaDraft[st.valueKey]||'');
}
function cardMediaPicker(kind,label){
  const st=mediaState(kind),src=st?cardMediaDraft[st.valueKey]:'';
  const fileId=kind==='avatar'?'mCardAvatarFile':'mCardCoverFile',previewId=kind==='avatar'?'mCardAvatarPreview':'mCardCoverPreview';
  return `<div class="field m-card-media-field"><label>${label}</label><div class="m-card-media-row ${kind==='cover'?'cover':''}"><div id="${previewId}" class="m-card-media-preview ${kind}">${mediaPreviewHtml(kind,src)}</div><div class="m-card-media-actions"><input id="${fileId}" type="file" accept="image/*" hidden><button type="button" class="btn" data-card-media-pick="${kind}">사진 선택</button><button type="button" class="btn" data-card-media-clear="${kind}">지우기</button><div class="m-card-media-note">휴대폰 사진·갤러리에서 선택할 수 있어요. 저장된 이미지는 PC 백업에서도 그대로 사용됩니다.</div></div></div></div>`
}

openSheet=function(...args){
  baseOpenSheet(...args);document.body.classList.add('sheet-open');
  requestAnimationFrame(()=>document.querySelector('#sheetRoot .sheet')?.setAttribute('tabindex','-1'))
};
closeSheet=function(){
  baseCloseSheet();document.body.classList.remove('sheet-open');cardMediaDraft=null
};

editCardMobile=function(){
  const c=card();if(!c)return;
  cardMediaDraft={
    avatar:String(c.avatar||''),avatarOriginal:String(c.avatarOriginal||c.avatar||''),
    cover:String(c.cover||''),coverOriginal:String(c.coverOriginal||c.cover||'')
  };
  openSheet('카드 정보 수정',`<div class="m-card-edit-grid">
    <div class="field full"><label>카드 이름 *</label><input id="mCardName" value="${esc(c.name||'')}"></div>
    <div class="field full"><label>한 줄 설명</label><input id="mCardDesc" value="${esc(c.description||'')}" placeholder="카드 설명"></div>
    <div class="field"><label>카드 폴더·그룹</label><input id="mCardFolder" value="${esc(c.folder||'')}" placeholder="예: 북부 대공가"></div>
    <div class="field"><label>기준 날짜</label><input id="mCardStartDate" type="date" value="${esc(c.startDate||'')}"></div>
    ${cardMediaPicker('avatar','카드 프사')}
    ${cardMediaPicker('cover','커버 이미지')}
    <div class="mobile-note m-card-edit-note"><b>PC와 같은 카드 데이터</b><br>이름·설명·폴더·기준 날짜·프사·커버를 같은 카드 필드에 저장합니다. 테마는 카드별이 아니라 앱 전체 테마 하나를 사용합니다.</div>
  </div>`,`<button type="button" class="btn" data-act="sheet-close">취소</button><button type="button" class="btn primary" data-act="save-card-mobile">변경 저장</button>`)
};

async function saveCardMobile022(){
  const c=card();if(!c)return;
  const name=$('#mCardName')?.value.trim();if(!name){toast('카드 이름을 입력해 주세요.');$('#mCardName')?.focus();return}
  c.name=name;
  c.description=$('#mCardDesc')?.value.trim()||'';
  c.folder=$('#mCardFolder')?.value.trim()||'';
  c.startDate=$('#mCardStartDate')?.value||'';
  if(cardMediaDraft){
    c.avatar=cardMediaDraft.avatar||'';
    c.avatarOriginal=cardMediaDraft.avatarOriginal||cardMediaDraft.avatar||'';
    c.cover=cardMediaDraft.cover||'';
    c.coverOriginal=cardMediaDraft.coverOriginal||cardMediaDraft.cover||'';
  }
  c.updatedAt=now();
  await persist();
  closeSheet();cardPage();toast('카드 정보를 저장했어요.')
}
async function onMediaFile(kind,file){
  if(!cardMediaDraft||!file)return;
  if(file.size>25*1024*1024){toast('사진은 25MB 이하로 선택해 주세요.');return}
  if(!/^image\//.test(file.type||'')){toast('이미지 파일을 선택해 주세요.');return}
  try{
    const data=await dataUrlFromFile(file),st=mediaState(kind);if(!st)return;
    cardMediaDraft[st.valueKey]=data;cardMediaDraft[st.originalKey]=data;syncMediaPreview(kind);toast(kind==='avatar'?'프사 사진을 불러왔어요.':'커버 사진을 불러왔어요.')
  }catch(e){toast(e?.message||'사진을 읽지 못했어요.')}
}
function clearMedia(kind){
  const st=mediaState(kind);if(!st)return;cardMediaDraft[st.valueKey]='';cardMediaDraft[st.originalKey]='';syncMediaPreview(kind)
}

/* Robust cancel/backdrop close. Capture phase prevents older mobile handlers from swallowing the button. */
document.addEventListener('click',e=>{
  const close=e.target.closest?.('[data-act="sheet-close"]');
  if(close){e.preventDefault();e.stopImmediatePropagation();closeSheet();return}
  const pick=e.target.closest?.('[data-card-media-pick]');
  if(pick){e.preventDefault();e.stopImmediatePropagation();document.getElementById(pick.dataset.cardMediaPick==='avatar'?'mCardAvatarFile':'mCardCoverFile')?.click();return}
  const clear=e.target.closest?.('[data-card-media-clear]');
  if(clear){e.preventDefault();e.stopImmediatePropagation();clearMedia(clear.dataset.cardMediaClear);return}
  const save=e.target.closest?.('[data-act="save-card-mobile"]');
  if(save){e.preventDefault();e.stopImmediatePropagation();saveCardMobile022();return}
},true);

document.addEventListener('change',e=>{
  if(e.target?.id==='mCardAvatarFile'){const f=e.target.files?.[0];e.target.value='';if(f)onMediaFile('avatar',f);return}
  if(e.target?.id==='mCardCoverFile'){const f=e.target.files?.[0];e.target.value='';if(f)onMediaFile('cover',f);return}
},true);

/* The editor must not be hidden behind the fixed bottom navigation. */
const baseSettingsView=typeof settingsView==='function'?settingsView:null;
if(baseSettingsView)settingsView=function(){const r=baseSettingsView();requestAnimationFrame(()=>document.querySelectorAll('.mobile-note').forEach(n=>{n.innerHTML=n.innerHTML.replace(/Mobile\s+0\.2\.1/g,'Mobile 0.2.2')}));return r};

/* Keep exported backup metadata honest. */
exportBackup=function(){
  const payload={format:'memory-archive-full-backup',schemaVersion:1,createdAt:now(),source:{platform:'mobile-web',mobileVersion:MOBILE_EDIT_VERSION,mobileSourceVersion:SOURCE_VERSION_EDIT},state};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`memory_archive_mobile_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)
};
console.log('[추억보관함 Mobile] v0.2.2 · card edit parity / image upload / cancel hotfix');
})();
