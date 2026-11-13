// Mobile Chromium smoke test for complete text and actual downloadable PNG/PDF.
// Run with: node saju/tests/browser.cjs (server at 127.0.0.1:3000)
const {chromium}=require("playwright");
const fs=require("node:fs/promises");
const assert=require("node:assert/strict");
const path=require("node:path");

async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,acceptDownloads:true});
  page.setDefaultTimeout(60000);
  const errs=[];
  page.on("pageerror",err=>errs.push(err.message));
  page.on("console",msg=>{if(msg.type()==="error")errs.push(msg.text().slice(0,300));});
  // 유료 요청 확인 창은 한 번만 뜨고, 수락해야 요청이 나간다
  let dialogs=0;
  page.on("dialog",d=>{dialogs++;assert.match(d.message(),/Opus/);d.accept();});
  assert.equal(await page.locator("#reading-mode").count(),0,"Sonnet/Opus model picker removed");
  await page.route("https://fonts.googleapis.com/**",route=>route.fulfill({status:200,contentType:"text/css",body:""}));
  await page.route("https://fonts.gstatic.com/**",route=>route.fulfill({status:200,body:""}));
  await page.goto("http://127.0.0.1:3000",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#region-sido").options.length>=17);
  await page.locator("#date").fill("2000-01-19");
  await page.locator("#time").fill("16:06");
  await page.locator("#region-sido").selectOption("경기도");
  await page.locator("#region").selectOption({label:"이천시"});
  await page.locator("#preview").click();
  assert.equal(await page.locator("#vp").isVisible(),true,"chart must be visible on webpage");

  const t="이 명식의 일간·월지·십성과 오행의 관계를 명리학 관점에서 자세히 설명합니다. ".repeat(16);
  const reading={
    intro:"원국의 계절과 일간을 중심으로 해설합니다. ".repeat(6),
    sections:Array.from({length:8},(_,i)=>({title:"명식 상세 분석 "+(i+1),easy:"명식의 기운이 어떤 성향으로 이어지는지 일상적인 말로 이해할 수 있어요.",body:t,
      basis:"실제 명식의 간지와 월령을 해설하는 전통적인 명리 근거입니다."})),
    focusSections:[
      {topic:"연애·인연",title:"연애운과 일지의 관계",easy:"관계를 보는 글자와 서로 어울리는 부분을 살펴요.",body:"배우자궁과 일간을 연결해 해석합니다. ".repeat(10),
        basis:"일간·일지·관성",timing:"현재 대운과 올해 세운의 작용",limits:"미래 사건을 확정할 수 없습니다."},
      {topic:"결혼·배우자",title:"배우자궁의 전통적 의미",easy:"결혼에 관한 전통적 해석을 쉬운 말로 풀어요.",body:"일간의 관계를 근거로 결혼의 전통적 의미를 풀이합니다. ".repeat(10),
        basis:"배우자궁",timing:"대운 해설",limits:"실제 결혼은 예언할 수 없습니다."}
    ],
    outlook:[{period:"현재 대운",easy:"오랜 기간의 흐름을 읽어요.",body:t,basis:"대운의 실제 글자"},{period:"올해 세운",easy:"올해의 흐름을 읽어요.",body:t,basis:"세운의 실제 글자"}],
    questionAnswer:{question:"",answer:""},
    closing:"사주명리의 해석은 정해진 운명이나 검증된 예측이 아닙니다.",
    stats:{model:"mock",inputTokens:200,outputTokens:2800}
  };
  // 서버가 작업 번호를 주고, 진행 중(202) 응답 뒤에 결과(200)를 주는 실제 흐름을 흉내 낸다
  const jobId="11111111-2222-3333-4444-555555555555";let polls=0,posts=0;
  await page.route(/\/api\/reading(\?.*)?$/,route=>{
    const req=route.request();
    if(req.method()==="POST"){posts++;assert.equal(JSON.parse(req.postData()).mode,undefined,"no model mode is sent");
      return route.fulfill({status:202,contentType:"application/json",body:JSON.stringify({jobId,state:"running",elapsedSeconds:0})});}
    assert.ok(req.url().includes("job="+jobId),"status check uses the job id");
    polls++;
    if(polls<2)return route.fulfill({status:202,contentType:"application/json",body:JSON.stringify({jobId,state:"running",elapsedSeconds:5})});
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({reading,jobId})});
  });
  await page.locator("#go").click();
  await page.waitForFunction(()=>/경과/.test(document.querySelector("#status").textContent),{timeout:20000});

  await page.waitForFunction(()=>document.querySelector("#deep-report .saju-section")?.textContent?.length>350);
  assert.equal(await page.locator("#deep-report .saju-section").count(),8,"eight detailed traditional saju chapters");
  assert.equal(posts,1,"one paid request");assert.ok(polls>=2,"result arrived through status checks");
  assert.equal(dialogs,1,"cost confirmation shown once");
  assert.match(await page.locator("#token-usage").textContent(),/Opus 5\.5/);
  assert.equal(await page.locator("#reader-easy").getAttribute("aria-pressed"),"true","simple view default");
  assert.equal(await page.locator(".saju-easy").count(),12,"plain explanations on all 8+2+2 sections");
  assert.equal(await page.locator(".saju-text-more[open]").count(),0,"simple view hides jargon-rich explanations");
  await page.locator("#reader-detail").click();
  assert.equal(await page.locator(".saju-text-more[open]").count(),12,"detail mode opens every full explanation with no new API request");
  await page.locator("#reader-easy").click();
  assert.equal(await page.locator(".saju-text-more[open]").count(),0,"return to easy mode");
  await page.locator("#glossary summary").click();
  assert.equal(await page.locator("#glossary").getAttribute("open"),"","glossary available without generating tokens");
  await page.locator("#glossary summary").click();
  assert.equal(await page.locator("#deep-report .saju-time").count(),2,"both luck cycles are visible");
  assert.equal(await page.locator("#deep-report .saju-focus").count(),2,"two deep requested topics displayed");
  assert.match(await page.locator("#deep-report .saju-focus").first().textContent(),/대운·세운과 시기별 의미/);
  assert.equal(await page.locator("#deep-report .saju-section .saju-prose").first().textContent(),t.trim(),"long saju content is intact");
  assert.equal(await page.locator("#deep-report .saju-intro").isVisible(),true,"overview is visible");
  assert.equal(await page.locator("#deep-report .deep-focus").count(),0,"unwanted life coaching is absent");
  assert.equal(await page.locator("#deep-report .saju-outro").count(),1,"closing is visible");
  assert.equal(await page.locator("#result-bar").isVisible(),true,"result tools are visible");
  assert.equal(await page.locator("#reader-tools").isVisible(),true,"report reading controls visible");
  assert.ok(await page.locator("#chapter-nav option").count()>8,"chapters populated");
  await page.locator("#font-larger").click();
  assert.equal(await page.locator("#sheet").getAttribute("data-reader-font"),"large");
  await page.locator("#font-normal").click();
  await page.locator("#chapter-nav").selectOption("saju-section-1");
  assert.equal(await page.locator("#chapter-nav").inputValue(),"saju-section-1");
  assert.equal(await page.locator("#file-ready").isVisible(),false,"no auto-download");
  assert.equal(await page.evaluate(()=>document.querySelector(".sheet").scrollHeight<=document.querySelector(".sheet").clientHeight+5),true,"content must not be cropped");
  await page.locator("#save-image").click();
  await page.waitForFunction(()=>document.querySelector("#file-download")?.download?.endsWith(".png"),{timeout:90000});
  const pngDl=page.waitForEvent("download");
  await page.locator("#file-download").click();
  const png=await pngDl;
  const pngPath=await png.path();
  const pngData=await fs.readFile(pngPath);
  assert.equal(pngData.subarray(0,8).toString("hex"),"89504e470d0a1a0a","actual PNG signature");
  assert.ok(pngData.length>10000,"actual PNG is nonempty");
  // 여러 장 이미지: 모두 선명한 폭(800px 이상)이고, 휴대폰 캔버스 한도 안이며, 미리보기가 보인다
  const pages=await page.evaluate(async()=>Promise.all([...document.querySelectorAll("#file-list a")].map(async a=>{
    const bm=await createImageBitmap(await (await fetch(a.href)).blob());return [bm.width,bm.height];})));
  assert.ok(pages.length>=1,"at least one image");
  for(const [w,h] of pages){assert.ok(w>=800,"sharp width "+w);assert.ok(h<=6000&&w*h<16e6,"within phone canvas limits");}
  assert.equal(await page.locator("#file-list img").count(),pages.length,"previews for long-press saving");
  assert.equal(await page.locator("#inapp-warn").isVisible(),false,"no in-app warning in a normal browser");
  console.log("MOBILE PNG SUCCESS",pngData.length);
  await page.locator("#print").click();
  await page.waitForFunction(()=>document.querySelector("#file-download")?.download?.endsWith(".pdf"),{timeout:90000});
  const pdfDl=page.waitForEvent("download");
  await page.locator("#file-download").click();
  const pdf=await pdfDl;
  const pdfData=await fs.readFile(await pdf.path());
  assert.equal(pdfData.subarray(0,4).toString("ascii"),"%PDF","actual PDF signature");
  assert.ok(pdfData.length>10000,"actual PDF is nonempty");
  console.log("MOBILE PDF SUCCESS",pdfData.length);

  // A separate error flow must not lose birth details or direct users to a fake credit balance.
  await page.unroute(/\/api\/reading(\?.*)?$/);
  await page.route("**/api/reading",route=>route.fulfill({
    status:402,contentType:"application/json",
    body:JSON.stringify({error:"AI 크레딧을 확인해 주세요.",code:"BILLING_REQUIRED",retryAfterSeconds:90})
  }));
  await page.locator("#worry").fill("이직운과 결혼운");
  await page.locator("#go").click();
  await page.waitForFunction(()=>!document.querySelector("#ai-problem").hidden);
  assert.equal(await page.locator("#ai-problem").getAttribute("data-code"),"BILLING_REQUIRED");
  assert.equal(await page.locator("#ai-billing-link").isVisible(),true,"billing only link");
  assert.equal(await page.locator("#worry").inputValue(),"이직운과 결혼운","interest remains after failure");
  assert.equal(await page.locator("#date").inputValue(),"2000-01-19","birthdate preserved");
  assert.equal(await page.locator("#time").inputValue(),"16:06","time preserved");
  await page.locator("#worry").fill("결혼운만");
  assert.equal(await page.locator("#ai-problem").isVisible(),false,"old error clears after editing");

  // Explicit opt-in only: data restored after reload and deleted on request.
  assert.equal(await page.locator("#remember-input").isChecked(),false,"temporary storage must be opt-in");
  await page.locator("#remember-input").check();
  await page.locator("#worry").fill("연애운 심층 해석");
  assert.equal(await page.evaluate(()=>!!sessionStorage.getItem("saju-tab-form-v1")),true);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#remember-input")?.checked===true,{timeout:20000});
  assert.equal(await page.locator("#date").inputValue(),"2000-01-19","opt-in saved date restored");
  assert.equal(await page.locator("#time").inputValue(),"16:06","opt-in saved time restored");
  assert.equal(await page.locator("#worry").inputValue(),"연애운 심층 해석");
  assert.equal((await page.locator("#region option:checked").textContent()).trim(),"이천시","chosen district restored");
  await page.locator("#clear-input-memory").click();
  assert.equal(await page.evaluate(()=>sessionStorage.getItem("saju-tab-form-v1")),null);
  assert.equal(await page.locator("#remember-input").isChecked(),false);
  // Browser console prints HTTP 402 as an error even though our test
  // intentionally simulated exactly that billing response and handled it.
  // 카카오톡 앱 안에서 열면 외부 브라우저로 여는 버튼과 안내가 보인다
  const kakao=await browser.newPage({viewport:{width:390,height:844},isMobile:true,
    userAgent:"Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 KAKAOTALK 10.8.0"});
  await kakao.goto("http://127.0.0.1:3000",{waitUntil:"domcontentloaded"});
  assert.match(await kakao.getAttribute("#inapp-open","href"),/^kakaotalk:\/\/web\/openExternal\?url=/);
  assert.equal(await kakao.locator("#inapp-warn").evaluate(e=>e.hidden),false,"in-app notice enabled");
  await kakao.close();
  const unexpected=errs.filter(msg=>!msg.includes("status of 402 (Payment Required)"));
  assert.equal(unexpected.length,0,JSON.stringify(unexpected));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
