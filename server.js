const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const app = express();
app.use(express.json());
app.use(express.text());

// CORS
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const client = new Anthropic();
var USER = process.env.USER_NAME || "Rahul";
var CAL = process.env.GOOGLE_APPS_SCRIPT_URL || "";
var IFTTT = process.env.IFTTT_WEBHOOK_KEY || "";

var SYS = "You are Ronny, " + USER + "'s personal AI and FP&A copilot. You are sharp, warm, efficient.\n\nRespond ONLY with a valid JSON object (no markdown, no extra text):\n{\"intent\":\"QUESTION|FOOD|CAB|SHOPPING|WHATSAPP|CALENDAR|LIGHTS|MULTI|CHAT\",\"confidence\":0.9,\"actions\":[],\"reply\":\"spoken answer\",\"deepLink\":null}\n\nCapabilities:\n- QUESTION: Any knowledge query, calculation, market data, finance scenario. Give full substantive answers.\n- FOOD: {\"type\":\"food_order\",\"params\":{\"search\":\"coffee\"}}\n- CAB: {\"type\":\"cab_book\",\"params\":{\"service\":\"uber\",\"destination\":\"...\"}}\n- SHOPPING: {\"type\":\"shopping_search\",\"params\":{\"app\":\"amazon\",\"query\":\"...\"}}\n- WHATSAPP: {\"type\":\"whatsapp_message\",\"params\":{\"contact\":\"\",\"message\":\"\"}}\n- CALENDAR: {\"type\":\"calendar_query\",\"params\":{\"date\":\"today\"}}\n- LIGHTS: {\"type\":\"lights_scene\",\"params\":{\"scene\":\"movie\"}}\n- SUMMARIZE: When given a meeting transcript, extract key points, action items with owners and deadlines, and decisions made.\n\n" + USER + "'s context: Works at Zomato (Eternal), senior finance, Gurgaon. Knows NOV, NAOV, CM1, CM2, BTPO, LCPO, EBITDA metrics. Prefers Uber, Zomato, Amazon, Blinkit. Favourite restaurants: Bikanervala, Haldirams, Burger King, Dominos.";

async function parseIntent(text) {
  var now = new Date();
  var ds = now.toLocaleDateString("en-IN",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  var ts = now.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
  var msg = await client.messages.create({
    model: "claude-sonnet-4-20250514", max_tokens: 2048, system: SYS,
    messages: [{role:"user",content:"Current: "+ds+", "+ts+"\n\n"+USER+" says: \""+text+"\""}]
  });
  var t = msg.content.filter(function(b){return b.type==="text"}).map(function(b){return b.text}).join("");
  try {
    var c = t.replace(/```json\n?|```/g,"").trim();
    var p = JSON.parse(c);
    var r = {intent:p.intent||"CHAT",confidence:p.confidence||0.5,actions:p.actions||[],reply:p.reply||"Done.",deepLink:p.deepLink||null};
    // Live data check
    if (r.intent==="QUESTION" && /price|stock|market|rate|nifty|sensex|crude|oil|gold|bitcoin|dollar|rupee|exchange|barrel|weather/i.test(text)) {
      try {
        var sm = await client.messages.create({
          model:"claude-sonnet-4-20250514",max_tokens:1024,
          system:"Answer concisely in 2-3 sentences with current data. Plain text only.",
          tools:[{type:"web_search_20250305",name:"web_search"}],
          messages:[{role:"user",content:text}]
        });
        var sr = sm.content.filter(function(b){return b.type==="text"}).map(function(b){return b.text}).join(" ").trim();
        if(sr) r.reply = sr.slice(0,500);
      } catch(e){ console.log("Web search failed:",e.message); }
    }
    return r;
  } catch(e) {
    return {intent:"CHAT",confidence:0.3,actions:[],reply:t.slice(0,300)||"Try again?",deepLink:null};
  }
}

async function runActions(actions) {
  var results = [];
  for (var i=0;i<actions.length;i++) {
    var a = actions[i];
    try {
      if (a.type==="food_order") {
        var q = (a.params&&(a.params.search||a.params.restaurant))||"";
        results.push({type:a.type,status:"link",deepLink:q?"https://www.zomato.com/gurgaon/search?q="+encodeURIComponent(q):"https://www.zomato.com/gurgaon"});
      } else if (a.type==="cab_book") {
        var d = encodeURIComponent((a.params&&a.params.destination)||"");
        results.push({type:a.type,status:"link",deepLink:d?"https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]="+d:"https://m.uber.com/ul/"});
      } else if (a.type==="shopping_search") {
        var sq = (a.params&&a.params.query)||"";
        var sa = (a.params&&a.params.app)||"amazon";
        results.push({type:a.type,status:"link",deepLink:sa==="amazon"?(sq?"https://www.amazon.in/s?k="+encodeURIComponent(sq):"https://www.amazon.in"):(sq?"https://www.flipkart.com/search?q="+encodeURIComponent(sq):"https://www.flipkart.com")});
      } else if (a.type==="whatsapp_message") {
        var wm = (a.params&&a.params.message)||"";
        results.push({type:a.type,status:"link",deepLink:wm?"https://wa.me/?text="+encodeURIComponent(wm):"https://wa.me/"});
      } else if (a.type==="lights_scene"&&IFTTT) {
        var sc = (a.params&&a.params.scene)||"bright";
        await fetch("https://maker.ifttt.com/trigger/ronny_"+(sc==="movie"?"movie_mode":sc)+"/with/key/"+IFTTT,{method:"POST"});
        results.push({type:a.type,status:"triggered"});
      } else {
        results.push({type:a.type,status:"ok"});
      }
    } catch(e) { results.push({type:a.type,status:"failed"}); }
  }
  return results;
}

// Main endpoint
app.post("/ronny", async function(req, res) {
  try {
    var text = typeof req.body==="string"?req.body:(req.body.text||req.body.message);
    if (!text||!text.trim()) return res.json({reply:"I didn't catch that."});
    console.log("\n  \""+text+"\"");
    var p = await parseIntent(text);
    var r = await runActions(p.actions);
    var dl = p.deepLink;
    for (var i=0;i<r.length;i++) { if(r[i].deepLink){dl=r[i].deepLink;break;} }
    res.json({reply:p.reply,intent:p.intent,deepLink:dl,actions:r});
  } catch(e) {
    console.error("ERR:",e.message);
    res.json({reply:"Something went wrong. Check API credits.",error:e.message});
  }
});

// Summarize endpoint (for meeting transcripts)
app.post("/ronny/summarize", async function(req, res) {
  try {
    var transcript = typeof req.body==="string"?req.body:(req.body.transcript||req.body.text||"");
    if (!transcript.trim()) return res.json({summary:"No transcript provided."});
    var msg = await client.messages.create({
      model:"claude-sonnet-4-20250514",max_tokens:2048,
      system:"You summarize meeting transcripts. Return a JSON object with: {\"summary\":\"2-3 paragraph summary\",\"actionItems\":[{\"task\":\"...\",\"owner\":\"...\",\"deadline\":\"...\"}],\"decisions\":[\"...\"],\"followUps\":[\"...\"]}. Return ONLY valid JSON.",
      messages:[{role:"user",content:"Summarize this meeting transcript:\n\n"+transcript}]
    });
    var t = msg.content.filter(function(b){return b.type==="text"}).map(function(b){return b.text}).join("");
    try {
      var parsed = JSON.parse(t.replace(/```json\n?|```/g,"").trim());
      res.json(parsed);
    } catch(e) {
      res.json({summary:t.slice(0,1000),actionItems:[],decisions:[],followUps:[]});
    }
  } catch(e) {
    res.json({summary:"Failed to summarize.",error:e.message});
  }
});

// Tasker/browser GET endpoint
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

// Calendar
app.get("/ronny/today", async function(req, res) {
  if (CAL) {
    try {
      var r = await fetch(CAL+"?action=today");
      var d = await r.json();
      res.json(d);
    } catch(e) { res.json({reply:"Calendar error"}); }
  } else { res.json({reply:"Calendar not connected"}); }
});

// Health
app.get("/", function(req, res) { res.json({status:"Ronny is awake",version:"4.1.0"}); });

// PWA Manifest
app.get("/manifest.json", function(req, res) {
  res.json({name:"Ronny",short_name:"Ronny",description:"Your AI copilot",start_url:"/app",display:"standalone",background_color:"#09090B",theme_color:"#09090B",orientation:"portrait",icons:[{src:"/icon.svg",sizes:"any",type:"image/svg+xml",purpose:"any"}]});
});

// App icon
app.get("/icon.svg", function(req, res) {
  res.setHeader("Content-Type","image/svg+xml");
  res.send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#A855F7"/><text x="50" y="66" text-anchor="middle" font-size="48" font-weight="bold" fill="white" font-family="sans-serif">R</text></svg>');
});

// Apple touch icon (PNG via SVG)
app.get("/apple-touch-icon.png", function(req, res) {
  res.redirect("/icon.svg");
});

// ═══════════════════════════════════════════════════════
// FULL APP — Chat + Listen + Tasks
// ═══════════════════════════════════════════════════════
app.get("/app", function(req, res) {
  res.setHeader("Content-Type", "text/html");
  res.send('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no,viewport-fit=cover"><meta name="theme-color" content="#09090B"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Ronny"><meta name="mobile-web-app-capable" content="yes"><link rel="manifest" href="/manifest.json"><link rel="apple-touch-icon" href="/icon.svg"><title>Ronny</title><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{height:100%;overflow:hidden}body{font-family:DM Sans,sans-serif;background:#09090B;color:#E4E4E7;display:flex;flex-direction:column}input{font-family:DM Sans,sans-serif}.hd{padding:env(safe-area-inset-top,12px) 16px 10px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0}.hd h1{font-size:20px;font-weight:700;background:linear-gradient(135deg,#F8FAFC,#A855F7);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.hd .st{font-size:10px;display:flex;align-items:center;gap:4px}.hd .dot{width:6px;height:6px;border-radius:50%}.cnt{flex:1;overflow:hidden;display:flex;flex-direction:column}.tabs{display:flex;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0;padding-bottom:env(safe-area-inset-bottom,8px)}.tabs button{flex:1;padding:8px 0 4px;text-align:center;cursor:pointer;font-size:10px;font-weight:600;border:none;background:transparent;color:#52525B;border-top:2px solid transparent}.tabs button.on{color:#A855F7;border-top-color:#A855F7}.tabs button .ti{font-size:16px;margin-bottom:1px}.pn{flex:1;overflow-y:auto;display:none;flex-direction:column}.pn.on{display:flex}.ch{padding:12px}.ch .mg{max-width:85%;padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.5;margin-bottom:8px}.ch .mg.u{margin-left:auto;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.2);border-radius:14px 14px 4px 14px}.ch .mg.r{background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.15);border-radius:14px 14px 14px 4px}.ch .mg .lb{font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px}.ch .mg.u .lb{color:#3B82F6}.ch .mg.r .lb{color:#A855F7}.ch .mg .lk{display:inline-block;margin-top:6px;padding:4px 10px;border-radius:6px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);color:#22C55E;font-size:11px;font-weight:600;text-decoration:none}.inp{padding:10px 14px;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0}.inp .mr{display:flex;justify-content:center;margin-bottom:6px}.inp .mc{width:52px;height:52px;border-radius:50%;border:2px solid rgba(168,85,247,.3);background:rgba(168,85,247,.1);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px}.inp .mc.on{border-color:#EF4444;background:rgba(239,68,68,.15)}.inp .mc.th{border-color:#FBBF24;background:rgba(251,191,36,.1)}.inp .ms{font-size:11px;color:#71717A;text-align:center;height:14px;margin-bottom:4px}.inp .ir{display:flex;gap:6px}.inp .ip{flex:1;padding:9px 12px;font-size:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;color:#E4E4E7;outline:none}.inp .sb{padding:9px 14px;border-radius:10px;border:1px solid rgba(168,85,247,.3);background:rgba(168,85,247,.12);color:#C084FC;font-size:13px;font-weight:600;cursor:pointer}.inp .qk{display:flex;gap:4px;overflow-x:auto;padding:6px 0 0}.inp .qk::-webkit-scrollbar{height:0}.inp .qk button{flex-shrink:0;padding:4px 10px;font-size:10px;font-weight:500;border-radius:6px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03);color:#71717A;cursor:pointer;white-space:nowrap}.lis{padding:16px;text-align:center}.lis .big{width:90px;height:90px;border-radius:50%;border:3px solid rgba(168,85,247,.3);background:rgba(168,85,247,.08);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;margin:0 auto 12px;font-size:32px}.lis .big.on{border-color:#EF4444;background:rgba(239,68,68,.12);animation:pulse 2s infinite}.lis .dur{font-size:28px;font-weight:700;font-family:monospace;color:#EF4444;margin:8px 0}.lis .tx{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:12px;margin:12px 0;text-align:left;font-size:13px;color:#A1A1AA;line-height:1.6;max-height:200px;overflow-y:auto}.lis .sum-btn{width:100%;padding:14px;border-radius:10px;background:linear-gradient(135deg,#A855F7,#7C3AED);border:none;color:#FFF;font-size:15px;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif}.lis .sum-btn:disabled{opacity:.5}.lis .result{margin-top:14px;text-align:left}.lis .result .sec{background:rgba(168,85,247,.04);border:1px solid rgba(168,85,247,.1);border-radius:8px;padding:10px 12px;margin-bottom:8px}.lis .result .sec h4{font-size:11px;font-weight:600;color:#A855F7;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px}.lis .result .sec p{font-size:13px;color:#D4D4D8;line-height:1.6;margin:0}.lis .result .items{font-size:12px;color:#A1A1AA;line-height:1.8}.lis .how{text-align:left;margin-top:10px}.lis .how .step{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)}.lis .how .step:last-child{border:none}.lis .how .si{font-size:18px;width:28px;text-align:center;flex-shrink:0}.lis .how .st2{font-size:12px;color:#71717A}.lis .how .st2 b{color:#FAFAFA}@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.3)}70%{box-shadow:0 0 0 15px rgba(239,68,68,0)}}</style></head><body><div class="hd"><h1>Ronny</h1><div class="st"><div class="dot" id="dot" style="background:#52525B"></div><span id="ver">Connecting...</span></div></div><div class="cnt"><div class="pn on" id="pn-chat"><div class="ch" id="ch" style="flex:1;overflow-y:auto"></div><div class="inp"><div class="mr"><div class="mc" id="mc" onclick="tgMic()">🎤</div></div><div class="ms" id="ms">Tap mic or type</div><div class="ir"><input class="ip" id="ip" placeholder="Ask anything..." enterkeyhint="send"><button class="sb" onclick="snd()">Send</button></div><div class="qk"><button onclick="sq(\'CM1 at 19% take rate\')">CM1 scenario</button><button onclick="sq(\'Prep me for merchant review\')">Meeting prep</button><button onclick="sq(\'Zomato stock price\')">Stock</button><button onclick="sq(\'18% GST on 4.5 lakhs\')">Math</button></div></div></div><div class="pn" id="pn-listen"><div class="lis"><div style="font-size:11px;font-weight:600;color:#A855F7;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px">Live conversation listener</div><div style="font-size:12px;color:#71717A;margin-bottom:14px">Capture meetings and calls. Ronny auto-summarizes with action items.</div><div class="big" id="lisBtn" onclick="tgLis()">🎙️</div><div id="lisStatus" style="font-size:12px;color:#71717A">Tap to start listening</div><div class="dur" id="lisDur" style="display:none">0:00</div><div class="tx" id="lisTx" style="display:none"></div><div id="lisActions" style="display:none"><button class="sum-btn" id="sumBtn" onclick="doSum()">Summarize & Extract Action Items</button></div><div id="lisResult" class="result"></div><div id="lisHow" class="how"><div class="step"><div class="si">🎙️</div><div class="st2"><b>Tap to start listening</b><br>Captures everything said — no time limit</div></div><div class="step"><div class="si">⏹</div><div class="st2"><b>Tap again to stop</b><br>When the meeting or call ends</div></div><div class="step"><div class="si">📋</div><div class="st2"><b>Auto-summarize</b><br>Key points, action items, timelines</div></div><div class="step"><div class="si">✅</div><div class="st2"><b>Tasks created</b><br>Action items become trackable to-dos</div></div></div></div></div><div class="pn" id="pn-tasks"><div style="padding:14px"><div style="display:flex;gap:6px;margin-bottom:12px"><input class="ip" id="taskIp" placeholder="Add a task..." style="flex:1;padding:9px 12px;font-size:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;color:#E4E4E7;outline:none" onkeydown="if(event.key===\'Enter\')addTask()"><button onclick="addTask()" style="padding:9px 12px;border-radius:10px;border:1px solid rgba(34,197,94,.3);background:rgba(34,197,94,.12);color:#22C55E;font-size:13px;font-weight:600;cursor:pointer">Add</button></div><div style="font-size:11px;font-weight:600;color:#A855F7;letter-spacing:1px;margin-bottom:8px" id="taskCount">TASKS (0)</div><div id="taskList"></div></div></div></div><div class="tabs"><button class="on" onclick="swTab(\'chat\',this)"><div class="ti">💬</div>Chat</button><button onclick="swTab(\'listen\',this)"><div class="ti">🎙️</div>Listen</button><button onclick="swTab(\'tasks\',this)"><div class="ti">✅</div>Tasks</button></div><script>var A=location.origin,SR=window.SpeechRecognition||window.webkitSpeechRecognition;var rc=null,li=0,clRc=null,clLi=0,clTx="",clDur=0,clTm=null,tasks=[];try{tasks=JSON.parse(localStorage.getItem("ronny-tasks")||"[]")}catch(e){}renderTasks();if(SR){rc=new SR;rc.lang="en-IN";rc.onresult=function(e){spMic();chat(e.results[0][0].transcript)};rc.onerror=function(){spMic()};rc.onend=function(){if(li)spMic()};clRc=new SR;clRc.lang="en-IN";clRc.continuous=true;clRc.interimResults=false;clRc.onresult=function(e){for(var i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal){clTx+=" "+e.results[i][0].transcript;document.getElementById("lisTx").textContent=clTx.trim()}}};clRc.onend=function(){if(clLi)try{clRc.start()}catch(e){}};clRc.onerror=function(){}}function swTab(id,btn){document.querySelectorAll(".pn").forEach(function(p){p.classList.remove("on")});document.getElementById("pn-"+id).classList.add("on");document.querySelectorAll(".tabs button").forEach(function(b){b.classList.remove("on")});btn.classList.add("on")}function tgMic(){if(!rc)return alert("Voice not supported");if(li){rc.stop();spMic()}else{rc.start();li=1;document.getElementById("mc").classList.add("on");document.getElementById("mc").textContent="⏹";ss("Listening...")}}function spMic(){li=0;document.getElementById("mc").classList.remove("on");document.getElementById("mc").textContent="🎤";ss("Tap mic or type")}function ss(t){document.getElementById("ms").textContent=t}function am(t,y,dl){var c=document.getElementById("ch"),d=document.createElement("div");d.className="mg "+y;var h="<div class=lb>"+(y==="u"?"YOU":"RONNY")+"</div><div>"+t+"</div>";if(dl&&y==="r")h+="<a class=lk href=\\""+dl+"\\" target=_blank>Open App →</a>";d.innerHTML=h;c.appendChild(d);c.scrollTop=1e6}function chat(t){am(t,"u");document.getElementById("mc").classList.add("th");ss("Thinking...");fetch(A+"/ronny",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t})}).then(function(r){return r.json()}).then(function(d){document.getElementById("mc").classList.remove("th");ss("Tap mic or type");am(d.reply,"r",d.deepLink);if(speechSynthesis){var u=new SpeechSynthesisUtterance(d.reply);u.lang="en-IN";u.rate=1.05;speechSynthesis.speak(u)}if(d.deepLink)setTimeout(function(){window.open(d.deepLink,"_blank")},1500)}).catch(function(){document.getElementById("mc").classList.remove("th");ss("Error");am("Could not reach Ronny.","r")})}function snd(){var i=document.getElementById("ip"),t=i.value.trim();if(t){i.value="";chat(t)}}function sq(t){chat(t)}document.getElementById("ip").onkeydown=function(e){if(e.key==="Enter")snd()};function tgLis(){if(clLi){clLi=0;if(clRc)clRc.stop();clearInterval(clTm);document.getElementById("lisBtn").classList.remove("on");document.getElementById("lisBtn").textContent="🎙️";document.getElementById("lisStatus").textContent="Recording stopped";if(clTx.trim()){document.getElementById("lisActions").style.display="block"}document.getElementById("lisHow").style.display="none"}else{clTx="";clDur=0;clLi=1;if(clRc)clRc.start();document.getElementById("lisBtn").classList.add("on");document.getElementById("lisBtn").textContent="⏹";document.getElementById("lisStatus").textContent="Recording...";document.getElementById("lisDur").style.display="block";document.getElementById("lisTx").style.display="block";document.getElementById("lisTx").textContent="Waiting for speech...";document.getElementById("lisActions").style.display="none";document.getElementById("lisResult").innerHTML="";document.getElementById("lisHow").style.display="none";clTm=setInterval(function(){clDur++;var m=Math.floor(clDur/60),s=clDur%60;document.getElementById("lisDur").textContent=m+":"+(s<10?"0":"")+s},1000)}}function doSum(){if(!clTx.trim())return;var btn=document.getElementById("sumBtn");btn.disabled=true;btn.textContent="Summarizing...";fetch(A+"/ronny/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript:clTx.trim()})}).then(function(r){return r.json()}).then(function(d){btn.disabled=false;btn.textContent="Summarize & Extract Action Items";var html="";if(d.summary){html+="<div class=sec><h4>Summary</h4><p>"+d.summary+"</p></div>"}if(d.actionItems&&d.actionItems.length){html+="<div class=sec><h4>Action Items</h4><div class=items>";d.actionItems.forEach(function(a){html+="• "+a.task+(a.owner?" ("+a.owner+")":"")+(a.deadline?" — "+a.deadline:"")+"<br>";tasks.unshift({id:Date.now()+Math.random(),task:a.task,deadline:a.deadline||"TBD",done:false,source:"meeting"});});html+="</div></div>";saveTasks();renderTasks()}if(d.decisions&&d.decisions.length){html+="<div class=sec><h4>Decisions</h4><div class=items>";d.decisions.forEach(function(x){html+="• "+x+"<br>"});html+="</div></div>"}document.getElementById("lisResult").innerHTML=html}).catch(function(){btn.disabled=false;btn.textContent="Retry";document.getElementById("lisResult").innerHTML="<div class=sec><h4>Error</h4><p>Could not summarize. Check connection.</p></div>"})}function addTask(){var i=document.getElementById("taskIp"),t=i.value.trim();if(!t)return;tasks.unshift({id:Date.now(),task:t,deadline:"TBD",done:false,source:"manual"});i.value="";saveTasks();renderTasks()}function toggleTask(id){tasks.forEach(function(t){if(t.id===id)t.done=!t.done});saveTasks();renderTasks()}function delTask(id){tasks=tasks.filter(function(t){return t.id!==id});saveTasks();renderTasks()}function saveTasks(){try{localStorage.setItem("ronny-tasks",JSON.stringify(tasks))}catch(e){}}function renderTasks(){var list=document.getElementById("taskList");if(!list)return;var pending=tasks.filter(function(t){return!t.done});var done=tasks.filter(function(t){return t.done});document.getElementById("taskCount").textContent="TASKS ("+pending.length+" pending)";var h="";pending.forEach(function(t){h+="<div style=\\"display:flex;gap:8px;align-items:flex-start;padding:8px 10px;margin-bottom:4px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:8px\\"><button onclick=\\"toggleTask("+t.id+")\\" style=\\"width:20px;height:20px;border-radius:5px;border:1.5px solid rgba(255,255,255,.15);background:transparent;cursor:pointer;flex-shrink:0;margin-top:2px\\"></button><div style=flex:1><div style=\\"font-size:13px;color:#E4E4E7\\">"+t.task+"</div><div style=\\"font-size:10px;color:#52525B;margin-top:2px\\">"+(t.deadline!=="TBD"?"Due: "+t.deadline+" · ":"")+(t.source==="meeting"?"From meeting":"Manual")+"</div></div><button onclick=\\"delTask("+t.id+")\\" style=\\"background:none;border:none;color:#52525B;cursor:pointer;font-size:14px\\">×</button></div>"});if(done.length){h+="<div style=\\"font-size:10px;font-weight:600;color:#22C55E;letter-spacing:1px;margin:12px 0 6px\\">DONE ("+done.length+")</div>";done.forEach(function(t){h+="<div style=\\"display:flex;gap:8px;align-items:center;padding:6px 10px;margin-bottom:3px;background:rgba(34,197,94,.03);border:1px solid rgba(34,197,94,.08);border-radius:6px;opacity:.5\\"><button onclick=\\"toggleTask("+t.id+")\\" style=\\"width:20px;height:20px;border-radius:5px;border:1.5px solid #22C55E;background:rgba(34,197,94,.2);color:#22C55E;cursor:pointer;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center\\">✓</button><div style=\\"font-size:12px;color:#71717A;text-decoration:line-through;flex:1\\">"+t.task+"</div><button onclick=\\"delTask("+t.id+")\\" style=\\"background:none;border:none;color:#52525B;cursor:pointer;font-size:14px\\">×</button></div>"})}list.innerHTML=h||"<div style=\\"text-align:center;padding:30px 0;font-size:13px;color:#52525B\\">No tasks yet. Add one above or record a meeting.</div>"}fetch(A+"/").then(function(r){return r.json()}).then(function(d){document.getElementById("dot").style.background="#22C55E";document.getElementById("dot").style.boxShadow="0 0 6px #22C55E";document.getElementById("ver").textContent="v"+(d.version||"?");document.getElementById("ver").style.color="#22C55E"}).catch(function(){document.getElementById("ver").textContent="Offline";document.getElementById("ver").style.color="#EF4444"});</script></body></html>');
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("\nRonny 4.1 listening on port " + PORT);
  console.log("  POST /ronny          — voice/chat endpoint");
  console.log("  POST /ronny/summarize — meeting summarizer");
  console.log("  GET  /ronny/ask      — Tasker/browser endpoint");
  console.log("  GET  /app            — web app (iPhone/Android/Desktop)\n");
});
