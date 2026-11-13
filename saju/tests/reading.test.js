import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {sanitize,handle,startReading,readingStatus,markRunningJobsLost,getReading,buildPrompt,detectInterestTopics,parseReading,READING_SCHEMA,classifyAnthropicError,clearReadingsForTests} from '../lib/reading.js';

function exampleChart(){
  const raw=readFileSync(new URL('../public/vendor/lunar.js',import.meta.url),'utf8');
  const sandbox={module:{exports:{}},console};vm.runInNewContext(raw,sandbox,{timeout:3000});
  const {Solar}=sandbox.module.exports;
  const s=Solar.fromYmdHms(1998,3,14,7,30,0);
  const e=s.getLunar().getEightChar();e.setSect(2);
  const P=[['시','Time'],['일','Day'],['월','Month'],['연','Year']].map(([pos,key])=>({pos,gz:e['get'+key](),ssGan:'비견',ssZhi:'비견',hide:[]}));
  const mapGan='木木火火土土金金水水',mapZhi='水土木木土火火土金金土水',GAN='甲乙丙丁戊己庚辛壬癸',ZHI='子丑寅卯辰巳午未申酉戌亥';
  const wx={木:0,火:0,土:0,金:0,水:0};
  P.forEach(p=>{wx[mapGan[GAN.indexOf(p.gz[0])]]++;wx[mapZhi[ZHI.indexOf(p.gz[1])]]++;});
  const ys=e.getYun(0).getDaYun().slice(1,9);
  const dys=ys.map(d=>({age:d.getStartAge(),year:d.getStartYear(),gz:d.getGanZhi()}));
  return {input:{date:'1998-03-14',cal:'양력',time:'07:30',sex:'여성',region:'서울',worry:'이직 고민'},
    pillars:P,wx,dayGan:e.getDay()[0],month:e.getMonth()[1],noTime:false,
    startAge:dys[0].age,dys,cur:dys.filter(d=>d.year<=2026).pop(),seun:Solar.fromYmd(2026,6,1).getLunar().getYearInGanZhiExact(),
    nowY:2026,age:29,rel:[],relLuck:[],solarStr:'1998.03.14 07:30',corrNote:''};
}
const chart=exampleChart();


const fakeKey=['sk','ant','unit-test','mock-only'].join('-');
const section={title:'원국 구조',easy:'불을 상징하는 기운이 드러나지만 태어난 계절 때문에 해석은 달라질 수 있어요.',body:'丙子 일간과 丁丑 월주의 결합을 전통 명리학 관점에서 해설합니다. '.repeat(12),
 basis:'일간과 월령: 원국의 실제 기둥을 확인합니다.'};
const fullReading={
 intro:'이 명식의 특성과 계절감을 자세히 해설합니다.',
 sections:Array.from({length:8},(_,i)=>({...section,title:'명식 주제 '+(i+1)})),
 focusSections:[],
 outlook:[{period:'현재 대운',easy:'10년 정도의 흐름을 살펴보는 해석이에요.',body:'주어진 대운을 근거로 시기를 해설합니다.',basis:'대운'},
          {period:'올해 세운',body:'주어진 연도를 근거로 해설합니다.',basis:'세운'}],
 questionAnswer:{question:'',answer:''},
 closing:'이러한 명식은 전통적인 해석과 실제 삶을 구분하여 이해해야 합니다.'
};
test('valid saju chart passes sanitization',()=>{
 const c=sanitize(chart);assert.equal(c.startAge,c.dys[0].age);
 assert.equal(c.dayGan,c.pillars[1].gz[0]);
 assert.equal(Object.values(c.wx).reduce((a,b)=>a+b,0),8);
});
test('invalid chart inputs rejected',()=>{
 assert.throws(()=>sanitize({...chart,dayGan:'甲'}),/일간/);
 assert.throws(()=>sanitize({...chart,input:{...chart.input,date:'1998-02-30'}}),/생년월일/);
});
test('new JSON schema describes a traditional reading, without actions or coaching',()=>{
 assert.deepEqual(READING_SCHEMA.required,['intro','sections','focusSections','outlook','questionAnswer','closing']);
 assert.equal(READING_SCHEMA.properties.sections.items.properties.body.type,'string');
 assert.ok(READING_SCHEMA.properties.sections.items.required.includes('easy'));
 assert.ok(READING_SCHEMA.properties.focusSections.items.required.includes('easy'));
 assert.ok(READING_SCHEMA.properties.outlook.items.required.includes('easy'));
 assert.equal(READING_SCHEMA.properties.questionAnswer.properties.answer.type,'string');
 assert.equal('actions' in READING_SCHEMA.properties,false);
});
test('preserves full long saju descriptions and empty optional question',()=>{
 const r=parseReading(JSON.stringify(fullReading));
 assert.equal(r.sections.length,8);
 assert.equal(r.sections[0].body,fullReading.sections[0].body.trim());
 assert.equal(r.sections[0].easy,section.easy);
 assert.equal(r.outlook[0].easy,'10년 정도의 흐름을 살펴보는 해석이에요.');
 assert.equal(r.questionAnswer.answer,'');
 assert.deepEqual(r.focusSections,[]);
 assert.equal(r.outlook.length,2);
});
test('rejects incomplete reports',()=>{
 assert.throws(()=>parseReading(JSON.stringify({...fullReading,sections:[section]})),/완성되지/);
});
test('general saju request does not ask for forced decision advice',()=>{
 const general={...chart,input:{...chart.input,worry:'전반적인 부분'}};
 const prompt=buildPrompt(sanitize(general),false,'deep');
 assert.ok(prompt.includes('questionAnswer의 두 값을 빈 문자열'));
 assert.ok(prompt.includes('자기계발'));
 assert.ok(prompt.includes('sections 10~11개'));
});

test('recognizes love, marriage, and job-move topics even without a question mark',()=>{
 assert.deepEqual(detectInterestTopics('연애 결혼 이직 등'),['연애·인연','결혼·배우자','이직·직업']);
 assert.deepEqual(detectInterestTopics('결혼운'),['결혼·배우자']);
 assert.deepEqual(detectInterestTopics('이직운과 직장 운이 궁금해'),['이직·직업']);
 assert.deepEqual(detectInterestTopics('전체적인 사주만 봐줘'),[]);
 assert.deepEqual(detectInterestTopics('연애·결혼·직업 등 전반적인 부분'),
   ['연애·인연','결혼·배우자','이직·직업']);
});
test('prompts detailed extra saju analysis for each requested topic, without coaching',()=>{
 const ask={...chart,input:{...chart.input,worry:'연애운, 결혼운, 이직운'}};
 const prompt=buildPrompt(sanitize(ask),false,'deep');
 assert.match(prompt,/관심 분야: 연애·인연, 결혼·배우자, 이직·직업/);
 assert.match(prompt,/focusSections를 반드시 작성하라/);
 assert.match(prompt,/기존의 사주 전반 풀이를 유지/);
 assert.match(prompt,/결혼 또는 이직 성패를 확정 예언하지 말 것/);
});
test('separate focus chapters preserve long explanations and chart-based timing',()=>{
 const focus={topic:'결혼·배우자',title:'일지와 관성의 관계',easy:'사주에서 관계를 뜻하는 자리를 먼저 읽어요.',
  body:'정관과 배우자궁이 만나는 전통적 해석입니다. '.repeat(20),
  basis:'일간과 일지, 관성 십성',timing:'현재 대운과 세운의 관계',
  limits:'배우자 만남이나 결혼 시기를 확정하지 않습니다.'};
 const report={...fullReading,focusSections:[focus]};
 const result=parseReading(JSON.stringify(report));
 assert.equal(result.focusSections.length,1);
 assert.equal(result.focusSections[0].body,focus.body.trim());
 assert.equal(result.focusSections[0].timing,focus.timing);
 assert.equal(result.focusSections[0].easy,focus.easy);
 assert.equal(result.sections.length,8);
});

test('new prompt asks for straightforward everyday Korean plus original detail',()=>{
 const prompt=buildPrompt(sanitize(chart),false);
 assert.match(prompt,/일반 성인/);
 assert.match(prompt,/쉽게 말하면|생활말/);
 assert.match(prompt,/basis/);
 assert.match(prompt,/depth|깊이|기존 깊이/);
});

// Anthropic 스트리밍(SSE) 응답 흉내: 텍스트를 여러 조각으로 나눠 보낸다.
function sse(text,{stop='end_turn',input=300,output=850,thinking=0,error=null,chunk=700}={}){
 const events=[{type:'message_start',message:{usage:{input_tokens:input,output_tokens:1}}},
  {type:'content_block_start',index:0,content_block:{type:'text',text:''}}];
 for(let i=0;i<text.length;i+=chunk)events.push({type:'content_block_delta',index:0,delta:{type:'text_delta',text:text.slice(i,i+chunk)}});
 if(error)events.push({type:'error',error});
 else events.push({type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:stop},
  usage:{output_tokens:output,output_tokens_details:{thinking_tokens:thinking}}},{type:'message_stop'});
 const raw=events.map(e=>`event: ${e.type}\r\ndata: ${JSON.stringify(e)}\r\n\r\n`).join('');
 const bytes=new TextEncoder().encode(raw);
 // 바이트 경계가 이벤트·한글 중간에서 잘려도 올바르게 읽는지 확인하려고 37바이트씩 보낸다
 const body=new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=37)c.enqueue(bytes.slice(i,i+37));c.close();}});
 return {ok:true,status:200,headers:{get:()=>null},body};
}

test('API is not invoked when key is not set',async()=>{
 const old=process.env.ANTHROPIC_API_KEY;
 delete process.env.ANTHROPIC_API_KEY;
 try{const r=await handle({chart},'test-key-absent');assert.equal(r.status,503);}
 finally{if(old)process.env.ANTHROPIC_API_KEY=old;else delete process.env.ANTHROPIC_API_KEY;}
});
test('Opus is the only model and the request streams without exposing the key',async()=>{
 clearReadingsForTests();
 const old=process.env.ANTHROPIC_API_KEY,prev=globalThis.fetch;
 process.env.ANTHROPIC_API_KEY=fakeKey;let count=0;
 try{
   globalThis.fetch=async(url,init)=>{
    count++;assert.equal(url,'https://api.anthropic.com/v1/messages');
    assert.equal(init.headers.authorization,'Bearer '+fakeKey);
    assert.equal(JSON.stringify(init.body).includes(fakeKey),false);
    const body=JSON.parse(init.body);
    assert.equal(body.model,process.env.CLAUDE_DEEP_MODEL||'claude-opus-5-5');
    assert.equal(body.stream,true);assert.equal(body.max_tokens,64000);
   assert.equal(body.output_config.effort,'low','less thinking for faster readings');
    assert.equal(body.output_config.format.type,'json_schema');
    assert.ok(body.messages[0].content.includes('원국'));
    return sse(JSON.stringify(fullReading),{thinking:120});
   };
   // 예전 화면이 mode:'standard'를 보내도 Opus로 처리된다
   const r=await handle({chart,mode:'standard'},'standard-mock-test');
   assert.equal(r.status,200);assert.equal(r.json.reading.sections.length,8);
   assert.equal(r.json.reading.stats.model,'claude-opus-5-5');
   assert.equal(r.json.reading.stats.inputTokens,300);assert.equal(r.json.reading.stats.outputTokens,850);
   assert.equal(r.json.reading.stats.thinkingTokens,120);
   assert.equal(count,1);
 }finally{globalThis.fetch=prev;if(old)process.env.ANTHROPIC_API_KEY=old;else delete process.env.ANTHROPIC_API_KEY;}
});
test('complete structured output at Opus budget boundary is not discarded',async()=>{
 const old=process.env.ANTHROPIC_API_KEY,prev=globalThis.fetch;
 process.env.ANTHROPIC_API_KEY=fakeKey;let count=0;
 try{
  globalThis.fetch=async(_url,init)=>{
   count++;const body=JSON.parse(init.body);
   assert.equal(body.model,process.env.CLAUDE_DEEP_MODEL||'claude-opus-5-5');
   assert.equal(body.max_tokens,64000);
   return sse(JSON.stringify(fullReading),{stop:'max_tokens',input:400,output:64000});
  };
  const r=await getReading(chart,false);
  assert.equal(r.sections.length,8);assert.equal(count,1);
 }finally{globalThis.fetch=prev;if(old)process.env.ANTHROPIC_API_KEY=old;else delete process.env.ANTHROPIC_API_KEY;}
});
test('incomplete Opus does not silently retry a paid call',async()=>{
 const old=process.env.ANTHROPIC_API_KEY,prev=globalThis.fetch;
 process.env.ANTHROPIC_API_KEY=fakeKey;let count=0;
 try{
  globalThis.fetch=async()=>{count++;return sse('{"intro":"incomplete"',{stop:'max_tokens',output:64000});};
  await assert.rejects(()=>getReading(chart,false),/추가 유료 요청/);
  assert.equal(count,1);
 }finally{globalThis.fetch=prev;if(old)process.env.ANTHROPIC_API_KEY=old;else delete process.env.ANTHROPIC_API_KEY;}
});


test('Anthropic credit and configured spending limits receive distinct actions',()=>{
 const credit=classifyAnthropicError(402,{error:{type:'billing_error',message:'Payment details required'}});
 assert.equal(credit.status,402);assert.equal(credit.code,'BILLING_REQUIRED');
 assert.match(credit.message,/결제/);
 const lowBalance=classifyAnthropicError(400,{error:{type:'invalid_request_error',message:'Your credit balance is too low to access the Anthropic API.'}});
 assert.equal(lowBalance.code,'BILLING_REQUIRED');
 const configured=classifyAnthropicError(400,{error:{type:'invalid_request_error',
  message:'You have reached your specified workspace API usage limits'}});
 assert.equal(configured.code,'SPEND_LIMIT');
 const tier=classifyAnthropicError(429,{error:{type:'rate_limit_error',
  details:{error_code:'enforced_spend_limit_reached'},message:'Monthly threshold'}});
 assert.equal(tier.code,'SPEND_LIMIT');
 const transient=classifyAnthropicError(429,{error:{type:'rate_limit_error',message:'Too many requests'}},'35');
 assert.equal(transient.code,'PROVIDER_RATE_LIMIT');assert.equal(transient.retryAfterSeconds,35);
 assert.equal(classifyAnthropicError(400,{error:{message:'invalid JSON'}}).code,'PROVIDER_REQUEST');
 assert.equal(classifyAnthropicError(401).code,'AUTH_CONFIG');
});
test('billing error blocks a new paid request temporarily without exposing provider data',async()=>{
 clearReadingsForTests();
 const oldKey=process.env.ANTHROPIC_API_KEY,oldFetch=globalThis.fetch;
 process.env.ANTHROPIC_API_KEY=fakeKey;let upstreamCalls=0;
 try{
  globalThis.fetch=async()=>{upstreamCalls++;return {ok:false,status:402,
   headers:{get:()=>null},json:async()=>({error:{type:'billing_error',
    message:'Your confidential organization information goes here'}})};};
  const result=await handle({chart},'billing-test');
  assert.equal(result.status,402);assert.equal(result.json.code,'BILLING_REQUIRED');
  assert.ok(result.json.retryAfterSeconds>0);
  assert.ok(!JSON.stringify(result.json).includes('confidential'));
  const secondChart={...chart,input:{...chart.input,worry:'연애운 심층'}};
  const second=await handle({chart:secondChart},'billing-test-2');
  assert.equal(second.json.code,'BILLING_REQUIRED');
  assert.equal(upstreamCalls,1,'do not repeat paid provider calls during billing hold');
 }finally{
  clearReadingsForTests();
  globalThis.fetch=oldFetch;
  if(oldKey)process.env.ANTHROPIC_API_KEY=oldKey;else delete process.env.ANTHROPIC_API_KEY;
 }
});

test('extended chart facts (12운성, 공망, 형파해, 향후 세운) reach the prompt',()=>{
 const rich={...chart,pillars:chart.pillars.map(p=>({...p,us:'제왕'})),rel:['일지·월지 인사형(무은지형)','연지·시지 자유파'],
  kong:'戌亥',kongHit:['연지'],seunNext:[{year:2027,gz:'丁未'},{year:2028,gz:'戊申'}],
  warnings:['절입 시각 1시간 이내에 태어나 출생 시간 오차에 따라 월주가 달라질 수 있어요.'],sect:1};
 const c=sanitize(rich);
 assert.equal(c.pillars[0].us,'제왕');assert.equal(c.kong,'戌亥');assert.equal(c.seunNext.length,2);
 assert.equal(c.sect,1);assert.equal(c.warnings.length,1);
 const prompt=buildPrompt(c,false);
 for(const k of ['무은지형','戌亥','丁未','12운성','boundaryWarnings','다음 대운','sections 10~11개'])assert.ok(prompt.includes(k),k);
 assert.equal(sanitize({...chart,kong:'XX'}).kong,'');
 assert.equal(sanitize({...chart,seunNext:[{year:2027,gz:'甲丑'}]}).seunNext.length,0);
});

test('job flow: start returns a job id, status reports progress then the result, duplicates join the same job',async()=>{
 clearReadingsForTests();
 const old=process.env.ANTHROPIC_API_KEY,prev=globalThis.fetch;
 process.env.ANTHROPIC_API_KEY=fakeKey;let count=0,release;
 const gate=new Promise(ok=>release=ok);
 try{
  globalThis.fetch=async()=>{count++;await gate;return sse(JSON.stringify(fullReading));};
  const a=await startReading({chart,form:{date:'2000-01-19',notime:false,'region-sido':'경기도',evil:{x:1}}},'job-a');
  assert.deepEqual(a.json.form,{date:'2000-01-19',notime:false,'region-sido':'경기도'},'form kept for resume, unknown keys dropped');
  assert.equal(a.status,202);assert.match(a.json.jobId,/^[0-9a-f-]{36}$/);
  const dup=await startReading({chart},'job-b');
  assert.equal(dup.json.jobId,a.json.jobId,'same chart joins the running job (no double charge)');
  assert.equal((await readingStatus(a.json.jobId)).status,202);
  release();
  for(let i=0;i<50&&(await readingStatus(a.json.jobId)).status===202;i++)await new Promise(r=>setTimeout(r,10));
  const done=await readingStatus(a.json.jobId);
  assert.equal(done.json.form.date,'2000-01-19','resume gets the form back');
  assert.equal(done.status,200);assert.equal(done.json.reading.sections.length,8);
  const again=await startReading({chart},'job-c');
  assert.equal(again.status,200);assert.equal(again.json.cached,true);
  assert.equal(count,1);
  assert.equal((await readingStatus('not-a-job')).json.code,'JOB_NOT_FOUND');
  assert.equal((await readingStatus('00000000-0000-0000-0000-000000000000')).status,404);
 }finally{clearReadingsForTests();globalThis.fetch=prev;if(old)process.env.ANTHROPIC_API_KEY=old;else delete process.env.ANTHROPIC_API_KEY;}
});

test('mid-stream overload becomes a friendly busy error without leaking provider text',async()=>{
 clearReadingsForTests();
 const old=process.env.ANTHROPIC_API_KEY,prev=globalThis.fetch;
 process.env.ANTHROPIC_API_KEY=fakeKey;
 try{
  globalThis.fetch=async()=>sse('{"intro":"부분',{error:{type:'overloaded_error',message:'secret upstream detail'}});
  const r=await handle({chart},'overload-test');
  assert.equal(r.status,503);assert.equal(r.json.code,'PROVIDER_BUSY');
  assert.ok(!JSON.stringify(r.json).includes('secret'));
 }finally{clearReadingsForTests();globalThis.fetch=prev;if(old)process.env.ANTHROPIC_API_KEY=old;else delete process.env.ANTHROPIC_API_KEY;}
});

test('a dropped connection mid-stream is reported, not retried',async()=>{
 clearReadingsForTests();
 const old=process.env.ANTHROPIC_API_KEY,prev=globalThis.fetch;
 process.env.ANTHROPIC_API_KEY=fakeKey;let count=0;
 try{
  globalThis.fetch=async()=>{count++;return {ok:true,status:200,headers:{get:()=>null},body:new ReadableStream({
   start(c){c.enqueue(new TextEncoder().encode('event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n\n'));c.error(new TypeError('terminated'));}})};};
  const r=await handle({chart},'drop-test');
  assert.equal(r.json.code,'PROVIDER_DISCONNECT');assert.equal(count,1);
 }finally{clearReadingsForTests();globalThis.fetch=prev;if(old)process.env.ANTHROPIC_API_KEY=old;else delete process.env.ANTHROPIC_API_KEY;}
});

test('no usage limits: many readings in a row are all served',async()=>{
 clearReadingsForTests();
 const old=process.env.ANTHROPIC_API_KEY,prev=globalThis.fetch;
 process.env.ANTHROPIC_API_KEY=fakeKey;
 try{
  globalThis.fetch=async()=>sse(JSON.stringify(fullReading));
  const codes=[];
  for(const w of ['연애','직업','재물','건강','학업','가족','이사','인연','시험','여행','이직','결혼'])
   codes.push((await handle({chart:{...chart,input:{...chart.input,worry:w}}},'same-ip')).json.code||'OK');
  assert.deepEqual([...new Set(codes)],['OK']);
 }finally{clearReadingsForTests();globalThis.fetch=prev;if(old)process.env.ANTHROPIC_API_KEY=old;else delete process.env.ANTHROPIC_API_KEY;}
});

test('paragraph breaks in long text survive sanitizing (no more wall of text)',()=>{
 const body='첫 문단입니다.\r\n\r\n\r\n둘째 문단입니다.\u0007끝';
 const r=parseReading(JSON.stringify({...fullReading,intro:'들어가며\n\n둘째',closing:'정리\n\n끝',
  sections:fullReading.sections.map(s=>({...s,body}))}));
 assert.equal(r.sections[0].body,'첫 문단입니다.\n\n둘째 문단입니다. 끝');
 assert.equal(r.intro,'들어가며\n\n둘째');assert.equal(r.closing,'정리\n\n끝');
 assert.equal(r.sections[0].title.includes('\n'),false);
});

test('prompt asks for paragraphs and per-field plain explanations of jargon',()=>{
 const prompt=buildPrompt(sanitize(chart),false);
 assert.ok(prompt.includes('(\\n\\n)'),'asks for blank-line paragraphs');
 for(const k of ['재생관','살인상생','각 필드','closing(마무리)'])assert.ok(prompt.includes(k),k);
});

import net from 'node:net';
import {createStore,_test as storeTest} from '../lib/store.js';
test('Redis protocol parser handles split, Korean and null replies',()=>{
 const {parse,encode}=storeTest;
 assert.equal(encode(['SET','k','한글']),'*3\r\n$3\r\nSET\r\n$1\r\nk\r\n$6\r\n한글\r\n');
 const full=Buffer.from('$6\r\n한글\r\n');
 assert.equal(parse(full.subarray(0,7),0),null,'incomplete reply waits');
 assert.equal(parse(full,0).value,'한글');
 assert.equal(parse(Buffer.from('$-1\r\n'),0).value,null);
 assert.equal(parse(Buffer.from(':7\r\n'),0).value,7);
 assert.ok(parse(Buffer.from('-ERR x\r\n'),0).value instanceof Error);
});
test('stored results survive in a Redis-compatible store (fake server)',async()=>{
 const db=new Map();let auth=null;
 const socks=new Set();
 const server=net.createServer(sock=>{
  socks.add(sock);
  let buf=Buffer.alloc(0);
  sock.on('data',d=>{buf=Buffer.concat([buf,d]);
   for(;;){const r=storeTest.parse(buf,0);if(!r)break;buf=buf.subarray(r.next);const [c,...a]=r.value;
    const C=c.toUpperCase();
    if(C==='AUTH'){auth=a;sock.write('+OK\r\n');}
    else if(C==='SET'){db.set(a[0],a[1]);sock.write('+OK\r\n');}
    else if(C==='GET'){const v=db.get(a[0]);sock.write(v==null?'$-1\r\n':'$'+Buffer.byteLength(v)+'\r\n'+v+'\r\n');}
    else if(C==='INCR'){const n=Number(db.get(a[0])||0)+1;db.set(a[0],String(n));sock.write(':'+n+'\r\n');}
    else if(C==='EXPIRE'||C==='DEL'){sock.write(':1\r\n');}
   }});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const st=createStore(`redis://user:p%40ss@127.0.0.1:${server.address().port}`);
  const big={reading:'가'.repeat(30000),n:1};
  await st.set('job:x',big,60);
  assert.deepEqual(await st.get('job:x'),big);
  assert.equal(await st.get('nope'),null);
  assert.equal(await st.incr('daily',60),1);assert.equal(await st.incr('daily',60),2);
  assert.deepEqual(auth,['user','p@ss']);
 }finally{for(const k of socks)k.destroy();server.close();}
});
test('store keeps working from memory when Redis is unreachable',async()=>{
 const st=createStore('redis://127.0.0.1:1');
 await st.set('k',{a:1},60);
 assert.deepEqual(await st.get('k'),{a:1});
 assert.equal(await st.incr('c',60),1);
});

test('a reading cut off by a server restart is reported quickly and can be retried',async()=>{
 clearReadingsForTests();
 const old=process.env.ANTHROPIC_API_KEY,prev=globalThis.fetch;
 process.env.ANTHROPIC_API_KEY=fakeKey;let calls=0;
 try{
  // 서버가 내려가기 직전: 진행 중 작업이 '중단됨'으로 기록된다
  let hang;globalThis.fetch=async()=>{calls++;await new Promise(r=>hang=r);return sse(JSON.stringify(fullReading));};
  const a=await startReading({chart,form:{date:'2000-01-19'}},'restart-a');
  assert.equal(a.status,202);
  assert.equal(await markRunningJobsLost(),1);
  const lost=await readingStatus(a.json.jobId);
  assert.equal(lost.status,503);assert.equal(lost.json.code,'JOB_LOST');
  assert.equal(lost.json.form.date,'2000-01-19','reopened page can still show the inputs and the message');
  // 다시 요청하면 새로 만들고, 하루 횟수는 늘지 않는다 (상한 2회: 다른 요청 1번 + 재요청 → 그래도 한 번 더 가능)
  globalThis.fetch=async()=>{calls++;return sse(JSON.stringify(fullReading));};
  const retry=await handle({chart},'restart-b');
  assert.equal(retry.status,200,'retry after loss works');
  const other=await handle({chart:{...chart,input:{...chart.input,worry:'재물'}}},'restart-c');
  assert.equal(other.status,200,'the lost reading did not use up the daily quota');
  hang?.();
 }finally{clearReadingsForTests();globalThis.fetch=prev;if(old)process.env.ANTHROPIC_API_KEY=old;else delete process.env.ANTHROPIC_API_KEY;}
});
