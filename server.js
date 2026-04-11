const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const app = express();
app.use(express.json());
app.use(express.text());
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const client = new Anthropic();
var USER = process.env.USER_NAME || "Rahul";

var SYS = "You are Ronny, " + USER + "'s personal AI and FP&A copilot. Sharp, warm, efficient.\n\nRespond ONLY with valid JSON (no markdown, no extra text):\n{\"intent\":\"QUESTION|FOOD|CAB|SHOPPING|WHATSAPP|CALENDAR|LIGHTS|CHAT\",\"confidence\":0.9,\"actions\":[],\"reply\":\"spoken answer\",\"deepLink\":null}\n\nCapabilities:\n- QUESTION: knowledge, calculations, market data, finance scenarios. Substantive 2-4 sentence answers.\n- FOOD: {\"type\":\"food_order\",\"params\":{\"search\":\"coffee\"}}\n- CAB: {\"type\":\"cab_book\",\"params\":{\"service\":\"uber\",\"destination\":\"...\"}}\n- SHOPPING: {\"type\":\"shopping_search\",\"params\":{\"app\":\"amazon\",\"query\":\"...\"}}\n- WHATSAPP: {\"type\":\"whatsapp_message\",\"params\":{\"contact\":\"\",\"message\":\"\"}}\n\nContext: " + USER + " works at Zomato (Eternal), senior finance, Gurgaon. Knows NOV, NAOV, CM1, CM2, BTPO, LCPO, EBITDA. Prefers Uber, Zomato, Amazon, Blinkit.";

async function parseIntent(text) {
  var msg = await client.messages.create({
    model: "claude-sonnet-4-20250514", max_tokens: 2048, system: SYS,
    messages: [{role:"user",content:USER+" says: \""+text+"\""}]
  });
  var t = msg.content.filter(function(b){return b.type==="text"}).map(function(b){return b.text}).join("");
  try {
    var p = JSON.parse(t.replace(/```json\n?|```/g,"").trim());
    var r = {intent:p.intent||"CHAT",actions:p.actions||[],reply:p.reply||"Done.",deepLink:p.deepLink||null};
    if (r.intent==="QUESTION" && /price|stock|nifty|sensex|crude|oil|gold|bitcoin|dollar|rupee|weather/i.test(text)) {
      try {
        var sm = await client.messages.create({
          model:"claude-sonnet-4-20250514",max_tokens:1024,
          system:"Answer concisely in 2-3 sentences with current data. Plain text only.",
          tools:[{type:"web_search_20250305",name:"web_search"}],
          messages:[{role:"user",content:text}]
        });
        var sr = sm.content.filter(function(b){return b.type==="text"}).map(function(b){return b.text}).join(" ").trim();
        if(sr) r.reply = sr.slice(0,500);
      } catch(e){}
    }
    return r;
  } catch(e) {
    return {intent:"CHAT",actions:[],reply:t.slice(0,300)||"Try again?",deepLink:null};
  }
}

async function runActions(actions) {
  var results = [];
  for (var i=0;i<actions.length;i++) {
    var a = actions[i];
    if (a.type==="food_order") {
      var q = (a.params&&(a.params.search||a.params.restaurant))||"";
      results.push({type:a.type,deepLink:q?"https://www.zomato.com/gurgaon/search?q="+encodeURIComponent(q):"https://www.zomato.com/gurgaon"});
    } else if (a.type==="cab_book") {
      var d = encodeURIComponent((a.params&&a.params.destination)||"");
      results.push({type:a.type,deepLink:d?"https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]="+d:"https://m.uber.com/ul/"});
    } else if (a.type==="shopping_search") {
      var sq2 = (a.params&&a.params.query)||"";
      results.push({type:a.type,deepLink:sq2?"https://www.amazon.in/s?k="+encodeURIComponent(sq2):"https://www.amazon.in"});
    } else if (a.type==="whatsapp_message") {
      var wm = (a.params&&a.params.message)||"";
      results.push({type:a.type,deepLink:wm?"https://wa.me/?text="+encodeURIComponent(wm):"https://wa.me/"});
    } else {
      results.push({type:a.type,status:"ok"});
    }
  }
  return results;
}

app.post("/ronny", async function(req, res) {
  try {
    var text = typeof req.body==="string"?req.body:(req.body.text||req.body.message);
    if (!text||!text.trim()) return res.json({reply:"I didn't catch that."});
    console.log("  \""+text.slice(0,80)+"\"");
    var p = await parseIntent(text);
    var r = await runActions(p.actions);
    var dl = p.deepLink;
    for (var i=0;i<r.length;i++){if(r[i].deepLink){dl=r[i].deepLink;break;}}
    res.json({reply:p.reply,intent:p.intent,deepLink:dl,actions:r});
  } catch(e) {
    console.error("ERR:",e.message);
    res.json({reply:"Something went wrong.",error:e.message});
  }
});

app.get("/ronny/ask", async function(req, res) {
  var q = req.query.text||req.query.q||"";
  if (!q.trim()) return res.json({reply:"Send ?text=your+command"});
  try {
    var p = await parseIntent(q);
    var r = await runActions(p.actions);
    var dl = p.deepLink;
    for(var i=0;i<r.length;i++){if(r[i].deepLink){dl=r[i].deepLink;break;}}
    res.json({reply:p.reply,intent:p.intent,deepLink:dl});
  } catch(e) { res.json({reply:"Error",error:e.message}); }
});

app.get("/", function(req, res) { res.json({status:"Ronny is awake",version:"4.2.0"}); });
app.get("/manifest.json", function(req, res) {
  res.json({name:"Ronny",short_name:"Ronny",start_url:"/app",display:"standalone",background_color:"#09090B",theme_color:"#09090B",orientation:"portrait",icons:[{src:"/icon.svg",sizes:"any",type:"image/svg+xml",purpose:"any"}]});
});
app.get("/icon.svg", function(req, res) {
  res.setHeader("Content-Type","image/svg+xml");
  res.send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#A855F7"/><text x="50" y="66" text-anchor="middle" font-size="48" font-weight="bold" fill="white" font-family="sans-serif">R</text></svg>');
});

app.get("/app", function(req, res) {
  res.setHeader("Content-Type", "text/html");
  res.send(APP_HTML);
});

var APP_HTML = '<!DOCTYPE html>\
<html lang="en"><head>\
<meta charset="UTF-8">\
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no,viewport-fit=cover">\
<meta name="theme-color" content="#09090B">\
<meta name="apple-mobile-web-app-capable" content="yes">\
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\
<meta name="apple-mobile-web-app-title" content="Ronny">\
<meta name="mobile-web-app-capable" content="yes">\
<link rel="manifest" href="/manifest.json">\
<link rel="apple-touch-icon" href="/icon.svg">\
<title>Ronny</title>\
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">\
<style>\
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}\
html,body{height:100%;overflow:hidden}\
body{font-family:DM Sans,sans-serif;background:#09090B;color:#E4E4E7;display:flex;flex-direction:column}\
.hd{padding:14px 16px 10px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.06)}\
.hd h1{font-size:20px;font-weight:700;background:linear-gradient(135deg,#F8FAFC,#A855F7);-webkit-background-clip:text;-webkit-text-fill-color:transparent}\
.cnt{flex:1;overflow:hidden;display:flex;flex-direction:column}\
.pn{flex:1;overflow-y:auto;display:none;flex-direction:column}\
.pn.on{display:flex}\
.tabs{display:flex;border-top:1px solid rgba(255,255,255,.06);padding-bottom:env(safe-area-inset-bottom,6px)}\
.tabs button{flex:1;padding:8px 0 4px;text-align:center;cursor:pointer;font:600 10px DM Sans,sans-serif;border:none;background:transparent;color:#52525B;border-top:2px solid transparent}\
.tabs button.on{color:#A855F7;border-top-color:#A855F7}\
.tabs button i{display:block;font-size:16px;font-style:normal;margin-bottom:1px}\
.ch{flex:1;overflow-y:auto;padding:12px}\
.mg{max-width:85%;padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.5;margin-bottom:8px}\
.mg.u{margin-left:auto;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.2);border-radius:14px 14px 4px 14px}\
.mg.r{background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.15);border-radius:14px 14px 14px 4px}\
.mg .lb{font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px}\
.mg.u .lb{color:#3B82F6}\
.mg.r .lb{color:#A855F7}\
.mg .lk{display:inline-block;margin-top:6px;padding:4px 10px;border-radius:6px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);color:#22C55E;font-size:11px;font-weight:600;text-decoration:none}\
.bar{padding:10px 14px;border-top:1px solid rgba(255,255,255,.06)}\
.bar .mr{display:flex;justify-content:center;margin-bottom:6px}\
.bar .mc{width:52px;height:52px;border-radius:50%;border:2px solid rgba(168,85,247,.3);background:rgba(168,85,247,.1);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px}\
.bar .mc.on{border-color:#EF4444;background:rgba(239,68,68,.15)}\
.bar .mc.th{border-color:#FBBF24;background:rgba(251,191,36,.1)}\
.bar .ms{font-size:11px;color:#71717A;text-align:center;height:14px;margin-bottom:4px}\
.bar .ir{display:flex;gap:6px}\
.bar .ip{flex:1;padding:9px 12px;font:400 14px DM Sans,sans-serif;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;color:#E4E4E7;outline:none}\
.bar .sb{padding:9px 14px;border-radius:10px;border:1px solid rgba(168,85,247,.3);background:rgba(168,85,247,.12);color:#C084FC;font:600 13px DM Sans,sans-serif;cursor:pointer}\
.bar .qk{display:flex;gap:4px;overflow-x:auto;padding:6px 0 0}\
.bar .qk::-webkit-scrollbar{height:0}\
.bar .qk button{flex-shrink:0;padding:4px 10px;font:500 10px DM Sans,sans-serif;border-radius:6px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03);color:#71717A;cursor:pointer;white-space:nowrap}\
.lis{padding:16px;text-align:center}\
.lis .big{width:90px;height:90px;border-radius:50%;border:3px solid rgba(168,85,247,.3);background:rgba(168,85,247,.08);display:flex;align-items:center;justify-content:center;cursor:pointer;margin:0 auto 10px;font-size:32px}\
.lis .big.on{border-color:#EF4444;background:rgba(239,68,68,.12);animation:pulse 2s infinite}\
.lis .dur{font-size:28px;font-weight:700;font-family:monospace;color:#EF4444;margin:6px 0}\
.lis .tx{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:12px;margin:12px 0;text-align:left;font-size:13px;color:#A1A1AA;line-height:1.6;max-height:200px;overflow-y:auto}\
.lis .sbtn{width:100%;padding:14px;border-radius:10px;background:linear-gradient(135deg,#A855F7,#7C3AED);border:none;color:#FFF;font:700 15px DM Sans,sans-serif;cursor:pointer}\
.lis .sbtn:disabled{opacity:.5}\
.lis .res{margin-top:14px;text-align:left;background:rgba(168,85,247,.04);border:1px solid rgba(168,85,247,.1);border-radius:10px;padding:12px}\
.lis .res h4{font-size:11px;font-weight:600;color:#A855F7;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px}\
.lis .res p{font-size:13px;color:#D4D4D8;line-height:1.6;margin:0;white-space:pre-wrap}\
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.3)}70%{box-shadow:0 0 0 15px rgba(239,68,68,0)}}\
</style></head><body>\
<div class="hd"><h1>Ronny</h1><div style="font-size:10px;display:flex;align-items:center;gap:4px" id="hst"><div id="dot" style="width:6px;height:6px;border-radius:50%;background:#52525B"></div><span id="ver">...</span></div></div>\
<div class="cnt">\
<div class="pn on" id="pn-chat">\
<div class="ch" id="ch"></div>\
<div class="bar">\
<div class="mr"><div class="mc" id="mc" onclick="tgMic()">🎤</div></div>\
<div class="ms" id="ms">Tap mic or type</div>\
<div class="ir"><input class="ip" id="ip" placeholder="Ask anything..." enterkeyhint="send"><button class="sb" onclick="snd()">Send</button></div>\
<div class="qk"><button onclick="sq(\'CM1 at 19% take rate\')">CM1</button><button onclick="sq(\'Prep me for merchant review\')">Prep</button><button onclick="sq(\'Zomato stock price\')">Stock</button><button onclick="sq(\'18% GST on 4.5 lakhs\')">Math</button><button onclick="sq(\'Book cab to office\')">Cab</button></div>\
</div></div>\
<div class="pn" id="pn-listen"><div class="lis">\
<div style="font-size:11px;font-weight:600;color:#A855F7;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px">Live Listener</div>\
<div style="font-size:12px;color:#71717A;margin-bottom:14px">Record meetings and calls. Ronny summarizes with action items.</div>\
<div class="big" id="lisBtn" onclick="tgLis()">🎙️</div>\
<div id="lisStatus" style="font-size:12px;color:#71717A">Tap to start</div>\
<div class="dur" id="lisDur" style="display:none">0:00</div>\
<div class="tx" id="lisTx" style="display:none"></div>\
<button class="sbtn" id="sumBtn" style="display:none" onclick="doSum()">Summarize & Extract Action Items</button>\
<div class="res" id="lisRes" style="display:none"><h4>Summary</h4><p id="lisResP"></p></div>\
</div></div>\
<div class="pn" id="pn-tasks"><div style="padding:14px">\
<div style="display:flex;gap:6px;margin-bottom:12px"><input id="taskIp" placeholder="Add a task..." style="flex:1;padding:9px 12px;font:400 14px DM Sans,sans-serif;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;color:#E4E4E7;outline:none"><button onclick="addTask()" style="padding:9px 12px;border-radius:10px;border:1px solid rgba(34,197,94,.3);background:rgba(34,197,94,.12);color:#22C55E;font:600 13px DM Sans,sans-serif;cursor:pointer">Add</button></div>\
<div style="font-size:11px;font-weight:600;color:#A855F7;letter-spacing:1px;margin-bottom:8px" id="taskCount">TASKS (0)</div>\
<div id="taskList"></div>\
</div></div>\
</div>\
<div class="tabs">\
<button class="on" onclick="swTab(\'chat\',this)"><i>💬</i>Chat</button>\
<button onclick="swTab(\'listen\',this)"><i>🎙️</i>Listen</button>\
<button onclick="swTab(\'tasks\',this)"><i>✅</i>Tasks</button>\
</div>\
<script>\
var A=location.origin;\
var SR=window.SpeechRecognition||window.webkitSpeechRecognition;\
var rc=null,li=0;\
var clRc=null,clLi=0,clTx="",clDur=0,clTm=null;\
var tasks=[];\
try{tasks=JSON.parse(localStorage.getItem("rn-tasks")||"[]")}catch(e){}\
renderTasks();\
\
if(SR){\
  rc=new SR();rc.lang="en-IN";\
  rc.onresult=function(e){spMic();chat(e.results[0][0].transcript)};\
  rc.onerror=function(){spMic()};\
  rc.onend=function(){if(li)spMic()};\
  clRc=new SR();clRc.lang="en-IN";clRc.continuous=true;clRc.interimResults=false;\
  clRc.onresult=function(e){\
    for(var i=e.resultIndex;i<e.results.length;i++){\
      if(e.results[i].isFinal){\
        clTx+=" "+e.results[i][0].transcript;\
        document.getElementById("lisTx").textContent=clTx.trim();\
      }\
    }\
  };\
  clRc.onend=function(){if(clLi){try{clRc.start()}catch(e){}}};\
  clRc.onerror=function(e){console.log("lis err",e.error);if(clLi){try{setTimeout(function(){clRc.start()},500)}catch(e){}}};\
}\
\
function swTab(id,btn){\
  document.querySelectorAll(".pn").forEach(function(p){p.classList.remove("on")});\
  document.getElementById("pn-"+id).classList.add("on");\
  document.querySelectorAll(".tabs button").forEach(function(b){b.classList.remove("on")});\
  btn.classList.add("on");\
}\
\
function tgMic(){\
  if(!rc)return alert("Voice not supported");\
  if(li){rc.stop();spMic()}\
  else{rc.start();li=1;document.getElementById("mc").classList.add("on");document.getElementById("mc").textContent="⏹";ss("Listening...")}\
}\
function spMic(){li=0;document.getElementById("mc").classList.remove("on");document.getElementById("mc").textContent="🎤";ss("Tap mic or type")}\
function ss(t){document.getElementById("ms").textContent=t}\
\
function am(t,y,dl){\
  var c=document.getElementById("ch"),d=document.createElement("div");\
  d.className="mg "+y;\
  var h="<div class=lb>"+(y==="u"?"YOU":"RONNY")+"</div><div>"+t+"</div>";\
  if(dl&&y==="r")h+="<a class=lk href=\\""+dl+"\\" target=_blank>Open App →</a>";\
  d.innerHTML=h;c.appendChild(d);c.scrollTop=1e6;\
}\
\
function chat(t){\
  am(t,"u");document.getElementById("mc").classList.add("th");document.getElementById("mc").textContent="⏳";ss("Thinking...");\
  fetch(A+"/ronny",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t})})\
  .then(function(r){return r.json()})\
  .then(function(d){\
    document.getElementById("mc").classList.remove("th");document.getElementById("mc").textContent="🎤";ss("Tap mic or type");\
    am(d.reply,"r",d.deepLink);\
    if(speechSynthesis){var u=new SpeechSynthesisUtterance(d.reply);u.lang="en-IN";u.rate=1.05;speechSynthesis.speak(u)}\
    if(d.deepLink)setTimeout(function(){window.open(d.deepLink,"_blank")},1500);\
  }).catch(function(){document.getElementById("mc").classList.remove("th");document.getElementById("mc").textContent="🎤";ss("Error");am("Could not reach Ronny.","r")})\
}\
function snd(){var i=document.getElementById("ip"),t=i.value.trim();if(t){i.value="";chat(t)}}\
function sq(t){chat(t)}\
document.getElementById("ip").onkeydown=function(e){if(e.key==="Enter")snd()};\
\
function tgLis(){\
  if(!clRc)return alert("Voice not supported on this browser");\
  if(clLi){\
    clLi=0;clRc.stop();clearInterval(clTm);\
    document.getElementById("lisBtn").classList.remove("on");document.getElementById("lisBtn").textContent="🎙️";\
    document.getElementById("lisStatus").textContent="Recording stopped — "+fmtD(clDur);\
    if(clTx.trim().length>5){\
      document.getElementById("sumBtn").style.display="block";\
    } else {\
      document.getElementById("lisStatus").textContent="No speech detected. Try again.";\
    }\
  } else {\
    clTx="";clDur=0;\
    clLi=1;clRc.start();\
    document.getElementById("lisBtn").classList.add("on");document.getElementById("lisBtn").textContent="⏹";\
    document.getElementById("lisStatus").textContent="Recording...";\
    document.getElementById("lisDur").style.display="block";document.getElementById("lisDur").textContent="0:00";\
    document.getElementById("lisTx").style.display="block";document.getElementById("lisTx").textContent="Waiting for speech...";\
    document.getElementById("sumBtn").style.display="none";\
    document.getElementById("lisRes").style.display="none";\
    clTm=setInterval(function(){clDur++;document.getElementById("lisDur").textContent=fmtD(clDur)},1000);\
  }\
}\
function fmtD(s){var m=Math.floor(s/60),sc=s%60;return m+":"+(sc<10?"0":"")+sc}\
\
function doSum(){\
  var tx=clTx.trim();\
  if(!tx)return;\
  var btn=document.getElementById("sumBtn");\
  btn.disabled=true;btn.textContent="Summarizing...";\
  var prompt="Summarize this meeting transcript concisely. List: 1) Key discussion points 2) Action items with owners and deadlines if mentioned 3) Decisions made. Here is the transcript (keep summary under 300 words): "+tx.slice(0,3000);\
  fetch(A+"/ronny",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:prompt})})\
  .then(function(r){return r.json()})\
  .then(function(d){\
    btn.disabled=false;btn.textContent="Summarize Again";\
    document.getElementById("lisRes").style.display="block";\
    document.getElementById("lisResP").textContent=d.reply;\
  })\
  .catch(function(){\
    btn.disabled=false;btn.textContent="Retry";\
    document.getElementById("lisRes").style.display="block";\
    document.getElementById("lisResP").textContent="Could not summarize. Check connection or API credits.";\
  })\
}\
\
function addTask(){\
  var i=document.getElementById("taskIp"),t=i.value.trim();\
  if(!t)return;\
  tasks.unshift({id:Date.now(),task:t,done:false});i.value="";\
  saveTasks();renderTasks();\
}\
function toggleTask(id){tasks.forEach(function(t){if(t.id===id)t.done=!t.done});saveTasks();renderTasks()}\
function delTask(id){tasks=tasks.filter(function(t){return t.id!==id});saveTasks();renderTasks()}\
function saveTasks(){try{localStorage.setItem("rn-tasks",JSON.stringify(tasks))}catch(e){}}\
function renderTasks(){\
  var el=document.getElementById("taskList");if(!el)return;\
  var pend=tasks.filter(function(t){return!t.done}),done=tasks.filter(function(t){return t.done});\
  var tc=document.getElementById("taskCount");if(tc)tc.textContent="TASKS ("+pend.length+" pending)";\
  var h="";\
  pend.forEach(function(t){\
    h+="<div style=\\"display:flex;gap:8px;align-items:flex-start;padding:8px 10px;margin-bottom:4px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:8px\\"><button onclick=\\"toggleTask("+t.id+")\\" style=\\"width:20px;height:20px;border-radius:5px;border:1.5px solid rgba(255,255,255,.15);background:transparent;cursor:pointer;flex-shrink:0\\"></button><div style=\\"flex:1;font-size:13px;color:#E4E4E7\\">"+t.task+"</div><button onclick=\\"delTask("+t.id+")\\" style=\\"background:none;border:none;color:#52525B;cursor:pointer;font-size:16px\\">×</button></div>";\
  });\
  if(done.length){\
    h+="<div style=\\"font-size:10px;font-weight:600;color:#22C55E;letter-spacing:1px;margin:12px 0 6px\\">DONE ("+done.length+")</div>";\
    done.forEach(function(t){\
      h+="<div style=\\"display:flex;gap:8px;align-items:center;padding:6px 10px;margin-bottom:3px;background:rgba(34,197,94,.03);border:1px solid rgba(34,197,94,.08);border-radius:6px;opacity:.5\\"><button onclick=\\"toggleTask("+t.id+")\\" style=\\"width:20px;height:20px;border-radius:5px;border:1.5px solid #22C55E;background:rgba(34,197,94,.2);color:#22C55E;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center\\">✓</button><div style=\\"flex:1;font-size:12px;color:#71717A;text-decoration:line-through\\">"+t.task+"</div><button onclick=\\"delTask("+t.id+")\\" style=\\"background:none;border:none;color:#52525B;cursor:pointer;font-size:16px\\">×</button></div>";\
    });\
  }\
  el.innerHTML=h||"<div style=\\"text-align:center;padding:30px 0;font-size:13px;color:#52525B\\">No tasks yet.</div>";\
}\
\
fetch(A+"/").then(function(r){return r.json()}).then(function(d){\
  document.getElementById("dot").style.background="#22C55E";document.getElementById("dot").style.boxShadow="0 0 6px #22C55E";\
  document.getElementById("ver").textContent="v"+(d.version||"?");document.getElementById("ver").style.color="#22C55E";\
}).catch(function(){document.getElementById("ver").textContent="Offline";document.getElementById("ver").style.color="#EF4444"});\
</script></body></html>';

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("Ronny 4.2 on port " + PORT);
});
