require("dotenv").config();
const express = require("express");
const { parseIntent } = require("./intent-parser");
const { executeActions } = require("./action-router");
const { getMemory, saveMemory } = require("./memory");

const app = express();
app.use(express.json());
app.use(express.text());  // Allow requests from anywhere (desktop app, browser, iOS Shortcut) app.use((req, res, next) => {   res.header("Access-Control-Allow-Origin", "*");   res.header("Access-Control-Allow-Headers", "Content-Type");   res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");   if (req.method === "OPTIONS") return res.sendStatus(200);   next(); });

// ─── Health check ────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "🟢 Ronny is awake", version: "1.0.0" });
});

// ─── Main endpoint: iOS Shortcut sends voice text here ─
app.post("/ronny", async (req, res) => {
  try {
    // Accept both JSON { "text": "..." } and plain text body
    const userText =
      typeof req.body === "string" ? req.body : req.body.text || req.body.message;

    if (!userText || userText.trim().length === 0) {
      return res.json({ reply: "I didn't catch that. Try again?" });
    }

    console.log(`\n🎤 You said: "${userText}"`);

    // Step 1: Load memory (preferences, recent context)
    const memory = getMemory();

    // Step 2: Parse intent using Claude
    const parsed = await parseIntent(userText, memory);
    console.log(`🧠 Intent: ${parsed.intent} | Confidence: ${parsed.confidence}`);
    console.log(`📋 Actions:`, JSON.stringify(parsed.actions, null, 2));

    // Step 3: Execute actions (calendar, lights, deep-links, etc.)
    const results = await executeActions(parsed);

    // Step 4: Save any new memory/preferences
    if (parsed.memoryUpdate) {
      saveMemory(parsed.memoryUpdate);
    }

    // Step 5: Return Ronny's spoken reply
    const reply = parsed.reply || "Done.";
    console.log(`💬 Ronny: "${reply}"`);

    res.json({
      reply,
      intent: parsed.intent,
      actions: results,
      // Include deep-links for iOS Shortcut to open
      deepLink: parsed.deepLink || null,
    });
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.json({
      reply: "Something went wrong on my end. Try again in a sec.",
      error: err.message,
    });
  }
});

// ─── Quick action endpoint (for simple commands) ─────
app.post("/ronny/quick", async (req, res) => {
  const action = req.body.action; // e.g., "lights_off", "movie_mode"
  try {
    const results = await executeActions({
      intent: action,
      actions: [{ type: action }],
    });
    res.json({ reply: `Done — ${action.replace(/_/g, " ")}.`, actions: results });
  } catch (err) {
    res.json({ reply: "Couldn't do that right now.", error: err.message });
  }
});

// ─── Calendar quick-view endpoint ────────────────────
app.get("/ronny/today", async (req, res) => {
  try {
    const { getTodayEvents } = require("./actions/calendar");
    const events = await getTodayEvents();
    const count = events.length;
    const reply =
      count === 0
        ? "Your day is clear — no meetings."
        : `You have ${count} event${count > 1 ? "s" : ""} today: ${events.map((e) => e.summary).join(", ")}.`;
    res.json({ reply, events });
  } catch (err) {
    res.json({ reply: "Couldn't fetch your calendar right now." });
  }
});

// ─── Start server ────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🤖 Ronny is listening on port ${PORT}`);
  console.log(`   POST /ronny        — main voice endpoint`);
  console.log(`   POST /ronny/quick  — quick action trigger`);
  console.log(`   GET  /ronny/today  — today's calendar\n`);
});
