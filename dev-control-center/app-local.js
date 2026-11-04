'use strict';
// DEV CONTROL CENTER v0.5 — browser-only, no server-side user data.
const KEY = 'devcc.v05.local';
const STATUS = {planned:'예정',in_progress:'진행 중',implemented:'코드 반영',verified:'검증 완료',deployed:'배포 완료'};
const PERCENT = {planned:0,in_progress:25,implemented:60,verified:90,deployed:100};
const EXAMPLES = [['LiDAR AMR 자체 제어','SLAM · 위치 재추정 · 주행'],['Utility Sampling Control','WPF · 모터 제어 · 자동 시퀀스'],['Lumi AI Studio','AI 채팅 · 온라인 배포'],['ZETA 기억 보강','기억 추출 · 요약 · UI'],['스타듀 에셋','도트 · 리텍스처 · 모드']];
const $ = sel => document.querySelector(sel);
const safe = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clean = (v,max=600) => String(v==null?'':v).trim().slice(0,max);
const now = () => new Date().toISOString();
const ident = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+'-'+Math.random().toString(36).slice(2));
const fmt = d => {try{return new Date(d).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}catch{return '—';}};
const blank=()=>({schema:5,projects:[],tasks:[],chats:[],activity:[],commands:[]});
let state = blank();
let selected = null;
let toastTimer;
let pendingDraft = null;
function alertBar(msg){const node=$('#toast');node.textContent=msg;node.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.hidden=true,4800);}
function readState(){
 try {
  const raw=localStorage.getItem(KEY);
  if(!raw)return blank();
  const obj=JSON.parse(raw);
  if(obj && obj.schema===5 && ['projects','tasks','chats','activity','commands'].every(k=>Array.isArray(obj[k])))return obj;
 }catch(e){console.warn('DEVCC saved data read failed',e);}
 return blank();
}
function persist(){
 state.activity=state.activity.slice(-300);
 state.commands=state.commands.slice(-150);
 try {localStorage.setItem(KEY,JSON.stringify(state));render();return true;}
 catch(e){alertBar('브라우저 저장 실패: 저장 공간 또는 개인정보 보호 설정을 확인해 줘.');return false;}
}
function log(projectId,kind,title){state.activity.push({id:ident(),projectId,kind,title,at:now()});}
function byProject(){return state.projects.find(p=>p.id===selected)||null;}
function tasksFor(id){return state.tasks.filter(t=>t.projectId===id);}
function progress(id){const list=tasksFor(id),total=list.reduce((a,t)=>a+(Number(t.weight)||1),0);return total?Math.round(list.reduce((a,t)=>a+(Number(t.weight)||1)*PERCENT[t.status],0)/total):null;}
function stat(label,value,sub){return '<div class="metric"><span>'+safe(label)+'</span><strong>'+safe(value)+'</strong><small>'+safe(sub)+'</small></div>';}
function urlOfChat(raw){try{const u=new URL(raw);return u.protocol==='https:' && ['chatgpt.com','chat.openai.com','claude.ai'].includes(u.hostname)?u.href:null;}catch{return null;}}
function urlOfGithub(repo){return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)?'https://github.com/'+repo:null;}
function overview(){
 const projects=state.projects;
 const withProgress=projects.map(p=>progress(p.id)).filter(v=>v!==null);
 const average=withProgress.length?Math.round(withProgress.reduce((a,b)=>a+b,0)/withProgress.length)+'%':'미산정';
 const latest=state.activity.slice(-12).reverse();
 return '<div class="welcome"><div><div class="eyebrow">MY DEVELOPMENT WORKSPACE</div><h1>모든 AI 개발을 한눈에</h1><p>로그인 없이 시작하는 개인 개발 대시보드. 기록은 현재 브라우저에만 저장돼.</p></div><button class="primary" data-action="new-project">＋ 프로젝트 추가</button></div>'+
  '<div class="metrics">'+stat('관리 프로젝트',projects.length,'현재 브라우저')+stat('평균 진도율',average,'등록된 기능 기준')+stat('검증·배포',state.tasks.filter(t=>['verified','deployed'].includes(t.status)).length,'AI 완료 보고와 별개')+stat('연결된 채팅',state.chats.length,'채팅 주소 등록')+'</div>'+
  '<div class="two-col"><section class="panel"><div class="panel-head"><h2>프로젝트 현황</h2><span>진도율은 작업 상태로 계산</span></div><div class="project-grid">'+
  (projects.map(p=>{const v=progress(p.id);return '<button class="project-card" data-project="'+safe(p.id)+'"><div class="card-head"><span class="diamond">◇</span><strong>'+(v===null?'—':v+'%')+'</strong></div><h3>'+safe(p.name)+'</h3><p>'+safe(p.description)+'</p><div class="track"><i style="width:'+(v||0)+'%"></i></div><div class="card-foot"><span>'+tasksFor(p.id).length+'개 작업</span><span>열기 ↗</span></div></button>'}).join('')||'<div class="empty">아직 프로젝트가 없어.<div><button class="secondary" data-action="seed">기본 프로젝트 5개 등록</button></div></div>')+'</div></section>'+
  '<section class="panel"><div class="panel-head"><h2>최근 업데이트</h2><span>브라우저에 저장된 기록</span></div>'+activityHTML(latest)+'</section></div>';
}
function activityHTML(items){return '<div class="activities">'+(items.length?items.map(a=>'<div class="event"><div class="dot"></div><div><b>'+safe(a.title)+'</b><span>'+fmt(a.at)+'</span></div></div>').join(''):'<div class="empty">변경 기록이 없어.</div>')+'</div>';}
function taskHTML(task){return '<div class="item task"><div class="item-main"><b>'+safe(task.title)+'</b><small>'+safe(task.evidence||'검증 근거 미등록')+'</small></div><div class="item-actions"><select data-status="'+safe(task.id)+'">'+Object.entries(STATUS).map(([v,t])=>'<option value="'+v+'"'+(task.status===v?' selected':'')+'>'+t+'</option>').join('')+'</select><button class="smallbtn" data-evidence="'+safe(task.id)+'">근거</button><button class="smallbtn danger" data-delete-task="'+safe(task.id)+'">삭제</button></div></div>';}
function projectView(p){
 const list=tasksFor(p.id), chats=state.chats.filter(c=>c.projectId===p.id), cmd=state.commands.filter(c=>c.projectId===p.id).slice(-8).reverse();
 const pval=progress(p.id),repo=urlOfGithub(p.githubRepo||'');
 return '<div class="welcome"><div><div class="eyebrow">PROJECT DETAILS</div><h1>'+safe(p.name)+'</h1><p>'+safe(p.description)+'</p></div><div class="actions"><button class="secondary" data-action="edit-project">프로젝트 편집</button><button class="primary" data-action="copy-handoff">계승문 복사</button></div></div>'+
 '<div class="metrics">'+stat('진행률',pval===null?'미산정':pval+'%','가중 평균')+stat('작업',list.length,'기능 단위')+stat('검증 완료',list.filter(t=>['verified','deployed'].includes(t.status)).length,'실제 검증 기준')+stat('연결된 대화',chats.length,'ChatGPT · Claude')+'</div>'+
 '<div class="two-col"><div class="stack">'+
 '<section class="panel"><div class="panel-head"><h2>개발 작업</h2><span>AI가 완료했다고 말해도 자동 승인하지 않아</span></div><form id="taskForm" class="inline-form"><input name="title" maxlength="240" placeholder="예: CAP / UNCAP T-Z 동시 동작" required><button class="primary">작업 추가</button></form><div class="item-list">'+(list.map(taskHTML).join('')||'<div class="empty">작업을 추가하면 진도율이 계산돼.</div>')+'</div></section>'+
 '<section class="panel"><div class="panel-head"><h2>개발 명령 준비</h2><span>AI 전송은 직접 확인</span></div><form id="commandForm" class="form-padding">'+
 (chats.length?'<label>대상 대화</label><select name="chatId" required>'+chats.map(c=>'<option value="'+safe(c.id)+'">'+safe(c.provider.toUpperCase()+' · '+c.title)+'</option>').join('')+'</select>':'<div class="notice">먼저 아래에서 GPT 또는 Claude 대화 링크를 등록해 줘.</div>')+
 '<label>개발 명령</label><textarea name="prompt" rows="4" maxlength="6000" placeholder="예: 최신 소스에서 오류 원인을 분석하고 수정 항목을 정리해줘." required></textarea><div class="actions"><button class="primary" type="submit" '+(chats.length?'':'disabled')+'>명령 복사 + 채팅 열기</button><button class="secondary" type="button" data-action="extension-draft" '+(chats.length?'':'disabled')+'>확장으로 채팅 입력 준비</button></div><p class="help">확장 프로그램은 전송 버튼을 누르지 않아. 연결되지 않았다면 복사·열기 방식으로 사용하면 돼.</p></form><div class="item-list">'+cmd.map(c=>'<div class="item"><div class="item-main"><b>'+safe(c.text.slice(0,150))+'</b><small>'+safe(c.status)+' · '+fmt(c.at)+'</small></div></div>').join('')+'</div></section></div>'+
 '<div class="stack"><section class="panel"><div class="panel-head"><h2>기존 GPT · Claude 채팅</h2><span>링크만 등록 · 대화 본문은 읽지 않음</span></div><form id="chatForm" class="form-padding"><label>서비스</label><select name="provider"><option value="chatgpt">ChatGPT</option><option value="claude">Claude</option></select><label>채팅 이름</label><input name="title" maxlength="100" placeholder="예: LiDAR AMR 개발 대화" required><label>기존 대화 URL</label><input type="url" name="url" maxlength="900" placeholder="https://chatgpt.com/c/..." required><button class="primary" style="margin-top:10px">대화 연결</button></form><div class="item-list">'+(chats.map(c=>'<div class="item"><div class="item-main"><b>'+safe(c.provider.toUpperCase()+' · '+c.title)+'</b><small>'+safe(c.url)+'</small></div><div class="item-actions"><a class="smallbtn" target="_blank" rel="noopener noreferrer" href="'+safe(urlOfChat(c.url)||'#')+'">열기</a><button class="smallbtn danger" data-delete-chat="'+safe(c.id)+'">삭제</button></div></div>').join('')||'<div class="empty">연결된 채팅이 없어.</div>')+'</div></section>'+
 '<section class="panel"><div class="panel-head"><h2>GitHub 저장소</h2><span>비공개 저장소 소스는 브라우저에서 자동 수집 불가</span></div><form id="repoForm" class="form-padding"><label>저장소 경로</label><div class="row"><input name="repo" value="'+safe(p.githubRepo||'')+'" placeholder="owner/private-repo"><button class="secondary">저장</button></div><p class="help">비공개 GitHub 저장소의 커밋 자동 조회는 GitHub 인증 연동을 별도로 추가해야 해. 개인 토큰을 입력하지 마.</p>'+(repo?'<a target="_blank" rel="noopener noreferrer" href="'+safe(repo)+'">저장소 열기 ↗</a>':'')+'</form></section>'+
 '<section class="panel"><div class="panel-head"><h2>프로젝트 변경 기록</h2><span>최근 12개</span></div>'+activityHTML(state.activity.filter(a=>a.projectId===p.id).slice(-12).reverse())+'</section></div></div>';
}
function render(){
 const current=byProject();
 $('#projectNav').innerHTML=state.projects.map(p=>'<button class="nav-project'+(current&&current.id===p.id?' selected':'')+'" data-project="'+safe(p.id)+'"><span class="mini-dot"></span>'+safe(p.name)+'</button>').join('');
 $('#overviewBtn').classList.toggle('selected',!current);
 $('#breadcrumb').textContent=current?'PROJECTS / '+current.name:'WORKSPACE / OVERVIEW';
 $('#main').innerHTML=current?projectView(current):overview();
 $('#projectCount').textContent=String(state.projects.length);
 $('#backupUpdated').textContent='이 브라우저에만 저장 · '+new Date().toLocaleTimeString('ko-KR');
}
function createProject(name,description){const p={id:ident(),name:clean(name,100),description:clean(description,300),githubRepo:'',createdAt:now()};state.projects.push(p);log(p.id,'project','프로젝트 생성: '+p.name);selected=p.id;persist();}
function copy(text){return navigator.clipboard?.writeText(text).catch(()=>{throw Error('복사 실패');})||Promise.reject(Error('복사 권한 없음'));}
function selectedChat(form){const id=new FormData(form).get('chatId');return state.chats.find(c=>c.id===id&&c.projectId===selected)||null;}
function handoff(p){const tasks=tasksFor(p.id),chats=state.chats.filter(c=>c.projectId===p.id);return '# '+p.name+' 개발 계승\n\n설명: '+p.description+'\n진행률: '+(progress(p.id)??'미산정')+'%\n\n작업 상태:\n'+(tasks.map(t=>'- ['+STATUS[t.status]+'] '+t.title+(t.evidence?' / 근거: '+t.evidence:'')).join('\n')||'등록된 작업 없음')+'\n\n기존 채팅:\n'+(chats.map(c=>'- '+c.provider+' '+c.url).join('\n')||'없음')+'\n\n중요: 완료 선언만으로 기능 검증 완료로 판단하지 말 것. 실제 코드와 테스트를 확인할 것.';}
document.addEventListener('click',async e=>{
 const project=e.target.closest('[data-project]');if(project){selected=project.dataset.project;render();return;}
 if(e.target.closest('#overviewBtn')){selected=null;render();return;}
 const action=e.target.closest('[data-action]')?.dataset.action;
 if(action==='new-project'){const name=prompt('새 프로젝트 이름');if(!clean(name,100))return;const desc=prompt('프로젝트 설명 (선택)','')||'';createProject(name,desc);return;}
 if(action==='seed'){EXAMPLES.forEach(([name,description])=>{if(state.projects.some(p=>p.name===name))return;const p={id:ident(),name,description,githubRepo:'',createdAt:now()};state.projects.push(p);log(p.id,'project','프로젝트 생성: '+name);});persist();return;}
 if(action==='edit-project'){const p=byProject();if(!p)return;const name=prompt('프로젝트 이름',p.name);if(!clean(name,100))return;const description=prompt('설명',p.description);p.name=clean(name,100);if(description!==null)p.description=clean(description,300);log(p.id,'project','프로젝트 정보 수정');persist();return;}
 if(action==='copy-handoff'){const p=byProject();if(!p)return;try{await copy(handoff(p));alertBar('개발 계승문을 복사했어.');}catch{alertBar('클립보드 복사 권한을 확인해 줘.');}return;}
 if(action==='extension-draft'){
  const form=$('#commandForm');if(!form?.reportValidity())return;
  const chat=selectedChat(form),text=clean(new FormData(form).get('prompt'),6000);
  if(!chat||!text)return;
  const id=ident();pendingDraft=id;
  window.postMessage({type:'DEVCC_PREPARE_DRAFT',requestId:id,chatUrl:chat.url,prompt:text},location.origin);
  setTimeout(()=>{if(pendingDraft===id){pendingDraft=null;alertBar('확장 연결이 확인되지 않아. 아래 복사·열기 버튼을 사용해 줘.');}},2600);
  return;
 }
 const evidence=e.target.closest('[data-evidence]');if(evidence){const t=state.tasks.find(t=>t.id===evidence.dataset.evidence);if(!t)return;const val=prompt('검증 근거: 커밋 SHA, 실제 시험 결과 등',t.evidence||'');if(val===null)return;t.evidence=clean(val,1000);log(t.projectId,'task','검증 근거 수정: '+t.title);persist();return;}
 const delTask=e.target.closest('[data-delete-task]');if(delTask){const t=state.tasks.find(t=>t.id===delTask.dataset.deleteTask);if(!t||!confirm('이 작업을 삭제할까?'))return;state.tasks=state.tasks.filter(x=>x.id!==t.id);log(t.projectId,'task','작업 삭제: '+t.title);persist();return;}
 const delChat=e.target.closest('[data-delete-chat]');if(delChat){const c=state.chats.find(c=>c.id===delChat.dataset.deleteChat);if(!c||!confirm('이 채팅 링크를 삭제할까?'))return;state.chats=state.chats.filter(x=>x.id!==c.id);log(c.projectId,'chat','대화 연결 삭제: '+c.title);persist();return;}
 if(e.target.closest('#exportBtn')){const json=JSON.stringify(state,null,2);const blob=new Blob([json],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='devcc-local-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);alertBar('백업 파일을 저장했어. 파일에는 개발 기록이 들어 있으니 주의해 줘.');return;}
 if(e.target.closest('#importBtn')){$('#importFile').click();return;}
 if(e.target.closest('#seedGlobal')){EXAMPLES.forEach(([name,description])=>{if(state.projects.some(p=>p.name===name))return;const p={id:ident(),name,description,githubRepo:'',createdAt:now()};state.projects.push(p);});persist();return;}
});
document.addEventListener('change',e=>{
 const sel=e.target.closest('[data-status]');if(!sel)return;const t=state.tasks.find(t=>t.id===sel.dataset.status);if(!t)return;
 const next=sel.value;if(!Object.prototype.hasOwnProperty.call(STATUS,next))return;
 if(['verified','deployed'].includes(next)&&!confirm('실제 코드 검증 또는 배포를 확인했어? AI의 완료 보고만으로는 선택하지 마.')){sel.value=t.status;return;}
 t.status=next;log(t.projectId,'task','작업 상태: '+t.title+' → '+STATUS[next]);persist();
});
document.addEventListener('submit',async e=>{
 const f=e.target;
 if(!['taskForm','chatForm','repoForm','commandForm'].includes(f.id))return;e.preventDefault();
 const vals=new FormData(f),p=byProject();if(!p)return;
 if(f.id==='taskForm') {const title=clean(vals.get('title'),240);if(!title)return;state.tasks.push({id:ident(),projectId:p.id,title,status:'planned',weight:1,evidence:'',createdAt:now()});log(p.id,'task','작업 추가: '+title);persist();return;}
 if(f.id==='chatForm') {const url=urlOfChat(vals.get('url')),provider=vals.get('provider'),title=clean(vals.get('title'),100);if(!url||!['chatgpt','claude'].includes(provider)||!title){alertBar('ChatGPT 또는 Claude의 정상적인 HTTPS 대화 링크를 입력해 줘.');return;}if((provider==='claude')!==(new URL(url).hostname==='claude.ai')){alertBar('서비스 선택과 채팅 링크 도메인이 달라.');return;}state.chats.push({id:ident(),projectId:p.id,title,provider,url,createdAt:now()});log(p.id,'chat','대화 연결: '+title);persist();return;}
 if(f.id==='repoForm') {const repo=clean(vals.get('repo'),180);if(repo&&!urlOfGithub(repo)){alertBar('owner/repository 형태로 입력해 줘.');return;}p.githubRepo=repo;log(p.id,'repo','저장소 연결 정보 수정');persist();return;}
 if(f.id==='commandForm'){
  const chat=selectedChat(f),text=clean(vals.get('prompt'),6000);if(!chat||!text)return;
  try{await copy(text);}catch{alertBar('클립보드 권한을 확인해 줘.');return;}
  state.commands.push({id:ident(),projectId:p.id,chatId:chat.id,text,status:'복사함',at:now()});log(p.id,'command','명령을 복사했어: '+text.slice(0,65));persist();
  window.open(chat.url,'_blank','noopener,noreferrer');alertBar('명령을 복사했어. 열린 채팅에 붙여넣고 전송해 줘.');return;
 }
});
$('#importFile').addEventListener('change',async e=>{
 const file=e.target.files?.[0];e.target.value='';if(!file)return;
 if(file.size>5_000_000){alertBar('백업 파일 크기가 너무 커. 5MB 이하여야 해.');return;}
 try{
  const data=JSON.parse(await file.text());
  if(!data||data.schema!==5||!['projects','tasks','chats','activity','commands'].every(k=>Array.isArray(data[k])))throw Error('DEVCC v0.5 백업 형식이 아니야.');
  if(data.projects.length>500||data.tasks.length>10000||data.chats.length>2000||data.activity.length>10000||data.commands.length>10000)throw Error('데이터 항목 수가 너무 많아.');
  if(!confirm('현재 브라우저의 모든 DEVCC 기록을 이 백업으로 교체할까?'))return;
  state={schema:5,projects:data.projects,tasks:data.tasks,chats:data.chats,activity:data.activity,commands:data.commands};selected=null;
  if(persist())alertBar('백업 복원 완료');
 }catch(err){alertBar('복원 실패: '+String(err.message||err));}
});
window.addEventListener('storage',e=>{if(e.key===KEY){state=readState();if(selected&&!byProject())selected=null;render();}});
window.addEventListener('message',async e=>{
 if(e.source!==window||e.origin!==location.origin||e.data?.type!=='DEVCC_DRAFT_RESULT'||e.data.requestId!==pendingDraft)return;
 pendingDraft=null;
 alertBar(e.data.ok?'확장 프로그램이 채팅창에 명령을 준비했어. 확인 후 전송해 줘.':'확장 프로그램 전달 실패: '+clean(e.data.message,200));
});
state=readState();render();