# Changelog

## 2026.09.14.2

- Added a second card-wide view: **Agenda / upcoming list** — a
  scrollable flat list of upcoming events over an adjustable number of
  days ahead (`agenda_days`, default 14), each row showing the event's
  calendar-defined icon, title, location (falling back to the calendar's
  display name), time range, and a relative label ("today" / "tomorrow"
  / "in N days"). Card is still view-only — no event creation/editing.
- Added a configurable highlight background color for today's events in
  the agenda view (`agenda_today_color`), with automatic contrasting
  text.
- GUI editor now has a "Card view" selector and only shows the config
  fields relevant to the selected view (month-grid-only fields like
  first day of week / event display / max items per day are hidden in
  agenda mode, and vice versa for the new agenda fields).
- Calendar rows in the GUI editor are now individually collapsible:
  existing calendars start collapsed to a tidy icon/color/name summary
  line, and a newly-added calendar opens expanded for setup.

## 2026.09.14.1

Initial release.

- Full-month Lovelace calendar card, always showing the current month
  trimmed to only the weeks it needs (4-6 rows), with no back/forward
  navigation — it just tracks "now" and rolls over automatically.
- Any number of `calendar.*` entities, each with its own icon and color.
- Two event display modes: full event-chip list, or a compact one-icon-
  per-calendar-per-day mode.
- Configurable first day of week, header text size, card-wide tap action
  (more-info dialog or none), optional legend, and max items shown per
  day before collapsing to "+N more".
- Full visual (GUI) editor with a native Material Design Icons picker —
  no YAML required.
- Scales with the card's box in a Lovelace Sections dashboard, and falls
  back gracefully in classic Masonry.
