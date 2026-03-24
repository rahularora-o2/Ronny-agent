// ─── Smart Lights via IFTTT Webhooks → Alexa Routines ─
// 
// How this works:
// 1. You create IFTTT applets that trigger Alexa routines
// 2. Each scene maps to an IFTTT webhook event name
// 3. Ronny fires the webhook → IFTTT → Alexa → Lights change
//
// Setup: 
// - Go to ifttt.com → Create Applet
// - IF: Webhooks (receive web request), event name = "ronny_movie_mode"
// - THEN: Alexa (trigger routine named "Movie Mode")
// - Repeat for each scene

const IFTTT_KEY = process.env.IFTTT_WEBHOOK_KEY;
const IFTTT_BASE = "https://maker.ifttt.com/trigger";

// Map scene names to IFTTT webhook event names
const SCENE_MAP = {
  morning:   "ronny_morning",
  movie:     "ronny_movie_mode",
  away:      "ronny_away",
  goodnight: "ronny_goodnight",
  bright:    "ronny_bright",
  relax:     "ronny_relax",
};

async function handleLights(action) {
  const scene = action.params?.scene || "bright";
  const eventName = SCENE_MAP[scene];

  if (!eventName) {
    return { status: "unknown_scene", scene };
  }

  if (!IFTTT_KEY) {
    // No IFTTT key configured — log and return for testing
    console.log(`  💡 [DRY RUN] Would trigger scene: ${scene} (${eventName})`);
    return { status: "dry_run", scene, event: eventName };
  }

  // Fire IFTTT webhook
  const url = `${IFTTT_BASE}/${eventName}/with/key/${IFTTT_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      value1: scene,
      value2: action.params?.brightness || "",
    }),
  });

  if (!response.ok) {
    throw new Error(`IFTTT returned ${response.status}`);
  }

  return { status: "triggered", scene, event: eventName };
}

module.exports = { handleLights };
