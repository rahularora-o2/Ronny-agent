// ─── Deep Link Generator ─────────────────────────────
//
// Generates iOS deep-links that the Shortcut will open.
// When Ronny's response includes a deepLink field,
// the iOS Shortcut opens that URL → launches the right app.
//
// These are returned to the Shortcut, NOT opened server-side.

// ─── Cab booking deep-links ──────────────────────────
function buildCabLink(params) {
  const service = params.service || "uber";
  const dest = encodeURIComponent(params.destination || "");

  if (service === "uber") {
    // Uber deep-link with destination
    if (dest) {
      return `uber://?action=setPickup&pickup=my_location&dropoff[formatted_address]=${dest}`;
    }
    return "uber://?action=setPickup&pickup=my_location";
  }

  // Ola
  return "olacabs://app/launch";
}

// ─── Food ordering deep-links ────────────────────────
function buildFoodLink(params) {
  const app = params.app || "zomato";
  const restaurant = params.restaurant || "";

  if (app === "zomato") {
    // Zomato deep-link (opens app, or search for restaurant)
    if (restaurant) {
      return `zomato://search?q=${encodeURIComponent(restaurant)}`;
    }
    return "zomato://order";
  }

  // Swiggy
  if (restaurant) {
    return `swiggy://search?query=${encodeURIComponent(restaurant)}`;
  }
  return "swiggy://";
}

// ─── Grocery deep-links ──────────────────────────────
function buildGroceryLink(params) {
  const app = params.app || "blinkit";
  if (app === "blinkit") return "blinkit://";
  if (app === "bigbasket") return "bigbasket://";
  return "blinkit://";
}

// ─── Tennis / MyGate deep-links ──────────────────────
function buildTennisLink(params) {
  // Opens MyGate to amenity booking section
  return "mygate://amenities";
}

function buildMyGateLink(params) {
  const action = params.action || "services";
  if (action === "visitor_preapprove") {
    return "mygate://visitors/preapprove";
  }
  return "mygate://";
}

// ─── Unified deep-link handler ───────────────────────
async function handleDeepLink(action) {
  let deepLink = null;

  switch (action.type) {
    case "cab_book":
      deepLink = buildCabLink(action.params || {});
      break;
    case "food_order":
      deepLink = buildFoodLink(action.params || {});
      break;
    case "grocery_order":
      deepLink = buildGroceryLink(action.params || {});
      break;
    case "tennis_book":
      deepLink = buildTennisLink(action.params || {});
      break;
    case "mygate_action":
      deepLink = buildMyGateLink(action.params || {});
      break;
    case "reminder_set":
      // iOS Shortcut will handle reminder creation natively
      return {
        status: "pass_to_shortcut",
        reminder: action.params,
      };
    default:
      return { status: "no_link", type: action.type };
  }

  console.log(`  🔗 Deep-link: ${deepLink}`);
  return { status: "link_generated", deepLink };
}

module.exports = { handleDeepLink };
