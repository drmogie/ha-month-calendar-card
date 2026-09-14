/**
 * Month Calendar Card for Home Assistant
 * -----------------------------------------------------------------------
 * A full-month calendar Lovelace card that:
 *   - Always shows the current month (with dimmed lead/trail days from
 *     the previous/next month so every week row is complete). There is
 *     no back/forward navigation — the card simply tracks "now".
 *   - Lets you add one or more `calendar.*` entities, each with its own
 *     icon and color.
 *   - Lets you set the first day of the week (Mon, Tue, Wed, Thu, Fri,
 *     Sat, Sun - any starting day).
 *   - Lets you control the font size of the month/year header.
 *   - Lets you choose, card-wide, whether clicking an event opens Home
 *     Assistant's built-in "more info" dialog for that calendar, or does
 *     nothing at all.
 *   - Works in the Lovelace "Sections" view (declares default grid
 *     sizing via getLayoutOptions) as well as classic Masonry views.
 *   - Ships a full visual (GUI) editor — no YAML required — including a
 *     native Material Design Icons picker for each calendar's icon.
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
 * title: Family Calendar          # optional, defaults to "Month Year"
 * header_font_size: 20            # optional, px, defaults to 20
 * first_day_of_week: monday       # sunday | monday | tuesday | wednesday
 *                                  # thursday | friday | saturday
 * tap_action: more-info           # more-info | none
 * show_legend: true               # optional, defaults to true
 * max_events_per_day: 3           # optional, defaults to 3
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
    title: config.title || "",
    header_font_size:
      Number.isFinite(config.header_font_size) && config.header_font_size > 0
        ? config.header_font_size
        : DEFAULT_HEADER_SIZE,
    first_day_of_week: config.first_day_of_week || "sunday",
    tap_action: config.tap_action === "none" ? "none" : "more-info",
    show_legend: config.show_legend !== false,
    event_display: config.event_display === "icon" ? "icon" : "list",
    max_events_per_day:
      Number.isInteger(config.max_events_per_day) && config.max_events_per_day > 0
        ? config.max_events_per_day
        : 3,
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
        this._render(); // catches month rollover at midnight too
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
      first_day_of_week: "sunday",
      tap_action: "more-info",
      header_font_size: DEFAULT_HEADER_SIZE,
      event_display: "list",
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

  async _maybeFetchEvents() {
    if (!this._hass || !this._config) return;
    const { gridStart, gridEnd } = this._gridRange();
    const key = JSON.stringify({
      cals: this._config.calendars.map((c) => c.entity),
      start: gridStart.toISOString(),
      end: gridEnd.toISOString(),
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
                gridStart.toISOString()
              )}&end=${encodeURIComponent(gridEnd.toISOString())}`
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

  _onEventClick(entityId) {
    if (!this._config || this._config.tap_action === "none") return;
    const evt = new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId },
    });
    this.dispatchEvent(evt);
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

  _renderStatusOnly() {
    if (!this.shadowRoot) return;
    const el = this.shadowRoot.querySelector(".status-line");
    if (el) {
      el.textContent = this._loading ? "Loading events…" : this._error || "";
      el.style.display = this._loading || this._error ? "block" : "none";
    }
  }

  _render() {
    if (!this._config || !this.shadowRoot) return;

    const today = startOfDay(new Date());
    const { gridStart, totalCells } = this._gridRange();
    const weekdayLabels = this._weekdayLabels();
    const maxChips = this._config.max_events_per_day;
    const iconMode = this._config.event_display === "icon";
    const headerSize = this._config.header_font_size || DEFAULT_HEADER_SIZE;
    const subtitleSize = Math.max(12, Math.round(headerSize * 0.7));

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
            byCalendar.set(cal.entity, { cal, titles: [] });
          }
          byCalendar.get(cal.entity).titles.push(ev.summary || "(No title)");
        });
        displayItems = Array.from(byCalendar.values()).map((v) => ({
          cal: v.cal,
          tooltip: v.titles.join("\n"),
          text: null,
        }));
      } else {
        displayItems = dayEvents.map((ev) => ({
          cal: ev.__cal,
          tooltip: ev.summary || "(No title)",
          text: ev.summary || "(No title)",
        }));
      }

      let chipsHtml = "";
      const shown = displayItems.slice(0, maxChips);
      shown.forEach((item) => {
        const cal = item.cal;
        const textColor = contrastTextColor(cal.color);
        if (iconMode) {
          chipsHtml += `
            <div class="event-chip icon-only"
                 data-entity="${cal.entity}"
                 data-clickable="${this._config.tap_action !== "none"}"
                 title="${this._escape(item.tooltip)}"
                 style="background:${cal.color};">
              <ha-icon icon="${cal.icon}" class="chip-icon" style="color:${textColor}"></ha-icon>
            </div>`;
        } else {
          chipsHtml += `
            <div class="event-chip"
                 data-entity="${cal.entity}"
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

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        <div class="card-header">
          <div class="title" style="font-size:${headerSize}px;">${this._escape(this._config.title || this._monthYearLabel())}</div>
        </div>
        ${!this._config.title ? "" : `<div class="subtitle" style="font-size:${subtitleSize}px;">${this._escape(this._monthYearLabel())}</div>`}
        <div class="status-line" style="display:${this._loading || this._error ? "block" : "none"}">
          ${this._escape(this._loading ? "Loading events…" : this._error || "")}
        </div>
        <div class="weekday-row">${headerHtml}</div>
        <div class="month-grid" style="grid-template-rows: repeat(${totalCells / 7}, 1fr);">${cellsHtml}</div>
        ${legendHtml}
      </ha-card>
    `;

    this.shadowRoot.querySelectorAll(".event-chip").forEach((chip) => {
      if (chip.dataset.clickable === "true") {
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          this._onEventClick(chip.dataset.entity);
        });
      } else {
        chip.classList.add("no-click");
      }
    });
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

class HaMonthCalendarCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._rendered = false;
  }

  setConfig(config) {
    const normalized = normalizeConfig(config);
    const changed = !this._config || JSON.stringify(this._config) !== JSON.stringify(normalized);
    this._config = normalized;
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
    this._needsRender = true;
    this._fireChanged();
    this._maybeRender();
  }

  _removeCalendar(index) {
    const calendars = this._config.calendars.filter((_, i) => i !== index);
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

    const weekdayOptionsHtml = WEEKDAY_ORDER.map(
      (w) =>
        `<option value="${w}" ${c.first_day_of_week === w ? "selected" : ""}>${
          w.charAt(0).toUpperCase() + w.slice(1)
        }</option>`
    ).join("");

    const calendarsHtml = c.calendars
      .map((cal, i) => {
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

        return `
          <div class="cal-row" data-index="${i}">
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
              <button class="remove-btn" type="button" data-index="${i}" title="Remove calendar">
                <ha-icon icon="mdi:delete-outline"></ha-icon>
              </button>
            </div>
          </div>`;
      })
      .join("");

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <div class="editor">
        <div class="section">
          <label class="field">
            <span class="field-label">Title (optional)</span>
            <input id="title" type="text" placeholder="Defaults to current month + year" value="${this._escape(c.title)}" />
          </label>

          <div class="row-2">
            <label class="field">
              <span class="field-label">First day of week</span>
              <select id="first-day">${weekdayOptionsHtml}</select>
            </label>
            <label class="field">
              <span class="field-label">On event click</span>
              <select id="tap-action">
                <option value="more-info" ${c.tap_action === "more-info" ? "selected" : ""}>Open more-info dialog</option>
                <option value="none" ${c.tap_action === "none" ? "selected" : ""}>Do nothing</option>
              </select>
            </label>
          </div>

          <div class="row-2">
            <label class="field">
              <span class="field-label">Event display</span>
              <select id="event-display">
                <option value="list" ${c.event_display === "list" ? "selected" : ""}>Full event list</option>
                <option value="icon" ${c.event_display === "icon" ? "selected" : ""}>Calendar icon only</option>
              </select>
            </label>
            <label class="field field-small">
              <span class="field-label">Month/year text size (px)</span>
              <input id="header-size" type="number" min="10" max="60" value="${c.header_font_size}" />
            </label>
          </div>

          <div class="row-2">
            <label class="field field-small">
              <span class="field-label">Max items shown per day</span>
              <input id="max-events" type="number" min="1" max="10" value="${c.max_events_per_day}" />
            </label>
            <label class="field field-checkbox">
              <input id="show-legend" type="checkbox" ${c.show_legend ? "checked" : ""} />
              <span class="field-label">Show calendar legend</span>
            </label>
          </div>
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

    root.getElementById("first-day").addEventListener("change", (e) => {
      this._updateTopLevel("first_day_of_week", e.target.value);
    });

    root.getElementById("tap-action").addEventListener("change", (e) => {
      this._updateTopLevel("tap_action", e.target.value);
    });

    root.getElementById("event-display").addEventListener("change", (e) => {
      this._updateTopLevel("event_display", e.target.value);
    });

    root.getElementById("header-size").addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10);
      this._updateTopLevel("header_font_size", Number.isInteger(v) && v > 0 ? v : DEFAULT_HEADER_SIZE);
    });

    root.getElementById("max-events").addEventListener("change", (e) => {
      const v = parseInt(e.target.value, 10);
      this._updateTopLevel("max_events_per_day", Number.isInteger(v) && v > 0 ? v : 3);
    });

    root.getElementById("show-legend").addEventListener("change", (e) => {
      this._updateTopLevel("show_legend", e.target.checked);
    });

    root.getElementById("add-cal").addEventListener("click", () => this._addCalendar());

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
      .cal-row-line1 {
        display: grid;
        grid-template-columns: 1.6fr 1.4fr;
        gap: 8px;
      }
      .cal-row-line2 {
        display: grid;
        grid-template-columns: 1.6fr 0.8fr auto;
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
        width: 36px;
        height: 36px;
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
  description: "A full month calendar with multiple calendar sources, per-calendar icon/color, adjustable header size, and a GUI editor with a native icon picker.",
  preview: false,
});
