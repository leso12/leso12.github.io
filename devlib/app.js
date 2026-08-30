(async()=>{
  try{
    document.title='개발 서재 · Mobile Hub v2.7.5';
    // Security bridge: legacy/mobile code may still build ?key= URLs.
    // Strip the key before the network request and send it in X-Devlib-Key instead,
    // so long-lived editor keys are no longer written into Edge Function request logs.
    const nativeFetch=window.fetch.bind(window);
    window.fetch=(input,init={})=>{
      try{
        const raw=input instanceof Request?input.url:String(input);
        const u=new URL(raw,location.href);
        if(u.hostname==='vulpttgewjfkxojimyxl.supabase.co'&&u.pathname.includes('/functions/v1/devlib-mobile')&&u.searchParams.has('key')){
          const key=u.searchParams.get('key')||'';
          u.searchParams.delete('key');
          const baseHeaders=new Headers(input instanceof Request?input.headers:(init.headers||{}));
          if(key&&!baseHeaders.has('X-Devlib-Key'))baseHeaders.set('X-Devlib-Key',key);
          if(input instanceof Request){
            const req=new Request(u.toString(),input);
            return nativeFetch(new Request(req,{headers:baseHeaders}),init);
          }
          return nativeFetch(u.toString(),{...init,headers:baseHeaders});
        }
      }catch{}
      return nativeFetch(input,init);
    };

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
    for(const [src,ver] of [['./v273-fixes-addon.js','2.7.3'],['./v274-integrity-addon.js','2.7.4'],['./v275-hierarchy-guide-addon.js','2.7.5']]){
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
