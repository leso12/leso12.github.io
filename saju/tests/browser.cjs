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
  const t="누구나 일이 많아지면 마음이 조급해질 수 있어요. 차분하게 우선순위를 정하고 중요한 일부터 살펴보세요. 지금 당장 큰 결정을 내리기보다는 선택지를 비교하면 도움이 됩니다. ".repeat(4);
  const expert={};
  for(const key of ["nature","talent","career","love","advice"]){
    expert[key]={t,g:"스스로 표현하는 기운: 자기 의견을 정리하고 말로 전달하는 모습을 뜻합니다."};
  }
  const discover={title:"알아두면 중요한 선택의 균형",point:"먼저 사실을 확인하세요.",
  detail:t,evidence:"명식의 요소가 관련됩니다.",alternative:"다른 해석도 가능합니다.",
  question:"어떤 선택을 먼저 확인하면 좋을까요?"};
  const reading={
    A:expert,B:expert,
    discoveries:[discover,{...discover,title:"혼자 책임지지 않아도 되는 때"},{...discover,title:"현실적 판단이 필요한 순간"},{...discover,title:"잘할 수 있는 일을 고르는 기준"}],
    focus:{question:"이직을 고민하고 있어요.",answer:"조건을 비교한 뒤 결정해 보세요.",explanation:t,
      conditions:["근로계약 조건이 더 나아질 때","현 직장의 업무 환경이 바뀔 때"],
      steps:["현재 조건 정리","비교표 작성","제안 확인"]},
    periods:[{label:"2026년",theme:t,reality:"현실 조건 확인"},{label:"2027년",theme:t,reality:"성과 확인"},{label:"2028년",theme:t,reality:"가치 확인"}],
    summary:{common:t,diff:t,actions:["기록을 정리해 보세요.","우선순위를 정해 보세요.","결정하기 전에 시간을 주세요."]},
    stats:{model:"mock",inputTokens:100,outputTokens:400}
  };
  await page.route("**/api/reading",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({reading})}));
  await page.locator("#go").click();
  await page.waitForFunction(()=>document.querySelector("#experts .it .t")?.textContent?.length>350);
  const rendered=await page.locator("#experts .it .t").first().textContent();
  assert.equal(rendered,t,"full text, not a 200-character fragment");
  assert.equal(await page.locator("#deep-report").isVisible(),true,"dynamic chapters visible");
  assert.equal(await page.locator("#deep-report .insight-card").count(),4,"four selected insights");
  assert.equal(await page.locator("#deep-report .period-card").count(),3,"three periods");
  assert.equal(await page.locator("#deep-report .direct-answer").textContent(),"조건을 비교한 뒤 결정해 보세요.");
  assert.equal(await page.locator("#deep-report .insight-card").first().locator(".insight-detail").textContent(),t,"no dynamic insight truncation");
  assert.equal(await page.locator("#result-bar").isVisible(),true,"result tools should be visible");
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
  assert.equal(errs.length,0,JSON.stringify(errs));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
