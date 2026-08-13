const VERSION='v0.15.9';
function normalizeSingleEditorEntry(){
  document.title=document.title.replace(/v0\.15\.[0-8]/g,VERSION);
  document.querySelectorAll('.page-head small').forEach(el=>{el.textContent=el.textContent.replace(/v0\.15\.[0-8]/g,VERSION)});
  document.querySelectorAll('button').forEach(button=>{
    const text=(button.textContent||'').trim();
    if(text==='캐릭터 편집')button.textContent='편집';
    if(text==='에피소드 편집'||text==='소개 편집')button.hidden=true;
  });
}
const observer=new MutationObserver(normalizeSingleEditorEntry);
observer.observe(document.documentElement,{subtree:true,childList:true});
normalizeSingleEditorEntry();
