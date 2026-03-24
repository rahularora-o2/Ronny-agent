const { handleLights } = require("./actions/lights");
const { handleCalendar } = require("./actions/calendar");
const { handleDeepLink } = require("./actions/deep-links");

// ─── Map action types to their handlers ──────────────
const ACTION_HANDLERS = {
  lights_scene: handleLights,
  calendar_create: handleCalendar,
  calendar_query: handleCalendar,
  cab_book: handleDeepLink,
  food_order: handleDeepLink,
  grocery_order: handleDeepLink,
  tennis_book: handleDeepLink,
  mygate_action: handleDeepLink,
  reminder_set: handleDeepLink,
};

// ─── Execute all actions from parsed intent ──────────
async function executeActions(parsed) {
  const results = [];

  for (const action of parsed.actions || []) {
    const handler = ACTION_HANDLERS[action.type];

    if (handler) {
      try {
        const result = await handler(action);
        results.push({ type: action.type, status: "success", result });
        console.log(`  ✅ ${action.type}: success`);
      } catch (err) {
        results.push({ type: action.type, status: "failed", error: err.message });
        console.log(`  ❌ ${action.type}: ${err.message}`);
      }
    } else {
      results.push({ type: action.type, status: "skipped", reason: "no handler" });
      console.log(`  ⏭️  ${action.type}: no handler (skipped)`);
    }
  }

  return results;
}

module.exports = { executeActions };
