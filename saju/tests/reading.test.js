import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {sanitize,handle,getReading,buildPrompt,parseReading,READING_SCHEMA} from '../lib/reading.js';

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
 assert.deepEqual(READING_SCHEMA.required,['intro','sections','outlook','questionAnswer','closing']);
 assert.equal(READING_SCHEMA.properties.sections.items.properties.body.type,'string');
 assert.equal(READING_SCHEMA.properties.questionAnswer.properties.answer.type,'string');
 assert.equal('actions' in READING_SCHEMA.properties,false);
});
test('preserves full long saju descriptions and empty optional question',()=>{
 const r=parseReading(JSON.stringify(fullReading));
 assert.equal(r.sections.length,8);
 assert.equal(r.sections[0].body,fullReading.sections[0].body);
 assert.equal(r.questionAnswer.answer,'');
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
