// --- Google Calendar via Apps Script Proxy ---
//
// NO OAuth, NO API keys, NO refresh tokens.
// Just a single URL from Google Apps Script.
//
// The Apps Script runs under YOUR Google account,
// so it already has access to YOUR calendar.

const CALENDAR_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

// --- Get today's events ---
async function getTodayEvents() {
  if (!CALENDAR_URL) {
    console.log("  [DRY RUN] Would fetch today's events");
    return [
      { title: "Team Sync", start: "10:00 AM", end: "10:30 AM" },
      { title: "1-on-1 with Manager", start: "2:00 PM", end: "2:30 PM" },
    ];
  }
  const response = await fetch(CALENDAR_URL + "?action=today");
  if (!response.ok) throw new Error("Calendar fetch failed: " + response.status);
  const data = await response.json();
  return data.events || [];
}

// --- Get tomorrow's events ---
async function getTomorrowEvents() {
  if (!CALENDAR_URL) return [];
  const response = await fetch(CALENDAR_URL + "?action=tomorrow");
  const data = await response.json();
  return data.events || [];
}

// --- Create a calendar event ---
async function createEvent(params) {
  if (!CALENDAR_URL) {
    console.log("  [DRY RUN] Would create: " + params.title + " on " + params.date + " at " + params.time);
    return { status: "dry_run", title: params.title, date: params.date, time: params.time };
  }
  const response = await fetch(CALENDAR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create",
      title: params.title,
      date: params.date,
      time: params.time,
      duration_minutes: params.duration_minutes || 60,
    }),
  });
  if (!response.ok) throw new Error("Calendar create failed: " + response.status);
  return await response.json();
}

// --- Unified handler ---
async function handleCalendar(action) {
  if (action.type === "calendar_create") {
    return createEvent(action.params);
  }
  if (action.type === "calendar_query") {
    const date = (action.params && action.params.date) || "today";
    var events;
    if (date === "tomorrow") {
      events = await getTomorrowEvents();
    } else {
      events = await getTodayEvents();
    }
    return { status: "fetched", count: events.length, events: events };
  }
  return { status: "unknown_calendar_action" };
}

module.exports = { handleCalendar, getTodayEvents };
