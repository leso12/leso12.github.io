(async()=>{
  try{
    const r=await fetch('./app.payload.txt?v=2.7.1',{cache:'no-store'});
    if(!r.ok)throw new Error(`payload HTTP ${r.status}`);
    const b64=(await r.text()).trim();
    const bin=atob(b64);
    const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
    if(!('DecompressionStream' in window))throw new Error('이 브라우저는 최신 앱 압축 해제를 지원하지 않아요. Chrome을 업데이트해 주세요.');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const code=await new Response(stream).text();
    const s=document.createElement('script');
    s.textContent=code+'\n//# sourceURL=devlib-app-v2.7.1.js';
    document.body.appendChild(s);
    for(const [src,ver] of [['./v273-fixes-addon.js','2.7.3'],['./v274-integrity-addon.js','2.7.4']]){
      const addon=document.createElement('script');
      addon.src=`${src}?v=${ver}`;
      addon.async=false;
      document.body.appendChild(addon);
    }
  }catch(e){
    console.error(e);
    const status=document.querySelector('#status');
    if(status){status.className='status bad';status.textContent='최신 모바일 앱을 불러오지 못했어요: '+e.message;}
  }
})();
