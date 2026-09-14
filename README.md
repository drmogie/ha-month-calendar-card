# Month Calendar Card (Home Assistant)

A view-only Lovelace calendar card with two card-wide views:

- **Month grid** — always shows the **current month**, trimmed to only
  the weeks that actually contain a day from that month (4–6 rows,
  whatever the month needs) — no dangling all-other-month week at the
  end. There's no back/forward navigation — the card just tracks "now"
  and rolls over automatically at midnight / month-end.
- **Agenda / upcoming list** — a scrollable flat list of upcoming events
  over an adjustable number of days ahead, each row showing the event's
  calendar icon, title, and a relative label ("today" / "tomorrow" / "in
  N days"). The calendar name, time, location, and description lines can
  each be independently shown or hidden. Today's events get their own
  configurable highlight color, and your custom title (if set) is used
  as the header here too, same as in the month grid. An optional spacer
  can align its first row with the month grid's weekday header, for
  placing both views side by side.
- **Hide the title text while keeping the header size.** `show_title:
  false` hides the header's text but keeps its reserved space, so
  `header_font_size` still controls the row height — handy if you just
  want the sizing without a visible label.
- Add **any number of `calendar.*` entities**, each with its own **icon**
  and **color**.
- **Two event display modes in the month grid**: a full list of event
  chips (one per event, with title), or a compact mode that shows just
  one small icon per calendar that has an event that day — even if that
  calendar has several events, it only appears once.
- Set the **first day of the week** to whichever day you like (Mon, Tue,
  Wed, Thu, Fri, Sat, or Sun) — month grid only.
- Adjustable **header text size**.
- One **card-wide tap setting**: clicking an event either opens Home
  Assistant's built-in "more info" dialog for that calendar, or does
  nothing (`tap_action: more-info` / `tap_action: none`). This card is
  view-only — it never creates or edits calendar events.
- A small color+icon legend under the grid/list (optional).
- Full **visual (GUI) editor** — no YAML required, though YAML is still
  supported if you prefer it. The editor only shows the fields that
  apply to whichever view you've picked, and each calendar's row is
  collapsible — existing calendars start collapsed to a tidy summary
  line, and a newly-added calendar opens expanded for setup.
- Scales with the card's box in a **Lovelace "Sections"** dashboard
  (resize width/height and the grid/list follows), and falls back
  gracefully in a classic **Masonry** dashboard.

## 1. Install the file

### HACS (recommended)

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=drmogie&repository=ha-month-calendar-card&category=plugin)

Add this repository to HACS (or search for "Month Calendar Card" if it's
already listed), install it, then follow step 2 below.

### Manual

[![Open your Home Assistant instance and show your dashboard resources.](https://my.home-assistant.io/badges/lovelace_resources.svg)](https://my.home-assistant.io/redirect/lovelace_resources/)

1. Copy the whole `ha-month-calendar-card` folder (containing
   `ha-month-calendar-card.js`) into `<your-ha-config>/www/`, so you end up
   with `<your-ha-config>/www/ha-month-calendar-card/ha-month-calendar-card.js`.
   (If you don't have a `www` folder yet, create one — Home Assistant
   automatically serves anything in there at `/local/...`.)
2. In Home Assistant: **Settings → Dashboards → ⋮ (top right) → Resources
   → Add Resource**
   - URL: `/local/ha-month-calendar-card/ha-month-calendar-card.js`
   - Resource type: **JavaScript Module**
3. Reload the browser (hard refresh, `Ctrl/Cmd+Shift+R`, if it doesn't
   show up right away).

## 2. Add the card

### Option A — Visual editor (recommended)

Edit a dashboard, click **Add Card**, and pick **Month Calendar Card**
from the picker (search "Month Calendar" if it's not visible). You'll
get a form where you can:

- Set an optional title, pick the card **view** (Month grid or Agenda /
  upcoming list), and choose the click behavior for events (more-info
  dialog or nothing).
- Set the header text size in pixels and toggle the legend — the form
  below that only shows the fields for whichever view you picked:
  - **Month grid**: first day of week, full event list vs. compact
    icon-only display, and how many items show per day before
    collapsing to "+N more".
  - **Agenda / upcoming list**: how many days ahead to show, a color
    picker for today's highlight background, and four checkboxes to
    show/hide the calendar name, time, location, and description on
    each event row.
- Add/remove calendars. Each calendar starts as a collapsed row showing
  just its icon, color, and name — click the chevron to expand it and
  edit the entity, display name, icon, and color. A newly-added calendar
  opens expanded automatically so you can fill it in right away. The
  icon field uses Home Assistant's native Material Design Icons picker —
  search by name instead of typing `mdi:` strings.

This works the same whether you're editing a classic (Masonry) dashboard
or a **Sections** dashboard — just drag the card into a section
afterward and resize it like any other section card.

### Option B — YAML

Add a card, choose **Manual**, and paste something like:

```yaml
type: custom:ha-month-calendar-card
view: month                     # optional — month | agenda, defaults to "month"
title: Family Calendar          # optional — defaults to "Month Year" / "Next N days"
show_title: true                # optional, default true — false hides the title TEXT
                                 # only; header_font_size still reserves its space
header_font_size: 20            # optional, px, defaults to 20
tap_action: more-info           # more-info | none
show_legend: true               # optional, default true
first_day_of_week: monday       # month view only: sunday | monday | tuesday
                                 # wednesday | thursday | friday | saturday
event_display: list             # month view only: list | icon
max_events_per_day: 3           # month view only, default 3
agenda_days: 14                 # agenda view only, default 14
agenda_today_color: '#ffca28'   # agenda view only, default '#ffca28'
agenda_show_calendar: true      # agenda view only, default true
agenda_show_time: true          # agenda view only, default true
agenda_show_location: true      # agenda view only, default true
agenda_show_description: false  # agenda view only, default false
agenda_align_spacer: false      # agenda view only, default false — adds a spacer the
                                 # height of the month grid's weekday row, so events
                                 # line up with it when both views sit side by side
calendars:
  - entity: calendar.personal
    name: Personal
    color: '#e74c3c'
    icon: mdi:account
  - entity: calendar.work
    name: Work
    color: '#3498db'
    icon: mdi:briefcase
  - entity: calendar.family
    name: Family
    color: '#2ecc71'
    icon: mdi:home-heart
```

### Options

| Option                | Required | Default          | Notes                                                                 |
|------------------------|----------|------------------|------------------------------------------------------------------------|
| `calendars`            | yes      | —                | List of calendar entries, each needs `entity`.                        |
| `calendars[].entity`   | yes      | —                | A `calendar.*` entity id.                                              |
| `calendars[].name`     | no       | entity id        | Shown in the legend and as an agenda row's calendar-name line.         |
| `calendars[].color`    | no       | `#03a9f4`        | Any CSS color; used for the event chip / icon color and legend swatch. |
| `calendars[].icon`     | no       | `mdi:calendar`   | Any `mdi:` icon; shown on each event chip/agenda row and in the legend.|
| `view`                 | no       | `month`          | `month` shows the month grid; `agenda` shows a scrollable upcoming-events list. |
| `title`                | no       | current month/yr | Card title text.                                                       |
| `show_title`           | no       | `true`           | Set `false` to hide the title TEXT only; the header row's height (via `header_font_size`) is still reserved, so the layout doesn't shift. |
| `header_font_size`     | no       | `20`             | Font size (px) of the header text (month/year, or your custom title).  |
| `tap_action`           | no       | `more-info`      | `more-info` opens HA's more-info dialog for the event's calendar entity; `none` disables clicking. Applies to both views — this card never creates or edits events. |
| `show_legend`          | no       | `true`           | Toggles the calendar name/color/icon legend under the grid/list.       |
| `first_day_of_week`    | no       | `sunday`         | **Month view only.** `sunday`, `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`. |
| `event_display`        | no       | `list`           | **Month view only.** `list` shows one chip per event with its title; `icon` collapses each calendar to a single icon per day, deduped even if that calendar has multiple events that day. |
| `max_events_per_day`   | no       | `3`              | **Month view only.** How many items (event chips, or calendar icons in icon mode) show before collapsing to "+N more". |
| `agenda_days`          | no       | `14`             | **Agenda view only.** How many days ahead (including today) to fetch and list events for. |
| `agenda_today_color`   | no       | `#ffca28`        | **Agenda view only.** Background highlight color for events happening today; text color is chosen automatically for readability. |
| `agenda_show_calendar` | no       | `true`           | **Agenda view only.** Show each event's calendar display name as a line under the title. |
| `agenda_show_time`     | no       | `true`           | **Agenda view only.** Show the time range (or "All day") under the title. |
| `agenda_show_location` | no       | `true`           | **Agenda view only.** Show the event's location, when the calendar provides one. |
| `agenda_show_description` | no    | `false`          | **Agenda view only.** Show the event's description (HTML tags stripped), when the calendar provides one. Off by default since descriptions can be long. |
| `agenda_align_spacer`  | no       | `false`          | **Agenda view only.** Adds an invisible spacer the height of the month grid's weekday-header row above the event list, so the two views' rows line up when placed side by side. |

## Notes on behavior

- **Only real weeks of the month.** The grid renders exactly as many
  rows as needed to cover the current month's days (4, 5, or 6, whatever
  it is this month) — it won't tack on a trailing week that's entirely
  next month.
- **Scales with the card's actual size.** In a Sections dashboard,
  resizing the card's width or height (via `grid_options`) stretches the
  whole grid — columns and rows — to match, instead of overflowing or
  leaving blank space. In a classic Masonry view (which sizes cards to
  their content, not a fixed box) it falls back to a sensible minimum
  cell height. Because height now genuinely follows the card's box
  instead of the column width, cells are uniform but not forced into
  perfect squares — that trade-off is what lets the grid fill tall or
  short cards cleanly.
- **Gapless day cells.** Day cells have no gap between them (only a
  shared 1px border), like a traditional wall calendar grid.
- **`grid_options` survives edits.** Resizing the card in a Sections
  dashboard stores sizing under `grid_options` in the card's config; the
  editor preserves that (and any other fields it doesn't manage) instead
  of dropping it on the next edit.
- **Live preview while editing.** Every editor field applies its change
  immediately to the card preview shown above the form — this relies on
  the editor always producing a fresh config object on each edit rather
  than mutating one in place, so nothing feels "stuck."
- **No month navigation.** The card always displays the real current
  month; it re-checks "today" every 5 minutes so it rolls over on its
  own at midnight/month-end.
- **Events are fetched** from Home Assistant's calendar REST API
  (`/api/calendars/<entity>?start=...&end=...`) for the full visible
  grid (month view) or the configured `agenda_days` window (agenda
  view), so lead/trail days from adjacent months will also show their
  events in month view. It refreshes automatically every 5 minutes, and
  switching views/adjusting `agenda_days` re-fetches immediately.
- **`tap_action: more-info`** fires HA's standard `hass-more-info` event
  scoped to the event's calendar entity — the same dialog you'd get
  clicking that calendar entity elsewhere in the UI (shows its upcoming
  agenda). Home Assistant calendar events themselves don't have their
  own entity id, so this is the native "more info" surface available for
  calendars. This card is view-only — it has no way to create or edit
  events; you'll always end up at that same more-info dialog (or none,
  with `tap_action: none`).
- All-day and timed events are both supported and correctly matched to
  the day(s)/rows they span. In the agenda view, an event already under
  way (started before today but still ongoing) is labeled "today".
- Colors are used as the event chip / icon color (and the month grid's
  icon-mode chip background); text color (black/white) is chosen
  automatically for readability against your chosen color.
- **Agenda row content is independently configurable.** Each event row
  can show or hide its calendar name, time, location, and description
  lines separately (`agenda_show_*` options) — a line is only shown when
  both its toggle is on AND the underlying data exists (e.g. an event
  with no location never shows a blank location line, even with
  `agenda_show_location: true`). Descriptions have any HTML stripped
  before display and are truncated to one line with an ellipsis, same as
  the other lines.
- **Your title is the header in both views.** If you set `title`, it
  becomes the large header text and the auto-generated month/year (or
  "Next N days") text moves to a smaller subtitle line underneath — the
  same behavior in the month grid and the agenda view. A title made of
  only spaces is treated as blank (trimmed), so it correctly falls back
  to the auto-generated text instead of leaving an invisible "set"
  title behind.
- **Hiding the title keeps its space.** `show_title: false` hides the
  header's text but not its row — `header_font_size` still reserves the
  same height, so you can use the header purely for vertical spacing
  without a visible label.
- **Aligning Month grid and Agenda side by side.** The month grid always
  starts with a weekday-header row before its first day cell; the
  agenda view doesn't have one by default. Turn on
  `agenda_align_spacer` in the agenda view to add a matching blank
  spacer row so the first event lines up with the month grid's first
  row of days when the two cards sit next to each other.

## Troubleshooting

- **Card shows "Custom element doesn't exist"** — the resource didn't
  load. Double check the resource URL/type and hard-refresh.
- **No events showing** — check that the `calendar.*` entities in your
  config actually have events in the visible month, and that your HA
  user has access to them.
- **Blank/incorrect colors** — make sure `color` values are valid CSS
  colors (hex like `#3498db`, or a CSS color name).
