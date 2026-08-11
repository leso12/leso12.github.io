const API='https://vulpttgewjfkxojimyxl.supabase.co/functions/v1/devlib-mobile';
const POLL_MS=15000;
let lastSignature='';
let loading=false;

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const fmt=v=>{if(!v)return'기록 없음';const d=new Date(Number(v)||v);if(isNaN(d))return'기록 없음';return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)};
const clock=()=>new Intl.DateTimeFormat('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());

function getKey(){
  const u=new URL(location.href);
  let k=u.searchParams.get('key');
  if(k){localStorage.setItem('devlib_view_key',k);u.searchParams.delete('key');history.replaceState({},'',u.pathname+u.search+u.hash)}
  return k||localStorage.getItem('devlib_view_key')||'';
}
function list(xs,empty){return arr(xs).slice(0,6).map(x=>`<li>${esc(x)}</li>`).join('')||`<li class="muted">${esc(empty)}</li>`}
function saveCache(data){try{localStorage.setItem('devlib_mobile_cache',JSON.stringify({data,at:Date.now()}))}catch{}}
function readCache(){try{return JSON.parse(localStorage.getItem('devlib_mobile_cache')||'null')}catch{return null}}
function openProjectIds(){return new Set([...document.querySelectorAll('.project[open]')].map(x=>x.dataset.pid).filter(Boolean))}
function restoreOpen(ids){ids.forEach(id=>{const el=document.querySelector(`.project[data-pid="${CSS.escape(id)}"]`);if(el)el.open=true})}
function applySearch(){const q=document.getElementById('q'),empty=document.getElementById('empty');const v=(q?.value||'').trim().toLowerCase();let shown=0;document.querySelectorAll('.group').forEach(g=>{let gc=0;g.querySelectorAll('.project').forEach(p=>{const ok=!v||(p.dataset.search||'').includes(v);p.style.display=ok?'':'none';if(ok){gc++;shown++}});g.style.display=gc?'':'none'});if(empty)empty.style.display=shown?'none':'block'}

function render(data,{fromCache=false}={}){
  const p=data.payload||{},groups=arr(p.groups),projects=arr(p.projects),stats=p.stats||{};
  const openIds=openProjectIds();
  document.getElementById('sg').textContent=stats.groups??groups.length;
  document.getElementById('sp').textContent=stats.projects??projects.length;
  document.getElementById('sc').textContent=stats.chats??0;
  const ver=p.appVersion?` · PC v${esc(p.appVersion)}`:'';
  document.getElementById('updated').innerHTML=`읽기 전용 · 마지막 동기화 ${esc(fmt(data.updated_at||p.generatedAt))}${ver}`;
  let html='';
  for(const g of groups){
    const ps=projects.filter(x=>(x.group||'기타')===g.name).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    if(!ps.length)continue;
    html+=`<section class="group"><div class="gtitle"><span>${esc(g.icon||'📁')}</span><div><h2>${esc(g.name)}</h2><small>${ps.length}개 프로젝트</small></div></div>`;
    for(const x of ps){
      const search=`${g.name} ${x.name||''} ${x.current||''} ${arr(x.issues).join(' ')} ${arr(x.todos).join(' ')} ${arr(x.decisions).join(' ')}`.toLowerCase();
      const versions=arr(x.versions).slice(0,8).map(v=>`<span class="chip">${esc(v)}</span>`).join('');
      html+=`<details class="project" data-pid="${esc(x.id||'')}" data-search="${esc(search)}"><summary><span class="picon">${esc(x.icon||'📦')}</span><span class="pmain"><b>${esc(x.name||'프로젝트')}</b><small>${fmt(x.updatedAt)} · 대화 ${Number(x.chatCount||0)}개</small></span><span class="arrow">⌄</span></summary><div class="content">${versions?`<div class="versions">${versions}</div>`:''}<section class="now"><span>현재 작업</span><p>${esc(x.current||'아직 정리된 현재 작업이 없어요.')}</p></section><div class="grid"><section><h3>✓ 최근 완료</h3><ul>${list(x.done,'기록 없음')}</ul></section><section><h3>🐞 문제 · 버그</h3><ul>${list(x.issues,'현재 기록된 문제 없음')}</ul></section><section><h3>☐ 다음 작업</h3><ul>${list(x.todos,'기록 없음')}</ul></section><section><h3>◆ 결정 사항</h3><ul>${list(x.decisions,'기록 없음')}</ul></section></div></div></details>`;
    }
    html+='</section>';
  }
  document.getElementById('groups').innerHTML=html;
  restoreOpen(openIds);
  applySearch();
  const s=document.getElementById('status');
  s.className='status'+(fromCache?' warn':'');
  s.textContent=fromCache?`오프라인 · 마지막 저장본 표시 중 · ${clock()}`:`✓ 자동 갱신 ON · ${clock()}에 최신 상태 확인`;
}

async function load({silent=false,force=false}={}){
  if(loading&&!force)return;
  const key=getKey(),s=document.getElementById('status');
  if(!key){s.className='status bad';s.textContent='보기 키가 없어요. 처음 받은 전용 링크로 한 번 열어주세요.';return}
  loading=true;
  if(!silent){s.className='status';s.textContent='클라우드 최신 상태 확인 중…'}
  try{
    const r=await fetch(API+'?key='+encodeURIComponent(key)+'&_='+Date.now(),{cache:'no-store'});
    const d=await r.json();
    if(!r.ok||!d.ok)throw new Error(d.error||('HTTP '+r.status));
    const sig=`${d.updated_at||''}|${d.payload?.generatedAt||''}|${d.payload?.appVersion||''}`;
    saveCache(d);
    if(force||sig!==lastSignature){lastSignature=sig;render(d)}
    else{s.className='status';s.textContent=`✓ 자동 갱신 ON · ${clock()}에 확인 · 변경 없음`}
  }catch(e){
    const c=readCache();
    if(c?.data){if(!lastSignature)render(c.data,{fromCache:true});else{s.className='status warn';s.textContent='인터넷 연결 대기 중 · 마지막 저장본 유지'}}
    else{s.className='status bad';s.textContent='클라우드 데이터를 불러오지 못했어요: '+e.message}
  }finally{loading=false}
}

const q=document.getElementById('q');
q?.addEventListener('input',applySearch);
document.getElementById('refresh')?.addEventListener('click',()=>load({force:true}));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load({silent:true,force:true})});
window.addEventListener('focus',()=>load({silent:true}));
window.addEventListener('pageshow',()=>load({silent:true,force:true}));
window.addEventListener('online',()=>load({silent:true,force:true}));
setInterval(()=>{if(document.visibilityState==='visible')load({silent:true})},POLL_MS);
load({force:true});
