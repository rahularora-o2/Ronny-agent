const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.json());
app.use(express.text());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const client = new Anthropic();
const USER_NAME = process.env.USER_NAME || "Rahul";
const CALENDAR_URL = process.env.GOOGLE_APPS_SCRIPT_URL || "";
const IFTTT_KEY = process.env.IFTTT_WEBHOOK_KEY || "";

const SYSTEM_PROMPT = `You are Ronny, ${USER_NAME}'s personal AI agent. You are sharp, warm, efficient, and slightly witty.

You receive voice commands and must respond with a JSON object only (no markdown fences, no extra text):
{
  "intent": "LIGHTS | CALENDAR | CAB | FOOD | GROCERY | SHOPPING | WHATSAPP | TENNIS | MYGATE | REMINDER | QUESTION | MULTI | CHAT",
  "confidence": 0.0-1.0,
  "actions": [{ "type": "action_name", "params": { } }],
  "reply": "What to say back (1-3 sentences, concise)",
  "deepLink": null,
  "memoryUpdate": null
}

## Capabilities
- LIGHTS: scenes: morning, movie, away, goodnight, bright, relax
  Action: { "type": "lights_scene", "params": { "scene": "movie" } }
- CALENDAR: create events, check schedule
  Create: { "type": "calendar_create", "params": { "title": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "duration_minutes": 60 } }
  Query: { "type": "calendar_query", "params": { "date": "today|tomorrow" } }
- CAB: { "type": "cab_book", "params": { "service": "uber|ola", "destination": "..." } }
- FOOD: { "type": "food_order", "params": { "app": "zomato|swiggy", "restaurant": "restaurant name if specific", "search": "food item or cuisine to search for" } }
  When ${USER_NAME} names a specific restaurant, put it in "restaurant". When a food item or cuisine (coffee, biryani, pizza, Chinese), put it in "search".
- GROCERY: { "type": "grocery_order", "params": { "app": "blinkit|bigbasket" } }
- SHOPPING: { "type": "shopping_search", "params": { "app": "amazon|flipkart", "query": "search terms", "category": "electronics|fashion|home" } }
- WHATSAPP: { "type": "whatsapp_message", "params": { "contact": "name", "phone": "", "message": "text" } }
  Call: { "type": "whatsapp_call", "params": { "contact": "name", "phone": "" } }
- QUESTION: { "type": "question_answer", "params": { "topic": "brief topic" } }
  Use for ANY knowledge question, calculation, advice, opinion. Give substantive 2-4 sentence answers.
- TENNIS: { "type": "tennis_book", "params": { "day": "Saturday", "time": "07:00" } }
- MYGATE: { "type": "mygate_action", "params": { "action": "visitor_preapprove" } }

## ${USER_NAME}'s Preferences
- Works at Zomato, senior finance role, Gurgaon
- Plays tennis weekends, usually 7 AM
- Prefers Uber over Ola, Zomato for food, Blinkit for groceries, Amazon for shopping
- Lives in gated society using MyGate
- Favourite restaurants: Bikanervala, Haldiram's, Burger King, Domino's

## Multi-Action Examples
- "Heading out for dinner at 8" -> cab_book + calendar_create + lights_scene(away)
- "Good morning" -> lights_scene(morning) + calendar_query(today)
- "Order coffee" -> food_order(search: "coffee")
- "Order from Bikanervala" -> food_order(restaurant: "bikanervala")
- "Search Amazon for earbuds" -> shopping_search(amazon, "earbuds")
- "Message mom on WhatsApp saying I'll be late" -> whatsapp_message
- "What is EBITDA?" -> QUESTION with full answer in reply
- "What is crude oil price?" -> QUESTION (answer from your knowledge)

Be smart. Chain actions naturally.`;

async function parseIntent(userText) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = today.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: "Current: " + dateStr + ", " + timeStr + "\n\n" + USER_NAME + ' says: "' + userText + '"' }],
  });

  const text = message.content.filter(function(b) { return b.type === "text"; }).map(function(b) { return b.text; }).join("");

  try {
    const cleaned = text.replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    var result = {
      intent: parsed.intent || "CHAT",
      confidence: parsed.confidence || 0.5,
      actions: parsed.actions || [],
      reply: parsed.reply || "Done.",
      deepLink: parsed.deepLink || null,
    };

    // If QUESTION needs live data, do a web search
    var livePattern = /price|stock|market|rate|score|weather|news|latest|current|today|live|nifty|sensex|crude|oil|gold|silver|bitcoin|crypto|dollar|rupee|exchange|barrel|cost|worth|how much/i;
    if (result.intent === "QUESTION" && livePattern.test(userText)) {
      try {
        var searchMsg = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: "Answer concisely in 2-3 sentences with current data. Plain text only, no JSON.",
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: userText }],
        });
        var searchReply = searchMsg.content.filter(function(b) { return b.type === "text"; }).map(function(b) { return b.text; }).join(" ").trim();
        if (searchReply) result.reply = searchReply.slice(0, 500);
      } catch (searchErr) {
        console.log("  Web search failed:", searchErr.message);
      }
    }

    return result;
  } catch (err) {
    return { intent: "CHAT", confidence: 0.3, actions: [], reply: text.slice(0, 300) || "Try again?", deepLink: null };
  }
}

async function executeActions(actions) {
  var results = [];
  for (var i = 0; i < actions.length; i++) {
    var action = actions[i];
    try {
      switch (action.type) {
        case "lights_scene":
          if (IFTTT_KEY) {
            var scene = (action.params && action.params.scene) || "bright";
            var event = "ronny_" + (scene === "movie" ? "movie_mode" : scene);
            await fetch("https://maker.ifttt.com/trigger/" + event + "/with/key/" + IFTTT_KEY, { method: "POST" });
            results.push({ type: action.type, status: "triggered", scene: scene });
          } else {
            results.push({ type: action.type, status: "dry_run" });
          }
          break;

        case "calendar_create":
          if (CALENDAR_URL) {
            var cResp = await fetch(CALENDAR_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ action: "create" }, action.params)) });
            results.push({ type: action.type, status: "created", data: await cResp.json() });
          } else {
            results.push({ type: action.type, status: "dry_run", params: action.params });
          }
          break;

        case "calendar_query":
          if (CALENDAR_URL) {
            var qDate = (action.params && action.params.date) || "today";
            var qResp = await fetch(CALENDAR_URL + "?action=" + qDate);
            results.push({ type: action.type, status: "fetched", data: await qResp.json() });
          } else {
            results.push({ type: action.type, status: "dry_run" });
          }
          break;

        case "cab_book":
          var cabService = (action.params && action.params.service) || "uber";
          var cabDest = encodeURIComponent((action.params && action.params.destination) || "");
          var cabLink = cabService === "uber"
            ? (cabDest ? "https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=" + cabDest : "https://m.uber.com/ul/")
            : "https://olawebcdn.com/assets/ola-universal-link.html";
          results.push({ type: action.type, status: "link_generated", deepLink: cabLink });
          break;

        case "food_order":
          var foodRestaurant = ((action.params && action.params.restaurant) || "").toLowerCase();
          var foodSearch = ((action.params && action.params.search) || (action.params && action.params.items_hint) || "").toLowerCase();
          var favs = { "bikanervala": "Bikanervala", "haldirams": "Haldirams", "haldiram's": "Haldirams", "burger king": "Burger King", "dominos": "Dominos", "domino's": "Dominos" };
          var matchedFav = null;
          Object.keys(favs).forEach(function(name) { if (foodRestaurant.includes(name)) matchedFav = name; });
          var foodTerm = matchedFav ? favs[matchedFav] : (foodRestaurant || foodSearch || "");
          var foodLink = foodTerm
            ? "https://www.zomato.com/gurgaon/search?q=" + encodeURIComponent(foodTerm)
            : "https://www.zomato.com/gurgaon";
          results.push({ type: action.type, status: "link_generated", deepLink: foodLink });
          break;

        case "grocery_order":
          var groceryApp = (action.params && action.params.app) || "blinkit";
          var groceryLink = groceryApp === "blinkit" ? "https://blinkit.com" : "https://www.bigbasket.com";
          results.push({ type: action.type, status: "link_generated", deepLink: groceryLink });
          break;

        case "shopping_search":
          var shopApp = (action.params && action.params.app) || "amazon";
          var shopQuery = (action.params && action.params.query) || "";
          var shopLink;
          if (shopApp === "amazon") {
            shopLink = shopQuery ? "https://www.amazon.in/s?k=" + encodeURIComponent(shopQuery) : "https://www.amazon.in";
          } else {
            shopLink = shopQuery ? "https://www.flipkart.com/search?q=" + encodeURIComponent(shopQuery) : "https://www.flipkart.com";
          }
          results.push({ type: action.type, status: "link_generated", deepLink: shopLink });
          break;

        case "tennis_book":
          results.push({ type: action.type, status: "link_generated", deepLink: "https://mygate.com" });
          break;

        case "mygate_action":
          results.push({ type: action.type, status: "link_generated", deepLink: "https://mygate.com" });
          break;

        case "whatsapp_message":
          var waPhone = ((action.params && action.params.phone) || "").replace(/[^0-9]/g, "");
          var waMsg = (action.params && action.params.message) || "";
          var waLink;
          if (waPhone) {
            var ph = waPhone.startsWith("91") ? waPhone : "91" + waPhone;
            waLink = waMsg ? "https://wa.me/" + ph + "?text=" + encodeURIComponent(waMsg) : "https://wa.me/" + ph;
          } else if (waMsg) {
            waLink = "https://wa.me/?text=" + encodeURIComponent(waMsg);
          } else {
            waLink = "https://wa.me/";
          }
          results.push({ type: action.type, status: "link_generated", deepLink: waLink });
          break;

        case "whatsapp_call":
          var callPh = ((action.params && action.params.phone) || "").replace(/[^0-9]/g, "");
          results.push({ type: action.type, status: "link_generated", deepLink: callPh ? "https://wa.me/" + (callPh.startsWith("91") ? callPh : "91" + callPh) : "https://wa.me/" });
          break;

        case "question_answer":
          results.push({ type: action.type, status: "answered" });
          break;

        default:
          results.push({ type: action.type, status: "skipped" });
      }
    } catch (err) {
      results.push({ type: action.type, status: "failed", error: err.message });
    }
  }
  return results;
}

app.post("/ronny", async function(req, res) {
  try {
    var userText = typeof req.body === "string" ? req.body : (req.body.text || req.body.message);
    if (!userText || userText.trim().length === 0) return res.json({ reply: "I didn't catch that." });
    console.log('\n  "' + userText + '"');
    var parsed = await parseIntent(userText);
    console.log("  " + parsed.intent + " | " + parsed.reply);
    var results = await executeActions(parsed.actions);
    var deepLink = parsed.deepLink || null;
    for (var i = 0; i < results.length; i++) { if (results[i].deepLink) { deepLink = results[i].deepLink; break; } }
    console.log("  link: " + (deepLink || "none"));
    res.json({ reply: parsed.reply, intent: parsed.intent, actions: results, deepLink: deepLink });
  } catch (err) {
    console.error("  ERROR:", err.message);
    res.json({ reply: "Something went wrong. Try again.", error: err.message });
  }
});

app.get("/ronny/ask", async function(req, res) {
  var q = req.query.text || req.query.q || "";
  if (!q.trim()) return res.json({ reply: "Send ?text=your+command" });
  try {
    var parsed = await parseIntent(q);
    var results = await executeActions(parsed.actions);
    var dl = parsed.deepLink || null;
    for (var i = 0; i < results.length; i++) { if (results[i].deepLink) { dl = results[i].deepLink; break; } }
    res.json({ reply: parsed.reply, intent: parsed.intent, deepLink: dl, actions: results });
  } catch (err) {
    res.json({ reply: "Error", error: err.message });
  }
});

app.get("/ronny/today", async function(req, res) {
  try {
    if (CALENDAR_URL) {
      var resp = await fetch(CALENDAR_URL + "?action=today");
      var data = await resp.json();
      var count = (data.events && data.events.length) || 0;
      var reply = count === 0 ? "Your day is clear." : "You have " + count + " events today: " + data.events.map(function(e) { return e.title; }).join(", ") + ".";
      res.json({ reply: reply, events: data.events });
    } else {
      res.json({ reply: "Calendar not connected.", events: [] });
    }
  } catch (err) {
    res.json({ reply: "Calendar error.", error: err.message });
  }
});

app.get("/", function(req, res) { res.json({ status: "Ronny is awake", version: "3.0.0" }); });

app.get("/manifest.json", function(req, res) {
  res.json({ name: "Ronny", short_name: "Ronny", start_url: "/app", display: "standalone", background_color: "#09090B", theme_color: "#09090B" });
});

app.get("/app", function(req, res) {
  res.setHeader("Content-Type", "text/html");
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no"><meta name="theme-color" content="#09090B"><meta name="mobile-web-app-capable" content="yes"><title>Ronny</title><link rel="manifest" href="/manifest.json"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;overflow:hidden}body{font-family:DM Sans,sans-serif;background:#09090B;color:#E4E4E7;display:flex;flex-direction:column}.hd{padding:16px 20px 12px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06)}.hd h1{font-size:24px;font-weight:700;background:linear-gradient(135deg,#F8FAFC,#A855F7);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.hd .st{font-size:11px;color:#22C55E;margin-top:4px}.ch{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}.mg{max-width:85%;padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.5}.mg.u{align-self:flex-end;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.2);border-radius:14px 14px 4px 14px}.mg.r{align-self:flex-start;background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.15);border-radius:14px 14px 14px 4px}.mg .lb{font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px}.mg.u .lb{color:#3B82F6}.mg.r .lb{color:#A855F7}.mg .lk{display:inline-block;margin-top:6px;padding:5px 12px;border-radius:6px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);color:#22C55E;font-size:12px;font-weight:600;text-decoration:none}.bt{padding:12px 16px 20px;border-top:1px solid rgba(255,255,255,.06)}.mr{display:flex;justify-content:center;margin-bottom:10px}.mc{width:64px;height:64px;border-radius:50%;border:2px solid rgba(168,85,247,.3);background:rgba(168,85,247,.1);display:flex;align-items:center;justify-content:center;cursor:pointer}.mc.on{border-color:#EF4444;background:rgba(239,68,68,.15)}.mc.th{border-color:#FBBF24;background:rgba(251,191,36,.1)}.mc svg{width:28px;height:28px;fill:#A855F7}.mc.on svg{fill:#EF4444}.mc.th svg{fill:#FBBF24}.ms{font-size:12px;color:#71717A;text-align:center;height:16px;margin-bottom:8px}.ir{display:flex;gap:8px}.ip{flex:1;padding:10px 14px;font:400 14px DM Sans,sans-serif;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;color:#E4E4E7;outline:none}.sb{padding:10px 16px;border-radius:10px;border:1px solid rgba(168,85,247,.3);background:rgba(168,85,247,.12);color:#C084FC;font:600 14px DM Sans,sans-serif;cursor:pointer}.qk{display:flex;gap:6px;overflow-x:auto;padding:8px 0 0}.qk button{flex-shrink:0;padding:6px 12px;font:500 12px DM Sans,sans-serif;border-radius:8px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03);color:#71717A;cursor:pointer;white-space:nowrap}</style></head><body><div class="hd"><h1>Ronny</h1><div class="st" id="st">Connecting...</div></div><div class="ch" id="ch"></div><div class="bt"><div class="mr"><div class="mc" id="mc" onclick="tg()"><svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg></div></div><div class="ms" id="ms">Tap mic or type below</div><div class="ir"><input class="ip" id="ip" placeholder="Type a command..." enterkeyhint="send"><button class="sb" onclick="st2()">Send</button></div><div class="qk"><button onclick="sq(\'Coffee on Zomato\')">Coffee</button><button onclick="sq(\'Book cab to office\')">Cab</button><button onclick="sq(\'Amazon earbuds\')">Amazon</button><button onclick="sq(\'WhatsApp mom saying will be late\')">WhatsApp</button><button onclick="sq(\'Crude oil price\')">Oil Price</button><button onclick="sq(\'Goodnight\')">Night</button></div></div><script>var A=location.origin,S=window.SpeechRecognition||window.webkitSpeechRecognition,rc,li=0;if(S){rc=new S;rc.lang="en-IN";rc.onresult=function(e){sp();sd(e.results[0][0].transcript)};rc.onerror=function(){sp()};rc.onend=function(){if(li)sp()}}function tg(){if(!rc)return alert("No mic");if(li){rc.stop();sp()}else{rc.start();li=1;document.getElementById("mc").className="mc on";ss("Listening...")}}function sp(){li=0;document.getElementById("mc").className="mc";ss("Tap mic or type below")}function ss(t){document.getElementById("ms").textContent=t}function am(t,y,l){var c=document.getElementById("ch"),d=document.createElement("div");d.className="mg "+y;d.innerHTML="<div class=lb>"+(y=="u"?"YOU":"RONNY")+"</div><div>"+t+"</div>"+(l&&y=="r"?"<a class=lk href="+l+" target=_blank>Open App</a>":"");c.appendChild(d);c.scrollTop=1e6}function sd(t){am(t,"u");document.getElementById("mc").className="mc th";ss("Thinking...");fetch(A+"/ronny",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t})}).then(function(r){return r.json()}).then(function(d){document.getElementById("mc").className="mc";ss("Tap mic or type below");am(d.reply,"r",d.deepLink);if(speechSynthesis){var u=new SpeechSynthesisUtterance(d.reply);u.lang="en-IN";u.rate=1.05;speechSynthesis.speak(u)}if(d.deepLink)setTimeout(function(){window.open(d.deepLink,"_blank")},1500)}).catch(function(){document.getElementById("mc").className="mc";am("Could not reach Ronny.","r")})}function st2(){var i=document.getElementById("ip"),t=i.value.trim();if(t){i.value="";sd(t)}}function sq(t){sd(t)}document.getElementById("ip").onkeydown=function(e){if(e.key=="Enter")st2()};fetch(A+"/").then(function(r){return r.json()}).then(function(d){document.getElementById("st").textContent="Online v"+d.version}).catch(function(){document.getElementById("st").textContent="Offline"})</script></body></html>');
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("\nRonny is listening on port " + PORT);
  console.log("  POST /ronny      - voice endpoint");
  console.log("  GET  /ronny/ask  - Tasker endpoint");
  console.log("  GET  /app        - Android/Desktop PWA\n");
});
