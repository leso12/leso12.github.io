// 해석 결과 보관소: REDIS_URL(Render Key Value)이 있으면 그곳에, 없으면 프로세스 메모리에 둔다.
// Render 무료 서버는 15분간 요청이 없으면 잠들며 메모리가 지워지므로, 결과는 Key Value에 보관한다.
// 외부 패키지 없이 Redis 프로토콜(RESP)의 GET/SET/INCR/EXPIRE만 직접 구현한다.
import net from "node:net";
import tls from "node:tls";

function memoryStore(){
  const data=new Map();
  const live=k=>{const v=data.get(k);if(!v)return null;if(v.until<=Date.now()){data.delete(k);return null;}return v;};
  return {
    kind:"memory",
    async get(k){const v=live(k);return v?JSON.parse(v.value):null;},
    async set(k,obj,ttl){data.set(k,{value:JSON.stringify(obj),until:Date.now()+ttl*1000});if(data.size>2000)data.delete(data.keys().next().value);},
    async incr(k,ttl){const v=live(k);const n=(v?Number(v.value):0)+1;data.set(k,{value:String(n),until:v?v.until:Date.now()+ttl*1000});return n;},
    async del(k){data.delete(k);}
  };
}

const encode=args=>"*"+args.length+"\r\n"+args.map(a=>{const s=String(a);return "$"+Buffer.byteLength(s)+"\r\n"+s+"\r\n";}).join("");

/** RESP 응답 하나를 buf[pos]부터 읽는다. 아직 덜 왔으면 null. */
function parse(buf,pos){
  const end=buf.indexOf("\r\n",pos);
  if(end<0)return null;
  const type=String.fromCharCode(buf[pos]),line=buf.toString("utf8",pos+1,end);
  if(type==="+")return {value:line,next:end+2};
  if(type==="-")return {value:Object.assign(new Error(line),{redis:true}),next:end+2};
  if(type===":")return {value:Number(line),next:end+2};
  if(type==="$"){
    const len=Number(line);
    if(len<0)return {value:null,next:end+2};
    if(buf.length<end+2+len+2)return null;
    return {value:buf.toString("utf8",end+2,end+2+len),next:end+2+len+2};
  }
  if(type==="*"){
    const n=Number(line);let p=end+2;const out=[];
    for(let i=0;i<n;i++){const r=parse(buf,p);if(!r)return null;out.push(r.value);p=r.next;}
    return {value:out,next:p};
  }
  return {value:new Error("알 수 없는 응답"),next:buf.length};
}

function redisStore(url){
  const u=new URL(url);
  let sock=null,buf=Buffer.alloc(0),queue=[],connecting=null;
  const fail=e=>{for(const q of queue.splice(0)){clearTimeout(q.t);q.no(e);}const old=sock;sock=null;buf=Buffer.alloc(0);old?.destroy();};
  function connect(){
    if(sock)return Promise.resolve();
    if(connecting)return connecting;
    const attempt=new Promise((ok,no)=>{
      const opts={host:u.hostname,port:Number(u.port||6379),servername:u.hostname};
      const s=u.protocol==="rediss:"?tls.connect(opts):net.connect(opts);
      let settled=false;
      const done=(e)=>{if(settled)return;settled=true;clearTimeout(timer);if(connecting===attempt)connecting=null;e?no(e):ok();};
      const timer=setTimeout(()=>{s.destroy();done(new Error("저장소 연결 시간 초과"));},5000);
      s.once(u.protocol==="rediss:"?"secureConnect":"connect",async()=>{
        sock=s;
        s.unref();   // 쉬고 있는 저장소 연결 때문에 프로세스가 끝나지 못하는 일이 없게 (명령 대기 중엔 타이머가 붙잡아 둠)
        try{
          if(u.password)await send(u.username?["AUTH",decodeURIComponent(u.username),decodeURIComponent(u.password)]:["AUTH",decodeURIComponent(u.password)]);
          done();
        }catch(e){fail(e);done(e);}
      });
      s.on("data",chunk=>{
        if(sock!==s)return;
        buf=Buffer.concat([buf,chunk]);
        for(;;){
          const r=parse(buf,0);if(!r)break;
          buf=buf.subarray(r.next);
          const q=queue.shift();if(!q)continue;
          clearTimeout(q.t);r.value instanceof Error?q.no(r.value):q.ok(r.value);
        }
      });
      // 이 연결(s)에 대한 사건만 처리한다. 예전 연결의 close가 새 연결 시도를 망가뜨리지 않게.
      const lost=e=>{done(e);if(sock===s)fail(e);};
      s.on("error",lost);
      s.on("close",()=>lost(new Error("저장소 연결이 닫혔어요")));
    });
    connecting=attempt;
    return attempt;
  }
  function send(args){
    return new Promise((ok,no)=>{
      const q={ok,no,t:setTimeout(()=>fail(new Error("저장소 응답 시간 초과")),4000)};
      queue.push(q);sock.write(encode(args));
    });
  }
  const cmd=async args=>{await connect();return send(args);};
  return {
    kind:"redis",
    async get(k){const v=await cmd(["GET",k]);return v==null?null:JSON.parse(v);},
    async set(k,obj,ttl){await cmd(["SET",k,JSON.stringify(obj),"EX",Math.max(1,Math.floor(ttl))]);},
    async incr(k,ttl){const n=await cmd(["INCR",k]);if(n===1)await cmd(["EXPIRE",k,Math.max(1,Math.floor(ttl))]);return n;},
    async del(k){await cmd(["DEL",k]);}
  };
}

/** 저장소가 잠시 응답하지 않아도 해석은 계속되도록, 실패는 기록만 하고 메모리 값으로 버틴다. */
export function createStore(url=process.env.REDIS_URL){
  const mem=memoryStore();
  if(!url)return mem;
  let remote;
  try{remote=redisStore(url);}catch{console.error("[store] REDIS_URL 형식 오류 — 메모리만 사용");return mem;}
  const warn=e=>console.error("[store]",e?.message||e);
  return {
    kind:"redis",
    async get(k){try{const v=await remote.get(k);if(v!=null)return v;}catch(e){warn(e);}return mem.get(k);},
    async set(k,obj,ttl){await mem.set(k,obj,ttl);try{await remote.set(k,obj,ttl);}catch(e){warn(e);}},
    async incr(k,ttl){try{return await remote.incr(k,ttl);}catch(e){warn(e);return mem.incr(k,ttl);}},
    async del(k){await mem.del(k);try{await remote.del(k);}catch(e){warn(e);}}
  };
}
export const _test={parse,encode,memoryStore};
