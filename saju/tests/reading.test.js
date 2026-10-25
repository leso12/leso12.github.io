import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {sanitize,handle,getReading,buildPrompt,detectInterestTopics,parseReading,READING_SCHEMA,classifyAnthropicError,clearReadingsForTests} from '../lib/reading.js';

function exampleChart(){
  const raw=readFileSync(new URL('../public/vendor/lunar.js',import.meta.url),'utf8');
  const sandbox={module:{exports:{}},console};vm.runInNewContext(raw,sandbox,{timeout:3000});
  const {Solar}=sandbox.module.exports;
  const s=Solar.fromYmdHms(1998,3,14,7,30,0);
  const e=s.getLunar().getEightChar();e.setSect(2);
  const P=[['시','Time'],['일','Day'],['월','Month'],['연','Year']].map(([pos,key])=>({pos,gz:e['get'+key](),ssGan:'비견',ssZhi:'비견',hide:[]}));
  const mapGan='木木火火土土金金水水',mapZhi='水土木木火火火土金金土水',GAN='甲乙丙丁戊己庚辛壬癸',ZHI='子丑寅卯辰巳午未申酉戌亥';
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
const section={title:'원국 구조',body:'丙子 일간과 丁丑 월주의 결합을 전통 명리학 관점에서 해설합니다. '.repeat(12),
 basis:'일간과 월령: 원국의 실제 기둥을 확인합니다.'};
const fullReading={
 intro:'이 명식의 특성과 계절감을 자세히 해설합니다.',
 sections:Array.from({length:8},(_,i)=>({...section,title:'명식 주제 '+(i+1)})),
 focusSections:[],
 outlook:[{period:'현재 대운',body:'주어진 대운을 근거로 시기를 해설합니다.',basis:'대운'},
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
 assert.equal(READING_SCHEMA.properties.questionAnswer.properties.answer.type,'string');
 assert.equal('actions' in READING_SCHEMA.properties,false);
});
test('preserves full long saju descriptions and empty optional question',()=>{
 const r=parseReading(JSON.stringify(fullReading));
 assert.equal(r.sections.length,8);
 assert.equal(r.sections[0].body,fullReading.sections[0].body.trim());
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
 assert.ok(prompt.includes('sections 8~9개'));
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
 const focus={topic:'결혼·배우자',title:'일지와 관성의 관계',
  body:'정관과 배우자궁이 만나는 전통적 해석입니다. '.repeat(20),
  basis:'일간과 일지, 관성 십성',timing:'현재 대운과 세운의 관계',
  limits:'배우자 만남이나 결혼 시기를 확정하지 않습니다.'};
 const report={...fullReading,focusSections:[focus]};
 const result=parseReading(JSON.stringify(report));
 assert.equal(result.focusSections.length,1);
 assert.equal(result.focusSections[0].body,focus.body.trim());
 assert.equal(result.focusSections[0].timing,focus.timing);
 assert.equal(result.sections.length,8);
});

test('API is not invoked when key is not set',async()=>{
 const old=process.env.ANTHROPIC_API_KEY;
 delete process.env.ANTHROPIC_API_KEY;
 try{const r=await handle({chart},'test-key-absent');assert.equal(r.status,503);}
 finally{if(old)process.env.ANTHROPIC_API_KEY=old;else delete process.env.ANTHROPIC_API_KEY;}
});
test('standard model sends structured saju request without exposing key in body',async()=>{
 const old=process.env.ANTHROPIC_API_KEY,prev=globalThis.fetch;
 process.env.ANTHROPIC_API_KEY=fakeKey;let count=0;
 try{
   globalThis.fetch=async(url,init)=>{
    count++;assert.equal(url,'https://api.anthropic.com/v1/messages');
    assert.equal(init.headers.authorization,'Bearer '+fakeKey);
    assert.equal(JSON.stringify(init.body).includes(fakeKey),false);
    const body=JSON.parse(init.body);
    assert.equal(body.model,process.env.CLAUDE_MODEL||'claude-sonnet-5-5');
    assert.equal(body.output_config.format.type,'json_schema');
    assert.ok(body.messages[0].content.includes('원국'));
    return {ok:true,json:async()=>({stop_reason:'end_turn',usage:{input_tokens:300,output_tokens:850},
      content:[{type:'text',text:JSON.stringify(fullReading)}]})};
   };
   const r=await handle({chart},'standard-mock-test');
   assert.equal(r.status,200);assert.equal(r.json.reading.sections.length,8);
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
   assert.equal(body.max_tokens,18000);
   return {ok:true,json:async()=>({stop_reason:'max_tokens',usage:{input_tokens:400,output_tokens:18000},
     content:[{type:'text',text:JSON.stringify(fullReading)}]})};
  };
  const r=await getReading(chart,false,'deep');
  assert.equal(r.sections.length,8);assert.equal(count,1);
 }finally{globalThis.fetch=prev;if(old)process.env.ANTHROPIC_API_KEY=old;else delete process.env.ANTHROPIC_API_KEY;}
});
test('incomplete Opus does not silently retry a paid call',async()=>{
 const old=process.env.ANTHROPIC_API_KEY,prev=globalThis.fetch;
 process.env.ANTHROPIC_API_KEY=fakeKey;let count=0;
 try{
  globalThis.fetch=async()=>{count++;return {ok:true,json:async()=>({
   stop_reason:'max_tokens',usage:{output_tokens:18000},content:[{type:'text',text:'{"intro":"incomplete"}'}]})};};
  await assert.rejects(()=>getReading(chart,false,'deep'),/추가 유료 요청/);
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
