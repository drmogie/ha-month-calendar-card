/**
 * Month Calendar Card for Home Assistant
 * -----------------------------------------------------------------------
 * A Lovelace calendar card with two card-wide views:
 *   - Month grid: always shows the current month (trimmed to only the
 *     weeks it needs, 4-6 rows) — no back/forward navigation, it simply
 *     tracks "now" and rolls over automatically.
 *   - Agenda / upcoming list: a flat, scrollable list of upcoming events
 *     over an adjustable number of days ahead, each row showing the
 *     event's calendar icon, title, and a relative day label ("today" /
 *     "tomorrow" / "in N days"). Can instead be grouped by day, with a
 *     day header (Today / Tomorrow / Weekday, Mon D) shown once above
 *     each day's events instead of repeating the label per row. The
 *     calendar name, time, location, and description lines can each be
 *     independently shown or hidden. Today's events get a configurable
 *     highlight background color. Your custom title (if set) is used as
 *     the header in this view too, the same as in the month grid.
 *   - Lets you add one or more `calendar.*` entities, each with its own
 *     icon and color.
 *   - Lets you set the first day of the week (month view) and control
 *     the header text size.
 *   - Lets you choose, card-wide, what clicking an event does: open Home
 *     Assistant's built-in "more info" dialog for that calendar, show an
 *     in-card popup with that specific event's own title/time/location/
 *     description, or do nothing at all. This card is view-only — it
 *     never creates or edits calendar events.
 *   - Works in the Lovelace "Sections" view (declares default grid
 *     sizing via getLayoutOptions) as well as classic Masonry views.
 *   - Ships a full visual (GUI) editor — no YAML required — including a
 *     native Material Design Icons picker for each calendar's icon, and
 *     collapsible calendar rows (existing calendars collapse down to a
 *     tidy summary line; a newly-added calendar opens expanded). The
 *     editor only shows the config fields relevant to whichever view is
 *     currently selected.
 *
 * INSTALL
 * -----------------------------------------------------------------------
 * 1. Copy the `ha-month-calendar-card` folder into <config>/www/, so you
 *    end up with <config>/www/ha-month-calendar-card/ha-month-calendar-card.js
 * 2. In HA: Settings -> Dashboards -> (top right ⋮) -> Resources -> Add
 *      URL:  /local/ha-month-calendar-card/ha-month-calendar-card.js
 *      Type: JavaScript Module
 * 3. Add the card from the card picker ("Month Calendar Card") and
 *    configure it with the visual editor, or drop in YAML directly:
 *
 * type: custom:ha-month-calendar-card
 * view: month                     # month | agenda, defaults to "month"
 * title: Family Calendar          # optional, defaults to "Month Year" / "Next N days"
 * show_title: true                # optional, defaults to true — false hides the title
 *                                  # TEXT only; header_font_size still reserves its space
 * header_font_size: 20            # optional, px, defaults to 20
 * tap_action: more-info           # more-info | event-details | none — "event-details"
 *                                  # shows an in-card popup with that event's own
 *                                  # title/time/location/description instead of HA's
 *                                  # more-info dialog for the whole calendar entity
 * show_legend: true               # optional, defaults to true
 * first_day_of_week: monday       # month view only: sunday | monday | tuesday
 *                                  # wednesday | thursday | friday | saturday
 * event_display: list             # month view only: list | icon
 * max_events_per_day: 3           # month view only, defaults to 3
 * agenda_days: 14                 # agenda view only, defaults to 14
 * agenda_today_color: '#ffca28'   # agenda view only, defaults to '#ffca28'
 * agenda_show_calendar: true      # agenda view only, defaults to true
 * agenda_show_time: true          # agenda view only, defaults to true
 * agenda_show_location: true      # agenda view only, defaults to true
 * agenda_show_description: false  # agenda view only, defaults to false
 * agenda_align_spacer: false      # agenda view only, defaults to false — adds a
 *                                  # spacer the height of the month grid's weekday
 *                                  # row, so events line up with it side-by-side
 * agenda_grouping: event          # agenda view only: event | day, defaults to "event"
 *                                  # "day" groups events under a day header (Today,
 *                                  # Tomorrow, Weekday, Mon D) instead of repeating a
 *                                  # relative label on every row
 * agenda_day_header_align: left   # agenda view only, used when agenda_grouping is
 *                                  # "day": left | center | right, defaults to "left"
 * calendars:
 *   - entity: calendar.personal
 *     name: Personal
 *     color: '#e74c3c'
 *     icon: mdi:account
 *   - entity: calendar.work
 *     name: Work
 *     color: '#3498db'
 *     icon: mdi:briefcase
 * -----------------------------------------------------------------------
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // re-fetch events every 5 min

const WEEKDAY_ORDER = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const DEFAULT_COLOR = "#03a9f4";
const DEFAULT_ICON = "mdi:calendar";
const DEFAULT_HEADER_SIZE = 20;
const DEFAULT_AGENDA_DAYS = 14;
const DEFAULT_TODAY_COLOR = "#ffca28";

function firstDayIndex(name) {
  const idx = WEEKDAY_ORDER.indexOf((name || "sunday").toLowerCase());
  return idx === -1 ? 0 : idx;
}

function startOfDay(d) {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

// Parse a HA calendar API event start/end field, which is either
// { date: 'YYYY-MM-DD' } (all-day) or { dateTime: ISOString } (timed).
function parseEventBoundary(boundary) {
  if (!boundary) return null;
  if (boundary.date) {
    const [y, m, d] = boundary.date.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  if (boundary.dateTime) {
    return new Date(boundary.dateTime);
  }
  return null;
}

function isAllDay(event) {
  return !!(event.start && event.start.date && !event.start.dateTime);
}

// "today" / "tomorrow" / "in N days" relative to the given reference day.
// An event already under way (started before today but still ongoing)
// counts as "today".
function relativeDayLabel(evStart, evEnd, today) {
  const startDay = startOfDay(evStart);
  if (startDay <= today && evEnd > today) return "today";
  const diff = daysBetween(today, startDay);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  return `in ${diff} days`;
}

// Header label for a day-group in the agenda view's "group by day" mode:
// "Today" / "Tomorrow", then "Weekday, Mon D" beyond that (an actual date
// disambiguates same-labeled days better than repeating "in N days").
function dayGroupLabel(day, today) {
  const diff = daysBetween(today, day);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function formatTimeRange(start, end) {
  const fmt = { hour: "numeric", minute: "2-digit" };
  return `${start.toLocaleTimeString(undefined, fmt)} – ${end.toLocaleTimeString(undefined, fmt)}`;
}

// Calendar event descriptions sometimes carry raw HTML — strip tags and
// collapse whitespace so a description renders as plain single-line text.
function stripHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contrastTextColor(hex) {
  if (!hex) return "#ffffff";
  let c = hex.replace("#", "");
  if (c.length === 3) {
    c = c
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (c.length !== 6) return "#ffffff";
  const r = parseInt(c.substr(0, 2), 16);
  const g = parseInt(c.substr(2, 2), 16);
  const b = parseInt(c.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000000" : "#ffffff";
}

function normalizeConfig(config) {
  config = config || {};
  // Spread the incoming config first so anything we don't explicitly
  // manage — grid_options (Sections view sizing), view_layout, card_mod,
  // etc. — passes through untouched instead of being silently dropped
  // on every edit.
  return {
    ...config,
    type: "custom:ha-month-calendar-card",
    view: config.view === "agenda" ? "agenda" : "month",
    title: (config.title || "").trim(),
    show_title: config.show_title !== false,
    header_font_size:
      Number.isFinite(config.header_font_size) && config.header_font_size > 0
        ? config.header_font_size
        : DEFAULT_HEADER_SIZE,
    first_day_of_week: config.first_day_of_week || "sunday",
    tap_action:
      config.tap_action === "none" || config.tap_action === "event-details"
        ? config.tap_action
        : "more-info",
    show_legend: config.show_legend !== false,
    agenda_align_spacer: config.agenda_align_spacer === true,
    agenda_grouping: config.agenda_grouping === "day" ? "day" : "event",
    agenda_day_header_align:
      config.agenda_day_header_align === "center" || config.agenda_day_header_align === "right"
        ? config.agenda_day_header_align
        : "left",
    event_display: config.event_display === "icon" ? "icon" : "list",
    max_events_per_day:
      Number.isInteger(config.max_events_per_day) && config.max_events_per_day > 0
        ? config.max_events_per_day
        : 3,
    agenda_days:
      Number.isInteger(config.agenda_days) && config.agenda_days > 0
        ? config.agenda_days
        : DEFAULT_AGENDA_DAYS,
    agenda_today_color: config.agenda_today_color || DEFAULT_TODAY_COLOR,
    agenda_show_calendar: config.agenda_show_calendar !== false,
    agenda_show_time: config.agenda_show_time !== false,
    agenda_show_location: config.agenda_show_location !== false,
    agenda_show_description: config.agenda_show_description === true,
    calendars: Array.isArray(config.calendars)
      ? config.calendars.map((c) => ({
          entity: c.entity || "",
          name: c.name || "",
          color: c.color || DEFAULT_COLOR,
          icon: c.icon || DEFAULT_ICON,
        }))
      : [],
  };
}

// =========================================================================
// The card itself
// =========================================================================

class HaMonthCalendarCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._events = []; // flattened, each item has calendar meta attached
    this._fetchKey = null;
    this._loading = false;
    this._error = null;
    this._refreshTimer = null;
    this._eventIndex = []; // detail-entry data for each clickable rendered this pass
    this._detailEntry = null; // currently-open event-details popup data, if any
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.calendars) || config.calendars.length === 0) {
      throw new Error("ha-month-calendar-card: you must define at least one entry under 'calendars'.");
    }
    config.calendars.forEach((c, i) => {
      if (!c.entity) {
        throw new Error(`ha-month-calendar-card: calendars[${i}] is missing 'entity'.`);
      }
    });

    this._config = normalizeConfig(config);
    this._fetchKey = null; // force refetch on next hass update
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      this._render();
    }
    this._maybeFetchEvents();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    if (!this._refreshTimer) {
      this._refreshTimer = setInterval(() => {
        this._fetchKey = null;
        this._maybeFetchEvents();
        this._render(); // catches month rollover / agenda window sliding at midnight too
      }, REFRESH_INTERVAL_MS);
    }
  }

  disconnectedCallback() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  getCardSize() {
    return 8;
  }

  // Default sizing hint for the Lovelace "Sections" view. HA falls back
  // to this automatically for the classic Masonry view via getCardSize().
  static getLayoutOptions() {
    return {
      grid_columns: "full",
      grid_rows: 8,
      grid_min_rows: 6,
      grid_max_rows: 16,
      grid_min_columns: 3,
    };
  }

  static getConfigElement() {
    return document.createElement("ha-month-calendar-card-editor");
  }

  static getStubConfig(hass) {
    const calendarEntities = hass
      ? Object.keys(hass.states).filter((e) => e.startsWith("calendar."))
      : [];
    const first = calendarEntities[0];
    return {
      type: "custom:ha-month-calendar-card",
      view: "month",
      first_day_of_week: "sunday",
      tap_action: "more-info",
      header_font_size: DEFAULT_HEADER_SIZE,
      event_display: "list",
      agenda_days: DEFAULT_AGENDA_DAYS,
      agenda_today_color: DEFAULT_TODAY_COLOR,
      agenda_show_calendar: true,
      agenda_show_time: true,
      agenda_show_location: true,
      agenda_show_description: false,
      agenda_align_spacer: false,
      agenda_grouping: "event",
      agenda_day_header_align: "left",
      show_title: true,
      calendars: first
        ? [{ entity: first, name: first, color: DEFAULT_COLOR, icon: DEFAULT_ICON }]
        : [{ entity: "calendar.personal", name: "Personal", color: DEFAULT_COLOR, icon: DEFAULT_ICON }],
    };
  }

  // ---- data -------------------------------------------------------------

  _gridRange() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const fdi = firstDayIndex(this._config.first_day_of_week);
    const firstOfMonth = new Date(year, month, 1);
    const leadDays = (firstOfMonth.getDay() - fdi + 7) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Only render as many weeks as are actually needed to cover this
    // month's days (4-6, whatever it takes) — no trailing all-other-month
    // week.
    const totalCells = Math.ceil((leadDays + daysInMonth) / 7) * 7;
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - leadDays);
    const gridEnd = new Date(gridStart);
    gridEnd.setDate(gridEnd.getDate() + totalCells);
    return { gridStart, gridEnd, year, month, totalCells };
  }

  _agendaRange() {
    const start = startOfDay(new Date());
    const days = this._config.agenda_days || DEFAULT_AGENDA_DAYS;
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    return { start, end };
  }

  _fetchRange() {
    if (this._config.view === "agenda") {
      const { start, end } = this._agendaRange();
      return { start, end };
    }
    const { gridStart, gridEnd } = this._gridRange();
    return { start: gridStart, end: gridEnd };
  }

  async _maybeFetchEvents() {
    if (!this._hass || !this._config) return;
    const { start, end } = this._fetchRange();
    const key = JSON.stringify({
      view: this._config.view,
      cals: this._config.calendars.map((c) => c.entity),
      start: start.toISOString(),
      end: end.toISOString(),
    });
    if (key === this._fetchKey) return;
    this._fetchKey = key;
    this._loading = true;
    this._error = null;
    this._renderStatusOnly();

    try {
      const results = await Promise.all(
        this._config.calendars.map((cal) =>
          this._hass
            .callApi(
              "GET",
              `calendars/${cal.entity}?start=${encodeURIComponent(
                start.toISOString()
              )}&end=${encodeURIComponent(end.toISOString())}`
            )
            .then((items) => (items || []).map((ev) => ({ ...ev, __cal: cal })))
            .catch((err) => {
              console.error(`ha-month-calendar-card: failed to fetch ${cal.entity}`, err);
              return [];
            })
        )
      );
      this._events = results.flat();
    } catch (err) {
      console.error("ha-month-calendar-card: error fetching events", err);
      this._error = "Failed to load one or more calendars.";
      this._events = [];
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _eventsForDay(day) {
    const dayStart = startOfDay(day);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    return this._events.filter((ev) => {
      const s = parseEventBoundary(ev.start);
      let e = parseEventBoundary(ev.end);
      if (!s) return false;
      if (!e) e = new Date(s.getTime() + DAY_MS);
      return s < dayEnd && e > dayStart;
    });
  }

  // ---- interaction --------------------------------------------------------

  // Builds the plain-data object the event-details popup renders from —
  // computed once at render time so the popup doesn't need to re-parse
  // the raw HA event later (by which point the underlying event list may
  // have already refreshed).
  _buildDetailEntry(ev) {
    const s = parseEventBoundary(ev.start);
    let e = parseEventBoundary(ev.end);
    if (!e && s) e = new Date(s.getTime() + DAY_MS);
    const allDay = isAllDay(ev);
    const timeText = s && e ? (allDay ? "All day" : formatTimeRange(s, e)) : "";
    return {
      title: ev.summary || "(No title)",
      calName: (ev.__cal && (ev.__cal.name || ev.__cal.entity)) || "",
      calIcon: (ev.__cal && ev.__cal.icon) || DEFAULT_ICON,
      calColor: (ev.__cal && ev.__cal.color) || DEFAULT_COLOR,
      timeText,
      location: ev.location || "",
      description: stripHtml(ev.description),
    };
  }

  _onEventClick(el) {
    if (!this._config || this._config.tap_action === "none") return;
    if (this._config.tap_action === "event-details") {
      const idx = parseInt(el.dataset.eventIndex, 10);
      const entry = Number.isInteger(idx) ? this._eventIndex[idx] : null;
      if (entry) {
        this._showEventDetail(entry);
        return;
      }
      // Fall through to more-info if we somehow don't have detail data.
    }
    const evt = new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId: el.dataset.entity },
    });
    this.dispatchEvent(evt);
  }

  _showEventDetail(entry) {
    this._detailEntry = entry;
    this._render();
  }

  _closeEventDetail() {
    this._detailEntry = null;
    this._render();
  }

  // ---- rendering ----------------------------------------------------------

  _weekdayLabels() {
    const fdi = firstDayIndex(this._config.first_day_of_week);
    const base = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const out = [];
    for (let i = 0; i < 7; i++) {
      out.push(base[(fdi + i) % 7]);
    }
    return out;
  }

  _monthYearLabel() {
    const now = new Date();
    return now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  // The secondary context label shown under a custom title (or as the
  // title itself when none is set) — different per view.
  _contextLabel() {
    if (this._config.view === "agenda") {
      const days = this._config.agenda_days || DEFAULT_AGENDA_DAYS;
      return `Next ${days} day${days === 1 ? "" : "s"}`;
    }
    return this._monthYearLabel();
  }

  _renderStatusOnly() {
    if (!this.shadowRoot) return;
    const el = this.shadowRoot.querySelector(".status-line");
    if (el) {
      el.textContent = this._loading ? "Loading events…" : this._error || "";
      el.style.display = this._loading || this._error ? "block" : "none";
    }
  }

  _renderMonthBody() {
    const today = startOfDay(new Date());
    const { gridStart, totalCells } = this._gridRange();
    const weekdayLabels = this._weekdayLabels();
    const maxChips = this._config.max_events_per_day;
    const iconMode = this._config.event_display === "icon";

    let cellsHtml = "";
    for (let i = 0; i < totalCells; i++) {
      const day = new Date(gridStart);
      day.setDate(day.getDate() + i);
      const inMonth = day.getMonth() === today.getMonth() && day.getFullYear() === today.getFullYear();
      const isToday = isSameDay(day, today);
      const dayEvents = this._events.length ? this._eventsForDay(day) : [];

      // Build the list of "display items" for this day. In list mode
      // each event is its own item; in icon mode, events are collapsed
      // to one item per calendar (so a calendar with 3 events today
      // still only shows a single icon).
      let displayItems;
      if (iconMode) {
        const byCalendar = new Map();
        dayEvents.forEach((ev) => {
          const cal = ev.__cal;
          if (!byCalendar.has(cal.entity)) {
            byCalendar.set(cal.entity, { cal, titles: [], events: [] });
          }
          byCalendar.get(cal.entity).titles.push(ev.summary || "(No title)");
          byCalendar.get(cal.entity).events.push(ev);
        });
        displayItems = Array.from(byCalendar.values()).map((v) => ({
          cal: v.cal,
          tooltip: v.titles.join("\n"),
          text: null,
          events: v.events,
        }));
      } else {
        displayItems = dayEvents.map((ev) => ({
          cal: ev.__cal,
          tooltip: ev.summary || "(No title)",
          text: ev.summary || "(No title)",
          events: [ev],
        }));
      }

      let chipsHtml = "";
      const shown = displayItems.slice(0, maxChips);
      shown.forEach((item) => {
        const cal = item.cal;
        const textColor = contrastTextColor(cal.color);
        // A list-mode chip is always a single event; an icon-mode chip can
        // represent several events for the same calendar/day, so the
        // details popup shows all of them stacked.
        const detailIdx =
          item.events.length === 1
            ? this._eventIndex.push(this._buildDetailEntry(item.events[0])) - 1
            : this._eventIndex.push({ multiple: item.events.map((ev) => this._buildDetailEntry(ev)) }) - 1;
        if (iconMode) {
          chipsHtml += `
            <div class="event-chip icon-only"
                 data-entity="${cal.entity}"
                 data-event-index="${detailIdx}"
                 data-clickable="${this._config.tap_action !== "none"}"
                 title="${this._escape(item.tooltip)}"
                 style="background:${cal.color};">
              <ha-icon icon="${cal.icon}" class="chip-icon" style="color:${textColor}"></ha-icon>
            </div>`;
        } else {
          chipsHtml += `
            <div class="event-chip"
                 data-entity="${cal.entity}"
                 data-event-index="${detailIdx}"
                 data-clickable="${this._config.tap_action !== "none"}"
                 title="${this._escape(item.tooltip)}"
                 style="background:${cal.color};color:${textColor};">
              <ha-icon icon="${cal.icon}" class="chip-icon"></ha-icon>
              <span class="chip-title">${this._escape(item.text)}</span>
            </div>`;
        }
      });
      if (displayItems.length > maxChips) {
        chipsHtml += `<div class="event-more">+${displayItems.length - maxChips} more</div>`;
      }

      cellsHtml += `
        <div class="day-cell ${inMonth ? "" : "dim"} ${isToday ? "today" : ""}">
          <div class="day-number">${day.getDate()}</div>
          <div class="day-events ${iconMode ? "icon-mode" : ""}">${chipsHtml}</div>
        </div>`;
    }

    const headerHtml = weekdayLabels.map((w) => `<div class="weekday">${w}</div>`).join("");

    return `
      <div class="weekday-row">${headerHtml}</div>
      <div class="month-grid" style="grid-template-rows: repeat(${totalCells / 7}, 1fr);">${cellsHtml}</div>
    `;
  }

  _renderAgendaBody() {
    const { start, end } = this._agendaRange();
    const today = startOfDay(new Date());
    const todayColor = this._config.agenda_today_color || DEFAULT_TODAY_COLOR;
    const todayTextColor = contrastTextColor(todayColor);

    const items = this._events
      .map((ev) => {
        const s = parseEventBoundary(ev.start);
        let e = parseEventBoundary(ev.end);
        if (!s) return null;
        if (!e) e = new Date(s.getTime() + DAY_MS);
        return { ev, start: s, end: e, allDay: isAllDay(ev) };
      })
      .filter((item) => item && item.start < end && item.end > start)
      .sort((a, b) => a.start - b.start);

    if (!items.length) {
      return `<div class="agenda-empty">No upcoming events.</div>`;
    }

    const cfg = this._config;

    // Renders one event row. `showDayLabel` is false in "group by day" mode,
    // since the day is already said once by the group's own header there.
    const renderRow = ({ ev, start: evStart, end: evEnd, allDay }, showDayLabel) => {
      const cal = ev.__cal;
      const label = relativeDayLabel(evStart, evEnd, today);
      const isToday = label === "today";
      const timeText = allDay ? "All day" : formatTimeRange(evStart, evEnd);
      const description = stripHtml(ev.description);
      const rowStyle = isToday ? `background:${todayColor};` : "";
      const textStyle = isToday ? `color:${todayTextColor};` : "";
      const mutedStyle = isToday ? `color:${todayTextColor}; opacity:0.85;` : "";

      const showCalendar = cfg.agenda_show_calendar;
      const showLocation = cfg.agenda_show_location && !!ev.location;
      const showDescription = cfg.agenda_show_description && !!description;
      const showTime = cfg.agenda_show_time;

      let bodyLinesHtml;
      if (showDayLabel) {
        // "Group by event" layout (unchanged): calendar, location,
        // description each their own line, time last.
        const metaLines = [];
        if (showCalendar) metaLines.push(this._escape(cal.name || cal.entity));
        if (showLocation) metaLines.push(this._escape(ev.location));
        if (showDescription) metaLines.push(this._escape(description));
        const metaHtml = metaLines
          .map((line) => `<div class="agenda-meta" style="${mutedStyle}">${line}</div>`)
          .join("");
        const timeHtml = showTime
          ? `<div class="agenda-time" style="${mutedStyle}">${this._escape(timeText)}</div>`
          : "";
        bodyLinesHtml = `${metaHtml}${timeHtml}`;
      } else {
        // "Group by day" layout: line 2 is calendar name (left) + time
        // (right) sharing one row; location on line 3; description on
        // line 4 — the day is already said once by the group header.
        const line2Html =
          showCalendar || showTime
            ? `<div class="agenda-meta-row" style="${mutedStyle}">
                 <span class="agenda-cal-name">${showCalendar ? this._escape(cal.name || cal.entity) : ""}</span>
                 <span class="agenda-time-right">${showTime ? this._escape(timeText) : ""}</span>
               </div>`
            : "";
        const locationHtml = showLocation
          ? `<div class="agenda-meta" style="${mutedStyle}">${this._escape(ev.location)}</div>`
          : "";
        const descriptionHtml = showDescription
          ? `<div class="agenda-meta" style="${mutedStyle}">${this._escape(description)}</div>`
          : "";
        bodyLinesHtml = `${line2Html}${locationHtml}${descriptionHtml}`;
      }

      const dayLabelHtml = showDayLabel
        ? `<div class="agenda-day-label" style="${textStyle}">${this._escape(label)}</div>`
        : "";

      const detailIdx = this._eventIndex.push(this._buildDetailEntry(ev)) - 1;

      return `
        <div class="agenda-item ${isToday ? "is-today" : ""}"
             data-entity="${cal.entity}"
             data-event-index="${detailIdx}"
             data-clickable="${this._config.tap_action !== "none"}"
             style="${rowStyle}"
             title="${this._escape(ev.summary || "(No title)")}">
          <ha-icon icon="${cal.icon}" class="agenda-icon" style="color:${isToday ? todayTextColor : cal.color};"></ha-icon>
          <div class="agenda-text">
            <div class="agenda-title" style="${textStyle}">${this._escape(ev.summary || "(No title)")}</div>
            ${bodyLinesHtml}
          </div>
          ${dayLabelHtml}
        </div>`;
    };

    let listHtml;
    if (cfg.agenda_grouping === "day") {
      // Bucket events by the day they should appear under (an ongoing
      // event that started earlier buckets under "today", same as its
      // relative label would say).
      const groups = new Map();
      items.forEach((item) => {
        const dayKey =
          startOfDay(item.start) <= today && item.end > today ? today : startOfDay(item.start);
        const key = dayKey.getTime();
        if (!groups.has(key)) groups.set(key, { day: dayKey, items: [] });
        groups.get(key).items.push(item);
      });
      listHtml = [...groups.values()]
        .sort((a, b) => a.day - b.day)
        .map(({ day, items: dayItems }) => {
          const headerLabel = dayGroupLabel(day, today);
          const rows = dayItems.map((item) => renderRow(item, false)).join("");
          return `
            <div class="agenda-day-group">
              <div class="agenda-day-header" style="text-align:${cfg.agenda_day_header_align};">${this._escape(headerLabel)}</div>
              ${rows}
            </div>`;
        })
        .join("");
    } else {
      listHtml = items.map((item) => renderRow(item, true)).join("");
    }

    const spacerHtml = this._config.agenda_align_spacer
      ? `<div class="weekday-row">&nbsp;</div>`
      : "";

    const listClass = cfg.agenda_grouping === "day" ? "agenda-list grouped-by-day" : "agenda-list";
    return `${spacerHtml}<div class="${listClass}">${listHtml}</div>`;
  }

  _render() {
    if (!this._config || !this.shadowRoot) return;

    const isAgenda = this._config.view === "agenda";
    const headerSize = this._config.header_font_size || DEFAULT_HEADER_SIZE;
    const subtitleSize = Math.max(12, Math.round(headerSize * 0.7));
    const contextLabel = this._contextLabel();
    this._eventIndex = []; // rebuilt fresh by _renderMonthBody/_renderAgendaBody below
    const bodyHtml = isAgenda ? this._renderAgendaBody() : this._renderMonthBody();
    const showTitle = this._config.show_title !== false;

    const legendHtml = this._config.show_legend
      ? `<div class="legend">
          ${this._config.calendars
            .map(
              (c) => `
            <div class="legend-item">
              <ha-icon icon="${c.icon}" style="color:${c.color}"></ha-icon>
              <span>${this._escape(c.name || c.entity)}</span>
            </div>`
            )
            .join("")}
        </div>`
      : "";

    // When "show title" is off, the header text is hidden with
    // visibility:hidden (not removed) so the title's box — sized by
    // header_font_size — still reserves its vertical space. That's what
    // lets header_font_size stay a meaningful, adjustable setting even
    // with the text hidden.
    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        <div class="card-header" ${showTitle ? "" : 'style="visibility:hidden;"'}>
          <div class="title" style="font-size:${headerSize}px;">${this._escape(this._config.title || contextLabel)}</div>
        </div>
        ${showTitle && this._config.title ? `<div class="subtitle" style="font-size:${subtitleSize}px;">${this._escape(contextLabel)}</div>` : ""}
        <div class="status-line" style="display:${this._loading || this._error ? "block" : "none"}">
          ${this._escape(this._loading ? "Loading events…" : this._error || "")}
        </div>
        <div class="card-body ${isAgenda ? "agenda-mode" : "month-mode"}">${bodyHtml}</div>
        ${legendHtml}
        ${this._detailEntry ? this._renderDetailDialog(this._detailEntry) : ""}
      </ha-card>
    `;

    this.shadowRoot.querySelectorAll(".event-chip, .agenda-item").forEach((el) => {
      if (el.dataset.clickable === "true") {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          this._onEventClick(el);
        });
      } else {
        el.classList.add("no-click");
      }
    });

    if (this._detailEntry) {
      const backdrop = this.shadowRoot.querySelector(".detail-backdrop");
      const closeBtn = this.shadowRoot.querySelector(".detail-close");
      if (backdrop) {
        backdrop.addEventListener("click", (e) => {
          if (e.target === backdrop) this._closeEventDetail();
        });
      }
      if (closeBtn) {
        closeBtn.addEventListener("click", () => this._closeEventDetail());
      }
    }
  }

  // Renders the "event details" popup shown when tap_action is
  // "event-details" — either one event's details, or (for a month-grid
  // icon-mode chip representing several same-day events on one calendar)
  // each of them stacked with a divider between.
  _renderDetailDialog(entry) {
    const blocksHtml = entry.multiple
      ? entry.multiple.map((e) => this._renderDetailBlock(e)).join('<div class="detail-divider"></div>')
      : this._renderDetailBlock(entry);
    return `
      <div class="detail-backdrop">
        <div class="detail-dialog">
          <button class="detail-close" type="button" aria-label="Close">
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
          ${blocksHtml}
        </div>
      </div>`;
  }

  _renderDetailBlock(e) {
    return `
      <div class="detail-block">
        <div class="detail-title-row">
          <ha-icon icon="${e.calIcon}" style="color:${e.calColor};"></ha-icon>
          <span class="detail-title">${this._escape(e.title)}</span>
        </div>
        ${e.calName ? `<div class="detail-line">${this._escape(e.calName)}</div>` : ""}
        ${e.timeText ? `<div class="detail-line">${this._escape(e.timeText)}</div>` : ""}
        ${e.location ? `<div class="detail-line">${this._escape(e.location)}</div>` : ""}
        ${e.description ? `<div class="detail-line detail-description">${this._escape(e.description)}</div>` : ""}
      </div>`;
  }

  _escape(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  _styles() {
    return `
      :host {
        display: block;
        height: 100%;
      }
      ha-card {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        height: 100%;
        box-sizing: border-box;
        position: relative;
      }
      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .title {
        font-weight: 500;
        color: var(--primary-text-color);
        line-height: 1.2;
      }
      .subtitle {
        color: var(--secondary-text-color);
        margin-top: -4px;
      }
      .status-line {
        font-size: 0.85rem;
        color: var(--secondary-text-color);
      }
      .card-body {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
      }
      .weekday-row {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        text-align: center;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--secondary-text-color);
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        padding-bottom: 4px;
      }
      .month-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 0;
        flex: 1;
        min-height: 0;
        padding: 1px 0 0 1px; /* room for the collapsed-border trick below */
      }
      .day-cell {
        border: 1px solid var(--divider-color, #e0e0e0);
        margin: -1px 0 0 -1px; /* collapse doubled borders between cells */
        padding: 4px;
        display: flex;
        flex-direction: column;
        min-height: 60px;
        overflow: hidden;
        box-sizing: border-box;
      }
      .day-cell.dim {
        opacity: 0.4;
      }
      .day-cell.today .day-number {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        border-radius: 50%;
      }
      .day-number {
        font-size: 0.8rem;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--primary-text-color);
        align-self: flex-end;
      }
      .day-events {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: 2px;
        overflow: hidden;
      }
      .day-events.icon-mode {
        flex-direction: row;
        flex-wrap: wrap;
        gap: 3px;
        align-items: flex-start;
      }
      .event-chip {
        display: flex;
        align-items: center;
        gap: 3px;
        border-radius: 3px;
        padding: 1px 4px;
        font-size: 0.68rem;
        line-height: 1.3;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .event-chip.no-click {
        cursor: default;
      }
      .event-chip.icon-only {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        padding: 0;
        justify-content: center;
        flex-shrink: 0;
      }
      .event-chip.icon-only .chip-icon {
        --mdc-icon-size: 12px;
      }
      .event-chip:hover:not(.no-click) {
        filter: brightness(1.08);
      }
      .chip-icon {
        --mdc-icon-size: 12px;
        flex-shrink: 0;
      }
      .chip-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .event-more {
        font-size: 0.65rem;
        color: var(--secondary-text-color);
        padding-left: 2px;
      }
      .agenda-list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
      }
      .agenda-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 4px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        cursor: pointer;
        border-radius: 4px;
      }
      .agenda-item:last-child {
        border-bottom: none;
      }
      .agenda-list.grouped-by-day .agenda-item {
        border-bottom: none;
      }
      .agenda-item.no-click {
        cursor: default;
      }
      .agenda-item:hover:not(.no-click) {
        filter: brightness(0.97);
      }
      :host-context(.dark) .agenda-item:hover:not(.no-click) {
        filter: brightness(1.15);
      }
      .agenda-icon {
        flex-shrink: 0;
        margin-top: 2px;
        --mdc-icon-size: 20px;
      }
      .agenda-text {
        flex: 1;
        min-width: 0;
      }
      .agenda-title {
        font-weight: 500;
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .agenda-meta {
        font-size: 0.8rem;
        color: var(--secondary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-top: 1px;
      }
      .agenda-time {
        font-size: 0.78rem;
        color: var(--secondary-text-color);
        margin-top: 2px;
      }
      .agenda-meta-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
        font-size: 0.8rem;
        color: var(--secondary-text-color);
        margin-top: 1px;
      }
      .agenda-cal-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .agenda-time-right {
        margin-left: auto;
        flex-shrink: 0;
        font-size: 0.78rem;
        white-space: nowrap;
      }
      .agenda-day-label {
        flex-shrink: 0;
        font-size: 0.8rem;
        color: var(--secondary-text-color);
        padding-top: 2px;
        white-space: nowrap;
      }
      .agenda-day-group:not(:first-child) {
        margin-top: 6px;
      }
      .agenda-day-header {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--secondary-text-color);
        padding: 6px 4px 4px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        margin-bottom: 2px;
      }
      .agenda-empty {
        color: var(--secondary-text-color);
        font-style: italic;
        padding: 16px 4px;
        text-align: center;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--divider-color, #e0e0e0);
      }
      .legend-item {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.78rem;
        color: var(--primary-text-color);
      }
      .legend-item ha-icon {
        --mdc-icon-size: 16px;
      }
      .detail-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
        z-index: 10;
        border-radius: var(--ha-card-border-radius, 12px);
      }
      .detail-dialog {
        position: relative;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        border-radius: 8px;
        padding: 20px 20px 16px;
        width: 320px;
        max-width: 100%;
        max-height: 100%;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
        box-sizing: border-box;
      }
      .detail-close {
        position: absolute;
        top: 6px;
        right: 6px;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--secondary-text-color);
        padding: 6px;
        line-height: 0;
        border-radius: 50%;
      }
      .detail-close:hover {
        background: var(--divider-color, rgba(0, 0, 0, 0.08));
      }
      .detail-divider {
        height: 1px;
        background: var(--divider-color, #e0e0e0);
        margin: 14px 0;
      }
      .detail-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
        padding-right: 20px;
      }
      .detail-title {
        font-weight: 600;
        font-size: 1.05rem;
        color: var(--primary-text-color);
      }
      .detail-line {
        font-size: 0.85rem;
        color: var(--secondary-text-color);
        margin-top: 4px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .detail-description {
        color: var(--primary-text-color);
      }
      @media (max-width: 450px) {
        .day-cell { padding: 2px; }
        .chip-title { display: none; }
        .event-chip { justify-content: center; padding: 2px; }
      }
    `;
  }
}

// =========================================================================
// Visual (GUI) config editor
// =========================================================================
//
// IMPORTANT: every change handler below builds a *new* config object (and
// new nested objects/arrays for anything that changed) rather than
// mutating this._config in place. Home Assistant's dashboard-editing
// preview compares the config it receives by reference; if we mutate in
// place and hand back the same reference, the live preview card never
// sees a "new" config and appears frozen even though the field's own
// value did change. Always clone on write.
//
// Calendar rows are individually collapsible. Each row gets a stable
// internal uid (independent of its position in the array, so removing a
// row in the middle can't scramble another row's collapsed state). The
// FIRST time the editor sees an existing set of calendars, all of their
// rows start collapsed (a tidy summary line); a calendar added afterwards
// via "Add calendar" gets a fresh uid that is never collapsed by default,
// so it opens expanded for filling in.

class HaMonthCalendarCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._rendered = false;
    this._rowUids = [];
    this._nextRowUid = 1;
    this._collapsedUids = new Set();
    this._rowsInitialized = false;
  }

  setConfig(config) {
    const normalized = normalizeConfig(config);
    const changed = !this._config || JSON.stringify(this._config) !== JSON.stringify(normalized);
    this._config = normalized;
    this._syncRowUids();
    if (changed) this._needsRender = true;
    this._maybeRender();
  }

  set hass(hass) {
    this._hass = hass;
    this._maybeRender();
  }

  get hass() {
    return this._hass;
  }

  _maybeRender() {
    if (!this._hass || !this._config) return;
    if (!this._rendered || this._needsRender) {
      this._render();
      this._rendered = true;
      this._needsRender = false;
    }
  }

  _fireChanged() {
    const event = new CustomEvent("config-changed", {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  // ---- collapsible-row uid bookkeeping -----------------------------------

  _syncRowUids() {
    const count = this._config.calendars.length;
    if (!this._rowsInitialized) {
      // Editor just opened on an existing (or stub) config: these rows
      // are "existing" calendars, so they start collapsed.
      this._rowUids = [];
      for (let i = 0; i < count; i++) {
        const uid = this._nextRowUid++;
        this._rowUids.push(uid);
        this._collapsedUids.add(uid);
      }
      this._rowsInitialized = true;
      return;
    }
    // Keep uids aligned by position for anything we didn't already manage
    // explicitly in _addCalendar/_removeCalendar (e.g. a raw YAML edit
    // while the editor is open). New tail entries open expanded.
    while (this._rowUids.length < count) {
      this._rowUids.push(this._nextRowUid++);
    }
    if (this._rowUids.length > count) {
      this._rowUids = this._rowUids.slice(0, count);
    }
  }

  _toggleRow(uid) {
    if (this._collapsedUids.has(uid)) {
      this._collapsedUids.delete(uid);
    } else {
      this._collapsedUids.add(uid);
    }
    this._render();
  }

  // ---- immutable update helpers -----------------------------------------

  _updateTopLevel(key, value) {
    this._config = { ...this._config, [key]: value };
    this._fireChanged();
  }

  _updateCalendar(index, key, value) {
    const calendars = this._config.calendars.map((cal, i) =>
      i === index ? { ...cal, [key]: value } : cal
    );
    this._config = { ...this._config, calendars };
    this._fireChanged();
  }

  _calendarEntities() {
    if (!this._hass) return [];
    return Object.keys(this._hass.states).filter((e) => e.startsWith("calendar."));
  }

  _addCalendar() {
    const available = this._calendarEntities();
    const used = new Set(this._config.calendars.map((c) => c.entity));
    const nextEntity = available.find((e) => !used.has(e)) || "";
    const newCal = { entity: nextEntity, name: "", color: DEFAULT_COLOR, icon: DEFAULT_ICON };
    this._config = { ...this._config, calendars: [...this._config.calendars, newCal] };
    // New row: fresh uid, left OUT of the collapsed set so it opens expanded.
    this._rowUids = [...this._rowUids, this._nextRowUid++];
    this._needsRender = true;
    this._fireChanged();
    this._maybeRender();
  }

  _removeCalendar(index) {
    const calendars = this._config.calendars.filter((_, i) => i !== index);
    const removedUid = this._rowUids[index];
    this._rowUids = this._rowUids.filter((_, i) => i !== index);
    this._collapsedUids.delete(removedUid);
    this._config = { ...this._config, calendars };
    this._needsRender = true;
    this._fireChanged();
    this._maybeRender();
  }

  // ---- rendering ----------------------------------------------------------

  _render() {
    const c = this._config;
    const entityOptions = this._calendarEntities();
    const hasIconPicker = !!customElements.get("ha-icon-picker");
    const isAgenda = c.view === "agenda";

    const weekdayOptionsHtml = WEEKDAY_ORDER.map(
      (w) =>
        `<option value="${w}" ${c.first_day_of_week === w ? "selected" : ""}>${
          w.charAt(0).toUpperCase() + w.slice(1)
        }</option>`
    ).join("");

    const calendarsHtml = c.calendars
      .map((cal, i) => {
        const uid = this._rowUids[i];
        const collapsed = this._collapsedUids.has(uid);
        const entitySelectOptions = entityOptions
          .map((e) => `<option value="${e}" ${cal.entity === e ? "selected" : ""}>${e}</option>`)
          .join("");
        const hasCurrent = cal.entity && entityOptions.includes(cal.entity);
        const fallbackOption =
          cal.entity && !hasCurrent ? `<option value="${cal.entity}" selected>${cal.entity}</option>` : "";
        const emptyOption = `<option value="" ${!cal.entity ? "selected" : ""}>Select a calendar…</option>`;

        const iconFieldHtml = hasIconPicker
          ? `<ha-icon-picker class="cal-icon" data-index="${i}"></ha-icon-picker>`
          : `<input class="cal-icon" data-index="${i}" type="text" placeholder="mdi:calendar" value="${this._escape(cal.icon)}" />`;

        const summaryName = cal.name || cal.entity || "New calendar";

        return `
          <div class="cal-row ${collapsed ? "collapsed" : ""}" data-index="${i}">
            <div class="cal-row-header">
              <button class="chevron-btn" type="button" data-uid="${uid}" title="${collapsed ? "Expand" : "Collapse"}">
                <ha-icon icon="${collapsed ? "mdi:chevron-right" : "mdi:chevron-down"}"></ha-icon>
              </button>
              <ha-icon icon="${cal.icon}" style="color:${cal.color}" class="cal-row-icon"></ha-icon>
              <span class="cal-row-name">${this._escape(summaryName)}</span>
              <button class="remove-btn" type="button" data-index="${i}" title="Remove calendar">
                <ha-icon icon="mdi:delete-outline"></ha-icon>
              </button>
            </div>
            <div class="cal-row-body" ${collapsed ? "hidden" : ""}>
              <div class="cal-row-line1">
                <label class="field">
                  <span class="field-label">Calendar entity</span>
                  <select class="cal-entity" data-index="${i}">
                    ${emptyOption}${fallbackOption}${entitySelectOptions}
                  </select>
                </label>
                <label class="field">
                  <span class="field-label">Display name</span>
                  <input class="cal-name" data-index="${i}" type="text" placeholder="${this._escape(cal.entity) || "e.g. Personal"}" value="${this._escape(cal.name)}" />
                </label>
              </div>
              <div class="cal-row-line2">
                <label class="field">
                  <span class="field-label">Icon</span>
                  ${iconFieldHtml}
                </label>
                <label class="field field-small">
                  <span class="field-label">Color</span>
                  <input class="cal-color" data-index="${i}" type="color" value="${this._normalizeColorForInput(cal.color)}" />
                </label>
              </div>
            </div>
          </div>`;
      })
      .join("");

    const viewSpecificHtml = isAgenda
      ? `
        <div class="row-2">
          <label class="field field-small">
            <span class="field-label">Days to show ahead</span>
            <input id="agenda-days" type="number" min="1" max="90" value="${c.agenda_days}" />
          </label>
          <label class="field field-small">
            <span class="field-label">Today highlight color</span>
            <input id="agenda-today-color" type="color" value="${this._normalizeColorForInput(c.agenda_today_color)}" />
          </label>
        </div>
        <div class="row-2">
          <label class="field">
            <span class="field-label">Group by</span>
            <select id="agenda-grouping">
              <option value="event" ${c.agenda_grouping === "event" ? "selected" : ""}>Event (each event its own row)</option>
              <option value="day" ${c.agenda_grouping === "day" ? "selected" : ""}>Day (events grouped under a day header)</option>
            </select>
          </label>
          ${
            c.agenda_grouping === "day"
              ? `<label class="field">
                   <span class="field-label">Day header alignment</span>
                   <select id="agenda-day-header-align">
                     <option value="left" ${c.agenda_day_header_align === "left" ? "selected" : ""}>Left</option>
                     <option value="center" ${c.agenda_day_header_align === "center" ? "selected" : ""}>Center</option>
                     <option value="right" ${c.agenda_day_header_align === "right" ? "selected" : ""}>Right</option>
                   </select>
                 </label>`
              : ""
          }
        </div>
        <div class="row-2">
          <label class="field field-checkbox">
            <input id="agenda-show-calendar" type="checkbox" ${c.agenda_show_calendar ? "checked" : ""} />
            <span class="field-label">Show calendar name</span>
          </label>
          <label class="field field-checkbox">
            <input id="agenda-show-time" type="checkbox" ${c.agenda_show_time ? "checked" : ""} />
            <span class="field-label">Show time</span>
          </label>
        </div>
        <div class="row-2">
          <label class="field field-checkbox">
            <input id="agenda-show-location" type="checkbox" ${c.agenda_show_location ? "checked" : ""} />
            <span class="field-label">Show location</span>
          </label>
          <label class="field field-checkbox">
            <input id="agenda-show-description" type="checkbox" ${c.agenda_show_description ? "checked" : ""} />
            <span class="field-label">Show description</span>
          </label>
        </div>
        <div class="row-2">
          <label class="field field-checkbox">
            <input id="agenda-align-spacer" type="checkbox" ${c.agenda_align_spacer ? "checked" : ""} />
            <span class="field-label">Align top with month grid (adds a spacer the height of the weekday row)</span>
          </label>
        </div>`
      : `
        <div class="row-2">
          <label class="field">
            <span class="field-label">First day of week</span>
            <select id="first-day">${weekdayOptionsHtml}</select>
          </label>
          <label class="field">
            <span class="field-label">Event display</span>
            <select id="event-display">
              <option value="list" ${c.event_display === "list" ? "selected" : ""}>Full event list</option>
              <option value="icon" ${c.event_display === "icon" ? "selected" : ""}>Calendar icon only</option>
            </select>
          </label>
        </div>
        <div class="row-2">
          <label class="field field-small">
            <span class="field-label">Max items shown per day</span>
            <input id="max-events" type="number" min="1" max="10" value="${c.max_events_per_day}" />
          </label>
        </div>`;

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <div class="editor">
        <div class="section">
          <label class="field">
            <span class="field-label">Title (optional)</span>
            <input id="title" type="text" placeholder="Defaults to current month + year / date range" value="${this._escape(c.title)}" />
          </label>

          <div class="row-2">
            <label class="field">
              <span class="field-label">Card view</span>
              <select id="view-mode">
                <option value="month" ${!isAgenda ? "selected" : ""}>Month grid</option>
                <option value="agenda" ${isAgenda ? "selected" : ""}>Agenda / upcoming list</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">On event click</span>
              <select id="tap-action">
                <option value="more-info" ${c.tap_action === "more-info" ? "selected" : ""}>Open more-info dialog</option>
                <option value="event-details" ${c.tap_action === "event-details" ? "selected" : ""}>Show event details popup</option>
                <option value="none" ${c.tap_action === "none" ? "selected" : ""}>Do nothing</option>
              </select>
            </label>
          </div>

          <div class="row-2">
            <label class="field field-small">
              <span class="field-label">Header text size (px)</span>
              <input id="header-size" type="number" min="10" max="60" value="${c.header_font_size}" />
            </label>
            <label class="field field-checkbox">
              <input id="show-title" type="checkbox" ${c.show_title ? "checked" : ""} />
              <span class="field-label">Show title text</span>
            </label>
          </div>
          <div class="row-2">
            <label class="field field-checkbox">
              <input id="show-legend" type="checkbox" ${c.show_legend ? "checked" : ""} />
              <span class="field-label">Show calendar legend</span>
            </label>
          </div>

          ${viewSpecificHtml}
        </div>

        <div class="section">
          <div class="section-title">Calendars</div>
          <div class="cal-list">
            ${calendarsHtml || `<div class="empty-hint">No calendars added yet.</div>`}
          </div>
          <button id="add-cal" class="add-btn" type="button">
            <ha-icon icon="mdi:plus"></ha-icon>
            Add calendar
          </button>
        </div>
      </div>
    `;

    this._attachListeners(hasIconPicker);
  }

  _attachListeners(hasIconPicker) {
    const root = this.shadowRoot;

    root.getElementById("title").addEventListener("input", (e) => {
      this._updateTopLevel("title", e.target.value);
    });

    root.getElementById("view-mode").addEventListener("change", (e) => {
      this._updateTopLevel("view", e.target.value);
      this._needsRender = true;
      this._maybeRender();
    });

    root.getElementById("tap-action").addEventListener("change", (e) => {
      this._updateTopLevel("tap_action", e.target.value);
    });

    root.getElementById("header-size").addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10);
      this._updateTopLevel("header_font_size", Number.isInteger(v) && v > 0 ? v : DEFAULT_HEADER_SIZE);
    });

    root.getElementById("show-legend").addEventListener("change", (e) => {
      this._updateTopLevel("show_legend", e.target.checked);
    });

    root.getElementById("show-title").addEventListener("change", (e) => {
      this._updateTopLevel("show_title", e.target.checked);
    });

    const firstDay = root.getElementById("first-day");
    if (firstDay) {
      firstDay.addEventListener("change", (e) => {
        this._updateTopLevel("first_day_of_week", e.target.value);
      });
    }

    const eventDisplay = root.getElementById("event-display");
    if (eventDisplay) {
      eventDisplay.addEventListener("change", (e) => {
        this._updateTopLevel("event_display", e.target.value);
      });
    }

    const maxEvents = root.getElementById("max-events");
    if (maxEvents) {
      maxEvents.addEventListener("change", (e) => {
        const v = parseInt(e.target.value, 10);
        this._updateTopLevel("max_events_per_day", Number.isInteger(v) && v > 0 ? v : 3);
      });
    }

    const agendaDays = root.getElementById("agenda-days");
    if (agendaDays) {
      agendaDays.addEventListener("change", (e) => {
        const v = parseInt(e.target.value, 10);
        this._updateTopLevel("agenda_days", Number.isInteger(v) && v > 0 ? v : DEFAULT_AGENDA_DAYS);
      });
    }

    const agendaTodayColor = root.getElementById("agenda-today-color");
    if (agendaTodayColor) {
      agendaTodayColor.addEventListener("input", (e) => {
        this._updateTopLevel("agenda_today_color", e.target.value);
      });
    }

    const agendaGrouping = root.getElementById("agenda-grouping");
    if (agendaGrouping) {
      agendaGrouping.addEventListener("change", (e) => {
        this._updateTopLevel("agenda_grouping", e.target.value === "day" ? "day" : "event");
      });
    }

    const agendaDayHeaderAlign = root.getElementById("agenda-day-header-align");
    if (agendaDayHeaderAlign) {
      agendaDayHeaderAlign.addEventListener("change", (e) => {
        const v = e.target.value;
        this._updateTopLevel("agenda_day_header_align", v === "center" || v === "right" ? v : "left");
      });
    }

    const agendaShowCalendar = root.getElementById("agenda-show-calendar");
    if (agendaShowCalendar) {
      agendaShowCalendar.addEventListener("change", (e) => {
        this._updateTopLevel("agenda_show_calendar", e.target.checked);
      });
    }

    const agendaShowTime = root.getElementById("agenda-show-time");
    if (agendaShowTime) {
      agendaShowTime.addEventListener("change", (e) => {
        this._updateTopLevel("agenda_show_time", e.target.checked);
      });
    }

    const agendaShowLocation = root.getElementById("agenda-show-location");
    if (agendaShowLocation) {
      agendaShowLocation.addEventListener("change", (e) => {
        this._updateTopLevel("agenda_show_location", e.target.checked);
      });
    }

    const agendaShowDescription = root.getElementById("agenda-show-description");
    if (agendaShowDescription) {
      agendaShowDescription.addEventListener("change", (e) => {
        this._updateTopLevel("agenda_show_description", e.target.checked);
      });
    }

    const agendaAlignSpacer = root.getElementById("agenda-align-spacer");
    if (agendaAlignSpacer) {
      agendaAlignSpacer.addEventListener("change", (e) => {
        this._updateTopLevel("agenda_align_spacer", e.target.checked);
      });
    }

    root.getElementById("add-cal").addEventListener("click", () => this._addCalendar());

    root.querySelectorAll(".chevron-btn").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const uid = parseInt(e.currentTarget.dataset.uid, 10);
        this._toggleRow(uid);
      });
    });

    root.querySelectorAll(".cal-entity").forEach((el) => {
      el.addEventListener("change", (e) => {
        const index = parseInt(e.target.dataset.index, 10);
        this._updateCalendar(index, "entity", e.target.value);
      });
    });

    root.querySelectorAll(".cal-name").forEach((el) => {
      el.addEventListener("input", (e) => {
        const index = parseInt(e.target.dataset.index, 10);
        this._updateCalendar(index, "name", e.target.value);
      });
    });

    root.querySelectorAll(".cal-color").forEach((el) => {
      el.addEventListener("input", (e) => {
        const index = parseInt(e.target.dataset.index, 10);
        this._updateCalendar(index, "color", e.target.value);
      });
    });

    if (hasIconPicker) {
      root.querySelectorAll("ha-icon-picker.cal-icon").forEach((el) => {
        const index = parseInt(el.dataset.index, 10);
        const cal = this._config.calendars[index];
        el.hass = this._hass;
        el.label = "Icon";
        el.value = cal.icon || DEFAULT_ICON;
        el.addEventListener("value-changed", (e) => {
          e.stopPropagation();
          this._updateCalendar(index, "icon", e.detail.value || DEFAULT_ICON);
        });
      });
    } else {
      root.querySelectorAll("input.cal-icon").forEach((el) => {
        el.addEventListener("input", (e) => {
          const index = parseInt(e.target.dataset.index, 10);
          this._updateCalendar(index, "icon", e.target.value || DEFAULT_ICON);
        });
      });
    }

    root.querySelectorAll(".remove-btn").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const index = parseInt(e.currentTarget.dataset.index, 10);
        this._removeCalendar(index);
      });
    });
  }

  _normalizeColorForInput(color) {
    // <input type="color"> requires a 6-digit hex value.
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
    return DEFAULT_COLOR;
  }

  _escape(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  _styles() {
    return `
      .editor {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 8px 0;
      }
      .section {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .section-title {
        font-size: 1rem;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .row-2 {
        display: flex;
        gap: 12px;
      }
      .row-2 > .field {
        flex: 1;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }
      .field-small {
        flex: 0 0 160px;
      }
      .field-checkbox {
        flex-direction: row;
        align-items: center;
        gap: 8px;
        margin-top: 18px;
      }
      .field-checkbox input {
        width: 18px;
        height: 18px;
      }
      .field-label {
        font-size: 0.78rem;
        color: var(--secondary-text-color);
      }
      input[type="text"],
      input[type="number"],
      select {
        font-family: inherit;
        font-size: 0.9rem;
        padding: 8px;
        border-radius: 4px;
        border: 1px solid var(--divider-color, #ccc);
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        box-sizing: border-box;
      }
      input[type="color"] {
        width: 100%;
        height: 36px;
        padding: 2px;
        border-radius: 4px;
        border: 1px solid var(--divider-color, #ccc);
        background: var(--card-background-color, #fff);
        box-sizing: border-box;
      }
      .cal-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .cal-row {
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 8px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .cal-row.collapsed {
        gap: 0;
      }
      .cal-row-header {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .chevron-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--secondary-text-color);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        width: 28px;
        height: 28px;
        flex-shrink: 0;
      }
      .cal-row-icon {
        flex-shrink: 0;
        --mdc-icon-size: 18px;
      }
      .cal-row-name {
        flex: 1;
        font-size: 0.9rem;
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cal-row-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
      }
      .cal-row-body[hidden] {
        display: none;
      }
      .cal-row-line1 {
        display: grid;
        grid-template-columns: 1.6fr 1.4fr;
        gap: 8px;
      }
      .cal-row-line2 {
        display: grid;
        grid-template-columns: 1.6fr 0.8fr;
        gap: 8px;
        align-items: end;
      }
      .remove-btn {
        background: var(--error-color, #db4437);
        border: none;
        cursor: pointer;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        width: 28px;
        height: 28px;
        flex-shrink: 0;
      }
      .remove-btn:hover {
        filter: brightness(0.9);
      }
      .add-btn {
        align-self: flex-start;
        display: flex;
        align-items: center;
        gap: 4px;
        background: none;
        border: 1px solid var(--primary-color, #03a9f4);
        color: var(--primary-color, #03a9f4);
        border-radius: 4px;
        padding: 8px 12px;
        font-size: 0.85rem;
        cursor: pointer;
      }
      .add-btn:hover {
        background: rgba(3, 169, 244, 0.08);
      }
      .empty-hint {
        font-size: 0.85rem;
        color: var(--secondary-text-color);
        font-style: italic;
      }
      @media (max-width: 600px) {
        .row-2 { flex-direction: column; }
        .cal-row-line1 { grid-template-columns: 1fr; }
        .cal-row-line2 { grid-template-columns: 1fr 1fr; }
      }
    `;
  }
}

customElements.define("ha-month-calendar-card", HaMonthCalendarCard);
customElements.define("ha-month-calendar-card-editor", HaMonthCalendarCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-month-calendar-card",
  name: "Month Calendar Card",
  description: "A month grid or agenda-list calendar card with multiple calendar sources, per-calendar icon/color, and a GUI editor with a native icon picker.",
  preview: false,
});
