// ╔══════════════════════════════════════════════════════╗
// ║  RONNY — Single File AI Agent                        ║
// ║  Deploy on Glitch.com in 2 minutes                   ║
// ╚══════════════════════════════════════════════════════╝

const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.json());
app.use(express.text());

// Allow requests from anywhere (desktop app, browser, iOS Shortcut)
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

// ─── Ronny's Brain (System Prompt) ──────────────────
const SYSTEM_PROMPT = `You are Ronny, ${USER_NAME}'s personal AI agent. You are sharp, warm, efficient, and slightly witty — like a trusted chief of staff.

You receive voice commands and must respond with a JSON object only (no markdown fences, no extra text):
{
  "intent": "LIGHTS | CALENDAR | CAB | FOOD | GROCERY | SHOPPING | WHATSAPP | TENNIS | MYGATE | REMINDER | QUESTION | MULTI | CHAT",
  "confidence": 0.0-1.0,
  "actions": [{ "type": "action_name", "params": { } }],
  "reply": "What Siri should say back (1-3 sentences, concise)",
  "deepLink": "app://url or null",
  "memoryUpdate": null
}

## Capabilities
- LIGHTS: scenes — morning, movie, away, goodnight, bright, relax
  Action: { "type": "lights_scene", "params": { "scene": "movie" } }
- CALENDAR: create events, check schedule
  Create: { "type": "calendar_create", "params": { "title": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "duration_minutes": 60 } }
  Query: { "type": "calendar_query", "params": { "date": "today|tomorrow" } }
- CAB: { "type": "cab_book", "params": { "service": "uber|ola", "destination": "..." } }
- FOOD: { "type": "food_order", "params": { "app": "zomato|swiggy", "restaurant": "restaurant name if specific", "search": "food item or cuisine to search for", "items_hint": "what they might want" } }
  IMPORTANT: When ${USER_NAME} names a specific restaurant (Bikanervala, Domino's etc.) → put it in "restaurant".
  When ${USER_NAME} says a food item or cuisine (coffee, biryani, pizza, Chinese) → put it in "search" and leave "restaurant" empty.
  When ${USER_NAME} says a food item that matches a favourite restaurant, use that restaurant name.
- GROCERY: { "type": "grocery_order", "params": { "app": "blinkit|bigbasket" } }
- SHOPPING: { "type": "shopping_search", "params": { "app": "amazon|flipkart", "query": "what to search for", "category": "electronics|fashion|home|beauty|books|grocery|mobiles|appliances" } }
  Use this for ANY product search, purchase, or shopping request. Default to Amazon unless ${USER_NAME} specifically says Flipkart.
- WHATSAPP: Send messages, open chats, or make calls on WhatsApp
  Message: { "type": "whatsapp_message", "params": { "contact": "person's name", "phone": "phone number with country code if known, or empty", "message": "the message text to pre-fill" } }
  Call: { "type": "whatsapp_call", "params": { "contact": "person's name", "phone": "phone number if known" } }
  Examples: "Message Amit saying I'll be 10 mins late" → whatsapp_message with message pre-filled
  "WhatsApp mom that I'm coming home" → whatsapp_message to mom
  "Call Priya on WhatsApp" → whatsapp_call
  NOTE: If you don't know the phone number, just open WhatsApp to the search screen so ${USER_NAME} can pick the contact.
- QUESTION: For any general knowledge question, factual query, opinion, advice, calculation, or anything that needs a smart answer.
  Action: { "type": "question_answer", "params": { "topic": "brief topic" } }
  Use this when ${USER_NAME} asks things like: "What's the capital of France?", "Explain machine learning", "What's 15% of 4500?", "Give me 3 interview tips", "What's the weather like in March in Goa?", "Compare mutual funds vs FDs", "How does UPI work?", etc.
  For QUESTION intent: your "reply" should be the FULL ANSWER — detailed, helpful, spoken naturally. This is where you act as a knowledgeable assistant, not just a command router. Give substantive 2-4 sentence answers. For calculations, give the result. For advice, be specific and actionable.
- TENNIS: { "type": "tennis_book", "params": { "day": "Saturday", "time": "07:00" } }
- MYGATE: { "type": "mygate_action", "params": { "action": "visitor_preapprove" } }

## ${USER_NAME}'s Preferences
- Works at Zomato, senior finance role, Gurgaon office
- Plays tennis on weekends, usually 7 AM
- Prefers Uber over Ola, Zomato for food, Blinkit for groceries
- Prefers Amazon over Flipkart for shopping
- Lives in gated society using MyGate

## ${USER_NAME}'s Saved Contacts (for WhatsApp)
If ${USER_NAME} mentions a contact by name and you know their number from this list, use it.
If you DON'T know the number, set phone to empty — the deep link will open WhatsApp so ${USER_NAME} can search for the contact.
(${USER_NAME} can add contacts here over time via memory updates)
contacts: {}
- Likes warm lighting in evening, bright during work

## ${USER_NAME}'s Favourite Restaurants (on Zomato)
- Bikanervala — usual order: Raj Kachori, Chole Bhature
- Haldiram's — go-to for quick snacks
- Burger King — when craving burgers
- Domino's — pizza nights
When ${USER_NAME} says "order the usual" or "order from the usual place", pick the most appropriate restaurant based on time of day (Bikanervala/Haldiram's for snacks, Burger King/Domino's for meals).
When ${USER_NAME} mentions a food item without a restaurant, match it to the right favourite restaurant.
When ${USER_NAME} searches for a cuisine or generic food item (coffee, biryani, Chinese, cake), use "search" param — Zomato's in-app search will show nearby options.
Examples:
- "Order coffee" → food_order(app: "zomato", search: "coffee") — opens Zomato search for coffee nearby
- "Find me biryani" → food_order(app: "zomato", search: "biryani")
- "Order from Bikanervala" → food_order(app: "zomato", restaurant: "bikanervala") — opens specific restaurant
- "Get me a pizza" → food_order(app: "zomato", restaurant: "dominos") — matches favourite

## ${USER_NAME}'s Favourite Restaurants (Zomato)
Use restaurant key in food_order params. Match food items to the right restaurant automatically.

| Key | Restaurant | Best For |
|-----|-----------|----------|
| bikanervala | Bikanervala | North Indian snacks — raj kachori, chole bhature, samosa, sweets, thali, chaat |
| haldirams | Haldiram's | Namkeen, sweets, chaat, south Indian, thali, quick snacks |
| burgerking | Burger King | Burgers, fries, whopper, chicken nuggets, shakes |
| dominos | Domino's | Pizza, garlic bread, pasta, chicken wings |

## Food Ordering Intelligence
- If ${USER_NAME} says "order raj kachori" → use restaurant "bikanervala" and mention "Opening Bikanervala on Zomato — raj kachori is in the Snacks section"
- If ${USER_NAME} says "order pizza" → use restaurant "dominos"  
- If ${USER_NAME} says "order a burger" → use restaurant "burgerking"
- If ${USER_NAME} says "something sweet" or "mithai" → use restaurant "haldirams" or "bikanervala"
- If ${USER_NAME} says "order the usual" or "order food" without specifics → ask which restaurant or suggest based on time (snacks in evening → Bikanervala/Haldiram's, lunch → any, late night → Domino's/Burger King)
- If ${USER_NAME} names a restaurant directly → open that one
- Always mention what to look for on the menu in your reply to be helpful

## Multi-Action Examples
- "Heading out for dinner at 8" → cab_book + calendar_create + lights_scene(away)
- "Good morning" → lights_scene(morning) + calendar_query(today)
- "Goodnight" → lights_scene(goodnight)
- "Search for wireless earbuds on Amazon" → shopping_search(amazon, "wireless earbuds", "electronics")
- "Find me a good phone case" → shopping_search(amazon, "phone case", "mobiles")
- "I need running shoes" → shopping_search(amazon, "running shoes", "sports")
- "Order batteries from Amazon" → shopping_search(amazon, "batteries")
- "Check Flipkart for laptops" → shopping_search(flipkart, "laptops", "electronics")
- "Buy a birthday gift" → shopping_search(amazon, "birthday gift")

When ${USER_NAME} says "buy", "order from Amazon", "search on Amazon", "find me", "I need" + a product → use shopping_search.
Default to Amazon unless Flipkart is specifically mentioned.
Be smart about the search query — extract the core product name and add useful qualifiers.

## WhatsApp Examples
- "Message Amit saying I'll be late" → whatsapp_message(contact: "Amit", message: "I'll be late")
- "WhatsApp mom I'm on my way" → whatsapp_message(contact: "Mom", message: "I'm on my way")
- "Send a WhatsApp to the team saying meeting pushed to 3" → whatsapp_message(contact: "team", message: "Meeting pushed to 3 PM")
- "Call Priya on WhatsApp" → whatsapp_call(contact: "Priya")
- "Open WhatsApp" → whatsapp_message(contact: "", message: "")

## Question / Knowledge Examples
- "What is EBITDA margin?" → QUESTION intent, reply with a clear explanation
- "What's 18% GST on 5000?" → QUESTION intent, reply: "18% GST on 5000 is 900, making the total 5,900."
- "Give me 3 tips for my investor pitch" → QUESTION intent, give 3 specific tips
- "Compare SIP vs lump sum investment" → QUESTION intent, give a balanced comparison
- "What's the oil barrel price?" → QUESTION intent, use web search to get current price
- "What's the Nifty at?" → QUESTION intent, use web search for real-time data
- "Latest news on RBI rate decision" → QUESTION intent, use web search for latest info
- "Zomato stock price" → QUESTION intent, use web search for current price
For QUESTION intent: your "reply" should be the FULL ANSWER. Use web search for ANY real-time data like prices, stock markets, news, weather, sports scores, exchange rates, etc. No deep links needed.

Be smart. Infer what ${USER_NAME} needs. Chain actions naturally.`;

// ─── Parse intent using Claude ──────────────────────
async function parseIntent(userText) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = today.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  // Step 1: Parse intent WITHOUT web search (clean JSON response)
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Current: ${dateStr}, ${timeStr}\n\n${USER_NAME} says: "${userText}"` }],
  });

  const text = message.content.filter(b => b.type === "text").map(b => b.text).join("");

  try {
    const cleaned = text.replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    let result = {
      intent: parsed.intent || "CHAT",
      confidence: parsed.confidence || 0.5,
      actions: parsed.actions || [],
      reply: parsed.reply || "Done.",
      deepLink: parsed.deepLink || null,
    };

    // Step 2: If QUESTION intent needs real-time data, do a web search call
    const needsLiveData = result.intent === "QUESTION" && 
      /price|stock|market|rate|score|weather|news|latest|current|today|live|nifty|sensex|crude|oil|gold|silver|bitcoin|crypto|dollar|rupee|exchange/i.test(userText);
    
    if (needsLiveData) {
      try {
        const searchMsg = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: "You are a helpful assistant. Answer the question concisely in 2-3 sentences with the latest data. Just give the answer as plain text, no JSON.",
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: userText }],
        });
        const searchReply = searchMsg.content.filter(b => b.type === "text").map(b => b.text).join(" ").trim();
        if (searchReply) {
          result.reply = searchReply.slice(0, 500);
        }
      } catch (searchErr) {
        console.log("  ⚠️ Web search failed:", searchErr.message);
        // Keep original reply from step 1
      }
    }

    return result;
  } catch (err) {
    // Fallback for non-JSON responses
    return {
      intent: "CHAT",
      confidence: 0.3,
      actions: [],
      reply: text.slice(0, 300) || "I understood you but had trouble processing. Try again?",
      deepLink: null,
    };
  }
}

// ─── Execute Actions ────────────────────────────────
async function executeActions(actions) {
  const results = [];
  for (const action of actions) {
    try {
      switch (action.type) {
        case "lights_scene":
          if (IFTTT_KEY) {
            const scene = action.params?.scene || "bright";
            const event = "ronny_" + (scene === "movie" ? "movie_mode" : scene);
            await fetch(`https://maker.ifttt.com/trigger/${event}/with/key/${IFTTT_KEY}`, { method: "POST" });
            results.push({ type: action.type, status: "triggered", scene });
          } else {
            results.push({ type: action.type, status: "dry_run", scene: action.params?.scene });
          }
          break;

        case "calendar_create":
          if (CALENDAR_URL) {
            const resp = await fetch(CALENDAR_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "create", ...action.params }),
            });
            results.push({ type: action.type, status: "created", data: await resp.json() });
          } else {
            results.push({ type: action.type, status: "dry_run", params: action.params });
          }
          break;

        case "calendar_query":
          if (CALENDAR_URL) {
            const date = action.params?.date || "today";
            const resp = await fetch(CALENDAR_URL + "?action=" + date);
            results.push({ type: action.type, status: "fetched", data: await resp.json() });
          } else {
            results.push({ type: action.type, status: "dry_run" });
          }
          break;

        case "cab_book":
          const service = action.params?.service || "uber";
          const dest = encodeURIComponent(action.params?.destination || "");
          const cabLink = service === "uber"
            ? (dest ? `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=${dest}` : "https://m.uber.com/ul/")
            : "https://olawebcdn.com/assets/ola-universal-link.html";
          results.push({ type: action.type, status: "link_generated", deepLink: cabLink });
          break;

        case "food_order":
          const foodApp = action.params?.app || "zomato";
          const restaurant = (action.params?.restaurant || "").toLowerCase();
          const foodSearch = (action.params?.search || action.params?.items_hint || "").toLowerCase();
          const FAVOURITE_RESTAURANTS = {
            "bikanervala": "Bikanervala",
            "haldirams": "Haldirams",
            "haldiram's": "Haldirams",
            "burger king": "Burger King",
            "dominos": "Dominos",
            "domino's": "Dominos",
          };
          const matchedFav = Object.keys(FAVOURITE_RESTAURANTS).find(name => restaurant.includes(name));
          let foodLink;
          if (foodApp === "zomato" || !foodApp) {
            const searchTerm = matchedFav ? FAVOURITE_RESTAURANTS[matchedFav] : (restaurant || foodSearch || "");
            if (searchTerm) {
              // Use Zomato app scheme — opens search inside the app
              foodLink = `zomato://search?q=${encodeURIComponent(searchTerm)}`;
            } else {
              foodLink = "zomato://";
            }
          } else {
            // Swiggy
            const swiggyTerm = restaurant || foodSearch || "";
            foodLink = swiggyTerm ? `swiggy://search?query=${encodeURIComponent(swiggyTerm)}` : "swiggy://";
          }
          results.push({ type: action.type, status: "link_generated", deepLink: foodLink });
          break;

        case "grocery_order":
          const groceryApp = action.params?.app || "blinkit";
          const groceryLink = groceryApp === "blinkit" ? "https://blinkit.com" : "https://www.bigbasket.com";
          results.push({ type: action.type, status: "link_generated", deepLink: groceryLink });
          break;

        case "shopping_search":
          const shopApp = action.params?.app || "amazon";
          const shopQuery = action.params?.query || "";
          const shopCategory = action.params?.category || "";
          let shopLink;

          if (shopApp === "amazon") {
            // Amazon.in universal link — opens directly in Amazon app
            if (shopQuery) {
              const amazonParams = new URLSearchParams({ k: shopQuery });
              if (shopCategory) {
                // Amazon category node mapping
                const AMAZON_CATEGORIES = {
                  "electronics": "electronics",
                  "mobiles": "mobile-phones",
                  "fashion": "fashion",
                  "home": "home-garden",
                  "beauty": "beauty",
                  "books": "books",
                  "grocery": "grocery",
                  "appliances": "appliances",
                  "toys": "toys",
                  "sports": "sports",
                  "kitchen": "kitchen",
                };
                const catSlug = AMAZON_CATEGORIES[shopCategory] || shopCategory;
                shopLink = `https://www.amazon.in/s?k=${encodeURIComponent(shopQuery)}&i=aps&ref=nb_sb_noss`;
              } else {
                shopLink = `https://www.amazon.in/s?k=${encodeURIComponent(shopQuery)}`;
              }
            } else {
              shopLink = "https://www.amazon.in";
            }
          } else {
            // Flipkart
            if (shopQuery) {
              shopLink = `https://www.flipkart.com/search?q=${encodeURIComponent(shopQuery)}`;
            } else {
              shopLink = "https://www.flipkart.com";
            }
          }

          results.push({ type: action.type, status: "link_generated", deepLink: shopLink, query: shopQuery, app: shopApp });
          break;

        case "tennis_book":
          results.push({ type: action.type, status: "link_generated", deepLink: "mygate://amenities" });
          break;

        case "mygate_action":
          const myAction = action.params?.action || "services";
          results.push({ type: action.type, status: "link_generated", deepLink: myAction === "visitor_preapprove" ? "mygate://visitors/preapprove" : "mygate://" });
          break;

        case "whatsapp_message":
          const waContact = action.params?.contact || "";
          const waPhone = action.params?.phone || "";
          const waMessage = action.params?.message || "";
          let waLink;

          if (waPhone) {
            // Direct link with phone number (must include country code, e.g., 91XXXXXXXXXX)
            const cleanPhone = waPhone.replace(/[^0-9]/g, "");
            const phoneWithCode = cleanPhone.startsWith("91") ? cleanPhone : "91" + cleanPhone;
            if (waMessage) {
              waLink = `https://wa.me/${phoneWithCode}?text=${encodeURIComponent(waMessage)}`;
            } else {
              waLink = `https://wa.me/${phoneWithCode}`;
            }
          } else if (waMessage && !waContact) {
            // No contact, no phone — just open WhatsApp with text ready to share
            waLink = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;
          } else {
            // No phone number — open WhatsApp (user picks contact)
            // On iOS, whatsapp:// opens the app directly
            waLink = "https://wa.me/";
          }
          results.push({ type: action.type, status: "link_generated", deepLink: waLink, contact: waContact });
          break;

        case "whatsapp_call":
          const callPhone = (action.params?.phone || "").replace(/[^0-9]/g, "");
          if (callPhone) {
            const callPhoneWithCode = callPhone.startsWith("91") ? callPhone : "91" + callPhone;
            results.push({ type: action.type, status: "link_generated", deepLink: `https://wa.me/${callPhoneWithCode}` });
          } else {
            // Can't deep-link to a call without a number — open WhatsApp
            results.push({ type: action.type, status: "link_generated", deepLink: "https://wa.me/" });
          }
          break;

        case "question_answer":
          // No action needed — the answer is in parsed.reply
          results.push({ type: action.type, status: "answered", topic: action.params?.topic || "general" });
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

// ─── Main Endpoint ──────────────────────────────────
app.post("/ronny", async (req, res) => {
  try {
    const userText = typeof req.body === "string" ? req.body : req.body.text || req.body.message;
    if (!userText || userText.trim().length === 0) {
      return res.json({ reply: "I didn't catch that. Try again?" });
    }

    console.log(`\n🎤 "${userText}"`);
    const parsed = await parseIntent(userText);
    console.log(`🧠 ${parsed.intent} | 💬 ${parsed.reply}`);

    const results = await executeActions(parsed.actions);

    // Find primary deep-link: check parsed.deepLink first, then action results
    let deepLink = parsed.deepLink || null;
    if (!deepLink) {
      for (const r of results) {
        if (r.deepLink) {
          deepLink = r.deepLink;
          break;
        }
      }
    }

    console.log(`🔗 deepLink: ${deepLink || "none"}`);

    res.json({ reply: parsed.reply, intent: parsed.intent, actions: results, deepLink: deepLink });
  } catch (err) {
    console.error("❌", err.message);
    res.json({ reply: "Something went wrong. Try again in a sec.", error: err.message });
  }
});

// ─── Debug Test Endpoint (GET) ──────────────────────
// Test: https://your-url/ronny/test?q=coffee+on+zomato
app.get("/ronny/test", async (req, res) => {
  const q = req.query.q || "order coffee on zomato";
  try {
    const parsed = await parseIntent(q);
    const results = await executeActions(parsed.actions);
    let deepLink = parsed.deepLink || null;
    if (!deepLink) {
      for (const r of results) {
        if (r.deepLink) { deepLink = r.deepLink; break; }
      }
    }
    res.json({ query: q, intent: parsed.intent, reply: parsed.reply, deepLink, actions: results, rawParsed: parsed });
  } catch (err) {
    res.json({ query: q, error: err.message });
  }
});

// ─── Calendar Quick View ────────────────────────────
app.get("/ronny/today", async (req, res) => {
  try {
    if (CALENDAR_URL) {
      const resp = await fetch(CALENDAR_URL + "?action=today");
      const data = await resp.json();
      const count = data.events?.length || 0;
      const reply = count === 0
        ? "Your day is clear — no meetings."
        : `You have ${count} event${count > 1 ? "s" : ""} today: ${data.events.map(e => e.title).join(", ")}.`;
      res.json({ reply, events: data.events });
    } else {
      res.json({ reply: "Calendar not connected yet. Add GOOGLE_APPS_SCRIPT_URL to connect.", events: [] });
    }
  } catch (err) {
    res.json({ reply: "Couldn't fetch calendar.", error: err.message });
  }
});

// ─── Health Check ───────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "🟢 Ronny is awake", version: "1.0.0" });
});

// ─── Start ──────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🤖 Ronny is listening on port ${PORT}`);
  console.log(`   POST /ronny       — main voice endpoint`);
  console.log(`   GET  /ronny/today — today's calendar\n`);
});
