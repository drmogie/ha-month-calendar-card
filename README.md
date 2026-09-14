# Month Calendar Card (Home Assistant)

A full-month calendar Lovelace card:

- Always shows the **current month**, trimmed to only the weeks that
  actually contain a day from that month (4–6 rows, whatever the month
  needs) — no dangling all-other-month week at the end. There's no
  back/forward navigation — the card just tracks "now" and rolls over
  automatically at midnight / month-end.
- Add **any number of `calendar.*` entities**, each with its own **icon**
  and **color**.
- **Two event display modes**: a full list of event chips (one per
  event, with title), or a compact mode that shows just one small icon
  per calendar that has an event that day — even if that calendar has
  several events, it only appears once.
- Set the **first day of the week** to whichever day you like (Mon, Tue,
  Wed, Thu, Fri, Sat, or Sun).
- Adjustable **month/year header text size**.
- One **card-wide tap setting**: clicking an event either opens Home
  Assistant's built-in "more info" dialog for that calendar, or does
  nothing (`tap_action: more-info` / `tap_action: none`).
- A small color+icon legend under the grid (optional).
- Full **visual (GUI) editor** — no YAML required, though YAML is still
  supported if you prefer it.
- Scales with the card's box in a **Lovelace "Sections"** dashboard
  (resize width/height and the grid follows), and falls back gracefully
  in a classic **Masonry** dashboard.

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

- Set an optional title, first day of week, and the click behavior for
  events (more-info dialog or nothing).
- Choose between the full event list or the compact icon-only display.
- Set the month/year header's text size in pixels.
- Toggle the legend and set how many items show per day before
  collapsing to "+N more".
- Add/remove calendars. Each calendar row has the entity dropdown and
  display name on one line, and the icon, color, and a red delete
  button on the line below. The icon field uses Home Assistant's native
  Material Design Icons picker — search by name instead of typing
  `mdi:` strings.

This works the same whether you're editing a classic (Masonry) dashboard
or a **Sections** dashboard — just drag the card into a section
afterward and resize it like any other section card.

### Option B — YAML

Add a card, choose **Manual**, and paste something like:

```yaml
type: custom:ha-month-calendar-card
title: Family Calendar          # optional — defaults to "Month Year"
header_font_size: 20            # optional, px, defaults to 20
first_day_of_week: monday       # sunday | monday | tuesday | wednesday
                                 # thursday | friday | saturday
tap_action: more-info           # more-info | none
event_display: list             # list | icon
show_legend: true               # optional, default true
max_events_per_day: 3           # optional, default 3
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
| `calendars[].name`     | no       | entity id        | Shown in the legend.                                                   |
| `calendars[].color`    | no       | `#03a9f4`        | Any CSS color; used for the event chip / icon background and legend swatch. |
| `calendars[].icon`     | no       | `mdi:calendar`   | Any `mdi:` icon; shown on each event chip and in the legend.           |
| `title`                | no       | current month/yr | Card title text.                                                       |
| `header_font_size`     | no       | `20`             | Font size (px) of the month/year header text.                          |
| `first_day_of_week`    | no       | `sunday`         | `sunday`, `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`. |
| `tap_action`           | no       | `more-info`      | `more-info` opens HA's more-info dialog for the event's calendar entity; `none` disables clicking. |
| `event_display`        | no       | `list`           | `list` shows one chip per event with its title; `icon` collapses each calendar to a single icon per day, deduped even if that calendar has multiple events that day. |
| `show_legend`          | no       | `true`           | Toggles the calendar name/color/icon legend under the grid.            |
| `max_events_per_day`   | no       | `3`              | How many items (event chips, or calendar icons in icon mode) show before collapsing to "+N more". |

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
  grid, so lead/trail days from adjacent months will also show their
  events. It refreshes automatically every 5 minutes.
- **`tap_action: more-info`** fires HA's standard `hass-more-info` event
  scoped to the event's calendar entity — the same dialog you'd get
  clicking that calendar entity elsewhere in the UI (shows its upcoming
  agenda). Home Assistant calendar events themselves don't have their
  own entity id, so this is the native "more info" surface available for
  calendars.
- All-day and timed events are both supported and correctly matched to
  the day(s) they span.
- Colors are used as the event chip / icon background; text color
  (black/white) is chosen automatically for readability against your
  chosen color.

## Troubleshooting

- **Card shows "Custom element doesn't exist"** — the resource didn't
  load. Double check the resource URL/type and hard-refresh.
- **No events showing** — check that the `calendar.*` entities in your
  config actually have events in the visible month, and that your HA
  user has access to them.
- **Blank/incorrect colors** — make sure `color` values are valid CSS
  colors (hex like `#3498db`, or a CSS color name).
