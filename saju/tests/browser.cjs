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
    sections:Array.from({length:8},(_,i)=>({title:"명식 상세 분석 "+(i+1),body:t,
      basis:"실제 명식의 간지와 월령을 해설하는 전통적인 명리 근거입니다."})),
    focusSections:[
      {topic:"연애·인연",title:"연애운과 일지의 관계",body:"배우자궁과 일간을 연결해 해석합니다. ".repeat(10),
        basis:"일간·일지·관성",timing:"현재 대운과 올해 세운의 작용",limits:"미래 사건을 확정할 수 없습니다."},
      {topic:"결혼·배우자",title:"배우자궁의 전통적 의미",body:"일간의 관계를 근거로 결혼의 전통적 의미를 풀이합니다. ".repeat(10),
        basis:"배우자궁",timing:"대운 해설",limits:"실제 결혼은 예언할 수 없습니다."}
    ],
    outlook:[{period:"현재 대운",body:t,basis:"대운의 실제 글자"},{period:"올해 세운",body:t,basis:"세운의 실제 글자"}],
    questionAnswer:{question:"",answer:""},
    closing:"사주명리의 해석은 정해진 운명이나 검증된 예측이 아닙니다.",
    stats:{model:"mock",inputTokens:200,outputTokens:2800}
  };
  await page.route("**/api/reading",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({reading})}));
  await page.locator("#go").click();

  await page.waitForFunction(()=>document.querySelector("#deep-report .saju-section")?.textContent?.length>350);
  assert.equal(await page.locator("#deep-report .saju-section").count(),8,"eight detailed traditional saju chapters");
  assert.equal(await page.locator("#deep-report .saju-time").count(),2,"both luck cycles are visible");
  assert.equal(await page.locator("#deep-report .saju-focus").count(),2,"two deep requested topics displayed");
  assert.match(await page.locator("#deep-report .saju-focus").first().textContent(),/대운·세운과 시기별 의미/);
  assert.equal(await page.locator("#deep-report .saju-section .saju-prose").first().textContent(),t,"long saju content is intact");
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
  assert.equal(await page.locator("#region").inputValue(),await page.locator("#region").inputValue());
  await page.locator("#clear-input-memory").click();
  assert.equal(await page.evaluate(()=>sessionStorage.getItem("saju-tab-form-v1")),null);
  assert.equal(await page.locator("#remember-input").isChecked(),false);
  // Browser console prints HTTP 402 as an error even though our test
  // intentionally simulated exactly that billing response and handled it.
  const unexpected=errs.filter(msg=>!msg.includes("status of 402 (Payment Required)"));
  assert.equal(unexpected.length,0,JSON.stringify(unexpected));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
