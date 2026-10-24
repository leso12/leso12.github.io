import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {sanitize,handle,parseReading,READING_SCHEMA} from '../lib/reading.js';

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

test('valid saju chart passes strict sanitization',()=>{
  const clean=sanitize(chart);
  assert.equal(clean.startAge,clean.dys[0].age);
  assert.equal(clean.dayGan,clean.pillars[1].gz[0]);
  assert.equal(Object.values(clean.wx).reduce((a,b)=>a+b,0),8);
});
test('rejects tampered data and invalid dates',()=>{
  assert.throws(()=>sanitize({...chart,dayGan:'甲'}),/일간/);
  assert.throws(()=>sanitize({...chart,input:{...chart.input,date:'1998-02-30'}}),/생년월일/);
  assert.throws(()=>sanitize({...chart,pillars:[chart.pillars[0],chart.pillars[1]]}),/명식/);
});
test('has an exact JSON output contract',()=>{
  assert.deepEqual(READING_SCHEMA.required,['A','B','summary']);
  const example=Object.fromEntries(['nature','talent','career','love','advice'].map(k=>[k,{t:'내용',g:'근거'}]));
  const result=parseReading(JSON.stringify({A:example,B:example,summary:{common:'합의',diff:'차이',actions:['1','2','3']}}));
  assert.equal(result.summary.actions.length,3);
});
test('API is not invoked when key is not provided',async()=>{
  const was=process.env.ANTHROPIC_API_KEY;delete process.env.ANTHROPIC_API_KEY;
  const out=await handle({chart},'unit-nokey');
  assert.equal(out.status,503);
  if(was)process.env.ANTHROPIC_API_KEY=was;
});
test('mocked Anthropic API receives server-only key and schema, and results renderable JSON',async()=>{
  const before=globalThis.fetch,old=process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY='sk-ant-api03-TEST_PRIVATE_KEY0123456789';
  const item={t:'근거 기반 해석',g:'일간과 월령'};
  const expert=Object.fromEntries(['nature','talent','career','love','advice'].map(k=>[k,item]));
  try {
    globalThis.fetch=async(url,init)=>{
      assert.equal(url,'https://api.anthropic.com/v1/messages');
      assert.equal(init.headers.authorization,'Bearer sk-ant-api03-TEST_PRIVATE_KEY0123456789');
      assert.ok(!JSON.stringify(init.body).includes('TEST_PRIVATE_KEY'));
      const payload=JSON.parse(init.body);
      assert.equal(payload.output_config.format.type,'json_schema');
      assert.equal(payload.model,process.env.CLAUDE_MODEL||'claude-sonnet-5-5');
      return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({A:expert,B:expert,summary:{common:'공통점',diff:'차이점',actions:['행동 1','행동 2','행동 3']}})}]})};
    };
    const out=await handle({chart,tight:false},'unit-mock');
    assert.equal(out.status,200);
    assert.equal(out.json.reading.B.career.t,'근거 기반 해석');
  }finally{globalThis.fetch=before;if(old)process.env.ANTHROPIC_API_KEY=old;else delete process.env.ANTHROPIC_API_KEY;}
});
