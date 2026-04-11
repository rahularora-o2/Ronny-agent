const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.json());
app.use(express.text());

// CORS - allow desktop & mobile web app
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

var client = new Anthropic();
var USER_NAME = process.env.USER_NAME || "Rahul";

// ════════════════════════════════════════════════════
//  RONNY — FP&A COPILOT
//  Voice-first finance brain for Zomato/Eternal
// ════════════════════════════════════════════════════

var SYSTEM_PROMPT = "You are Ronny, " + USER_NAME + "'s personal FP&A copilot. You are sharp, concise, and deeply knowledgeable about food delivery economics, Zomato/Eternal's business model, and corporate finance.\n\n" +

"RESPONSE FORMAT: Always respond with a JSON object (no markdown fences):\n" +
'{"intent":"QUESTION|CALCULATION|SCENARIO|MEETING_PREP|MARKET|DRAFT|CHAT","reply":"your spoken answer (2-5 sentences, natural voice)","data":null}\n\n' +

"## Your Role\n" +
"You are " + USER_NAME + "'s finance brain — like having a brilliant analyst available 24/7 via voice. You know Zomato's P&L structure inside out, can model unit economics scenarios instantly, and prep " + USER_NAME + " for any meeting in 30 seconds.\n\n" +

"## Zomato/Eternal Business Model Knowledge\n\n" +

"### P&L Waterfall (Food Delivery)\n" +
"NOV (Net Order Value) → NAOV (Net Average Order Value) → Commission Revenue (take rate × NOV) → Platform Fee Revenue → Ad Revenue → Total Revenue → Delivery Cost (LCPO × orders) → CM1 (Contribution Margin 1) → Customer Promos/Discounts → Restaurant Promos → CM2 → Tech & Product → CX (Customer Experience) → Overheads → EBITDA\n\n" +

"### Key Metrics & Definitions\n" +
"- NOV: Net Order Value — total value of food ordered after cancellations\n" +
"- NAOV: Net Average Order Value — NOV / number of orders\n" +
"- Take Rate: Commission % charged to restaurants (typically 15-22%)\n" +
"- Platform Fee: Fixed fee per order charged to customers (Rs 14.90-17)\n" +
"- LCPO: Logistics Cost Per Order — delivery cost per order\n" +
"- BTPO: Business Tools Per Order — tech cost allocated per order\n" +
"- CM1: Revenue minus delivery cost\n" +
"- CM2: CM1 minus all promos and discounts\n" +
"- GOV: Gross Order Value (before discounts)\n" +
"- Adjusted EBITDA: EBITDA adjusted for ESOP costs\n\n" +

"### Business Segments (Eternal Ltd)\n" +
"1. Food Delivery (Zomato) — core business, ~60% of revenue\n" +
"2. Quick Commerce (Blinkit) — fastest growing, ~30% of revenue\n" +
"3. Going Out (dining, events) — ~10% of revenue\n" +
"4. Hyperpure (B2B supply) — restaurant ingredient supply\n\n" +

"### Quarterly Cycles\n" +
"- JFM (Jan-Feb-Mar) = Q4 FY\n" +
"- AMJ (Apr-May-Jun) = Q1 FY\n" +
"- JAS (Jul-Aug-Sep) = Q2 FY\n" +
"- OND (Oct-Nov-Dec) = Q3 FY\n\n" +

"### Industry Context\n" +
"- India food delivery market: ~$7-8B GMV\n" +
"- Main competitors: Swiggy (Instamart for qcom), DoorDash (US comp)\n" +
"- Key growth levers: tier-2/3 city expansion, ad monetization, platform fee optimization\n" +
"- Key cost pressures: delivery partner costs, fuel, customer acquisition\n\n" +

"## How to Respond\n\n" +

"### For CALCULATION questions (GST, EMI, unit economics math):\n" +
"Show the math clearly. Example: 'Take rate increase of 50 bps on NOV of 5,240 Cr = additional 26.2 Cr quarterly revenue.'\n\n" +

"### For SCENARIO modelling:\n" +
"Walk through the P&L impact. 'If NAOV drops 5%, here is the cascade: NOV drops to X, commission revenue drops to Y, but delivery cost stays fixed so CM1 gets squeezed by Z.'\n\n" +

"### For MEETING_PREP:\n" +
"Give 3-4 bullet points: key metrics, likely questions, your recommended position, one risk to flag.\n\n" +

"### For MARKET intelligence:\n" +
"Answer from your knowledge. If the question needs live data (stock prices, latest earnings, news), say so clearly — the system will search the web for you.\n\n" +

"### For DRAFT requests:\n" +
"Write concise, professional text — email paragraphs, Slack messages, budget justifications, talking points.\n\n" +

"### For general QUESTION or CHAT:\n" +
"Be helpful, concise, and warm. You are a trusted colleague, not a formal bot.\n\n" +

"## " + USER_NAME + "'s Context\n" +
"- Senior finance professional at Zomato (Eternal Ltd), Gurgaon\n" +
"- Leads/closely involved in finance for food delivery business\n" +
"- Work spans FP&A, unit economics, business partnering, revenue & monetisation, merchant supply\n" +
"- Familiar with NOV, NAOV, take rate, CM1, CM2, BTPO, LCPO, JFM/AMJ quarter cycles\n" +
"- Plays tennis weekends, lives in Gurgaon gated society\n\n" +

"Remember: your replies will be SPOKEN ALOUD via Siri/voice. Keep them natural, conversational, and concise. No bullet points in speech — use flowing sentences. Avoid jargon overload in spoken replies but be precise with numbers.";

// ═══ Parse Intent ═══════════════════════════════════
async function parseIntent(userText) {
  var today = new Date();
  var dateStr = today.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  var timeStr = today.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  var message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: "Current: " + dateStr + ", " + timeStr + "\n\n" + USER_NAME + " says: \"" + userText + "\"" }],
  });

  var text = message.content.filter(function(b) { return b.type === "text"; }).map(function(b) { return b.text; }).join("");

  try {
    var cleaned = text.replace(/```json\n?|```/g, "").trim();
    var parsed = JSON.parse(cleaned);
    var result = {
      intent: parsed.intent || "CHAT",
      reply: parsed.reply || "I'm not sure how to help with that.",
      data: parsed.data || null,
    };

    // If market/live data needed, do a web search
    var livePattern = /price|stock|market|rate|score|weather|news|latest|current|today|live|nifty|sensex|crude|oil|gold|silver|bitcoin|crypto|dollar|rupee|exchange|barrel|cost|worth|how much|earnings|quarterly|results|revenue.*swiggy|revenue.*zomato|share price/i;
    if (livePattern.test(userText)) {
      try {
        var searchMsg = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: "Answer concisely in 2-3 sentences with the latest data. Plain text only, no JSON. Be specific with numbers and dates.",
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: userText }],
        });
        var searchReply = searchMsg.content.filter(function(b) { return b.type === "text"; }).map(function(b) { return b.text; }).join(" ").trim();
        if (searchReply && searchReply.length > 10) {
          result.reply = searchReply.slice(0, 600);
          result.intent = "MARKET";
        }
      } catch (searchErr) {
        console.log("  Web search failed: " + searchErr.message);
      }
    }

    return result;
  } catch (err) {
    return { intent: "CHAT", reply: text.slice(0, 400) || "Could not process that. Try rephrasing?", data: null };
  }
}

// ═══ Main Voice Endpoint ════════════════════════════
app.post("/ronny", async function(req, res) {
  try {
    var userText = typeof req.body === "string" ? req.body : (req.body.text || req.body.message);
    if (!userText || userText.trim().length === 0) return res.json({ reply: "I didn't catch that." });
    console.log("\n  \"" + userText + "\"");
    var result = await parseIntent(userText);
    console.log("  " + result.intent + " | " + result.reply.slice(0, 80) + "...");
    res.json({ reply: result.reply, intent: result.intent, data: result.data, deepLink: null });
  } catch (err) {
    console.error("  ERROR: " + err.message);
    res.json({ reply: "Something went wrong. Check if your API key has credits.", error: err.message });
  }
});

// ═══ Tasker / GET endpoint ══════════════════════════
app.get("/ronny/ask", async function(req, res) {
  var q = req.query.text || req.query.q || "";
  if (!q.trim()) return res.json({ reply: "Send ?text=your+question" });
  try {
    var result = await parseIntent(q);
    res.json({ reply: result.reply, intent: result.intent, data: result.data });
  } catch (err) {
    res.json({ reply: "Error: " + err.message });
  }
});

// ═══ Health Check ═══════════════════════════════════
app.get("/", function(req, res) {
  res.json({ status: "Ronny FPA Copilot is awake", version: "4.0.0" });
});

// ═══ Web App (works on iPhone, Android, Desktop) ═══
app.get("/app", function(req, res) {
  res.setHeader("Content-Type", "text/html");
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no"><meta name="theme-color" content="#09090B"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><title>Ronny</title><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;overflow:hidden}body{font-family:DM Sans,sans-serif;background:#09090B;color:#E4E4E7;display:flex;flex-direction:column}.hd{padding:16px 20px 10px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06)}.hd h1{font-size:22px;font-weight:700;background:linear-gradient(135deg,#F8FAFC,#22C55E);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.hd .sub{font-size:10px;color:#22C55E;margin-top:2px;letter-spacing:1px;text-transform:uppercase}.ch{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}.mg{max-width:88%;padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.6}.mg.u{align-self:flex-end;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.2);border-radius:14px 14px 4px 14px}.mg.r{align-self:flex-start;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.12);border-radius:14px 14px 14px 4px}.mg .lb{font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px}.mg.u .lb{color:#3B82F6}.mg.r .lb{color:#22C55E}.bt{padding:10px 14px 18px;border-top:1px solid rgba(255,255,255,.06)}.mr{display:flex;justify-content:center;margin-bottom:8px}.mc{width:60px;height:60px;border-radius:50%;border:2px solid rgba(34,197,94,.3);background:rgba(34,197,94,.08);display:flex;align-items:center;justify-content:center;cursor:pointer}.mc.on{border-color:#EF4444;background:rgba(239,68,68,.15)}.mc.th{border-color:#FBBF24;background:rgba(251,191,36,.1)}.mc svg{width:26px;height:26px;fill:#22C55E}.mc.on svg{fill:#EF4444}.mc.th svg{fill:#FBBF24}.ms{font-size:11px;color:#71717A;text-align:center;height:14px;margin-bottom:6px}.ir{display:flex;gap:8px}.ip{flex:1;padding:10px 12px;font:400 14px DM Sans,sans-serif;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;color:#E4E4E7;outline:none}.sb{padding:10px 14px;border-radius:10px;border:1px solid rgba(34,197,94,.3);background:rgba(34,197,94,.1);color:#22C55E;font:600 13px DM Sans,sans-serif;cursor:pointer}.qk{display:flex;gap:5px;overflow-x:auto;padding:8px 0 0}.qk::-webkit-scrollbar{height:0}.qk button{flex-shrink:0;padding:5px 10px;font:500 11px DM Sans,sans-serif;border-radius:7px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03);color:#71717A;cursor:pointer;white-space:nowrap}</style></head><body><div class="hd"><h1>Ronny</h1><div class="sub" id="st">FP&A Copilot</div></div><div class="ch" id="ch"></div><div class="bt"><div class="mr"><div class="mc" id="mc" onclick="tg()"><svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg></div></div><div class="ms" id="ms">Tap mic or type below</div><div class="ir"><input class="ip" id="ip" placeholder="Ask anything..." enterkeyhint="send"><button class="sb" onclick="st2()">Ask</button></div><div class="qk"><button onclick="sq(\'CM1 if take rate increases 50 bps\')">CM1 scenario</button><button onclick="sq(\'Walk me through the P&L waterfall\')">P&L waterfall</button><button onclick="sq(\'Zomato stock price\')">Stock price</button><button onclick="sq(\'Prep me for merchant supply review\')">Meeting prep</button><button onclick="sq(\'18% GST on 4.5 lakhs\')">Quick math</button><button onclick="sq(\'Compare Zomato vs Swiggy revenue\')">Competitor</button></div></div><script>var A=location.origin,S=window.SpeechRecognition||window.webkitSpeechRecognition,rc,li=0;if(S){rc=new S;rc.lang="en-IN";rc.onresult=function(e){sp();sd(e.results[0][0].transcript)};rc.onerror=function(){sp()};rc.onend=function(){if(li)sp()}}function tg(){if(!rc)return alert("No mic");if(li){rc.stop();sp()}else{rc.start();li=1;document.getElementById("mc").className="mc on";ss("Listening...")}}function sp(){li=0;document.getElementById("mc").className="mc";ss("Tap mic or type below")}function ss(t){document.getElementById("ms").textContent=t}function am(t,y){var c=document.getElementById("ch"),d=document.createElement("div");d.className="mg "+y;d.innerHTML="<div class=lb>"+(y=="u"?"YOU":"RONNY")+"</div><div>"+t+"</div>";c.appendChild(d);c.scrollTop=1e6}function sd(t){am(t,"u");document.getElementById("mc").className="mc th";ss("Thinking...");fetch(A+"/ronny",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t})}).then(function(r){return r.json()}).then(function(d){document.getElementById("mc").className="mc";ss("Tap mic or type below");am(d.reply,"r");if(speechSynthesis){var u=new SpeechSynthesisUtterance(d.reply);u.lang="en-IN";u.rate=1.05;speechSynthesis.speak(u)}}).catch(function(){document.getElementById("mc").className="mc";am("Could not reach Ronny. Check your internet or API credits.","r")})}function st2(){var i=document.getElementById("ip"),t=i.value.trim();if(t){i.value="";sd(t)}}function sq(t){sd(t)}document.getElementById("ip").onkeydown=function(e){if(e.key=="Enter")st2()};fetch(A+"/").then(function(r){return r.json()}).then(function(d){document.getElementById("st").textContent="FP&A Copilot v"+(d.version||"?")}).catch(function(){document.getElementById("st").textContent="Offline"})</script></body></html>');
});

// ═══ Start ══════════════════════════════════════════
var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("\n  Ronny FPA Copilot v4.0.0");
  console.log("  POST /ronny      — voice endpoint");
  console.log("  GET  /ronny/ask  — Tasker/browser endpoint");
  console.log("  GET  /app        — web app (iPhone/Android/Desktop)\n");
});
