const fs = require("fs");
const path = require("path");

// ─── Simple JSON file-based memory ───────────────────
// In production, swap this for Supabase/Firebase/Redis
// For now, a local JSON file works great.

const MEMORY_FILE = path.join(__dirname, "..", "data", "memory.json");

// Default preferences (Ronny knows these from day 1)
const DEFAULT_MEMORY = {
  preferences: {
    cab_service: "uber",
    food_app: "zomato",
    grocery_app: "blinkit",
    tennis_day: "Saturday",
    tennis_time: "07:00",
    morning_light_scene: "morning",
    evening_light_scene: "relax",
    work_location: "Zomato HQ, Gurgaon",
  },
  favourites: {
    restaurants: [],
    addresses: {
      office: "Zomato HQ, Golf Course Road, Gurgaon",
      home: "", // User can set this
    },
  },
  recentActions: [],
  conversationCount: 0,
};

// Ensure data directory exists
function ensureDataDir() {
  const dir = path.dirname(MEMORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ─── Read memory ─────────────────────────────────────
function getMemory() {
  ensureDataDir();
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const raw = fs.readFileSync(MEMORY_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("⚠️  Memory read error:", err.message);
  }
  // Return defaults if no file or error
  return { ...DEFAULT_MEMORY };
}

// ─── Save/update memory ──────────────────────────────
function saveMemory(updates) {
  ensureDataDir();
  const current = getMemory();

  // Merge updates into current memory
  if (updates.preferences) {
    current.preferences = { ...current.preferences, ...updates.preferences };
  }
  if (updates.favourites) {
    current.favourites = { ...current.favourites, ...updates.favourites };
  }
  if (updates.lastAction) {
    current.recentActions = [
      { ...updates.lastAction, timestamp: new Date().toISOString() },
      ...current.recentActions.slice(0, 19), // Keep last 20
    ];
  }

  current.conversationCount = (current.conversationCount || 0) + 1;

  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(current, null, 2), "utf-8");
    console.log("  💾 Memory updated");
  } catch (err) {
    console.error("⚠️  Memory write error:", err.message);
  }
}

// ─── Reset memory to defaults ────────────────────────
function resetMemory() {
  ensureDataDir();
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(DEFAULT_MEMORY, null, 2), "utf-8");
  console.log("  🔄 Memory reset to defaults");
}

module.exports = { getMemory, saveMemory, resetMemory };
