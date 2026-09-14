# Changelog

## 2026.09.14.5

- Added `agenda_grouping` (agenda view only, default `event`): switch to
  `day` to group agenda rows under a day header (Today / Tomorrow /
  Weekday, Mon D) instead of repeating a relative day label on every
  row — useful when several events fall on the same day. Editor: new
  "Group by" dropdown in the Agenda-view-only section.

## 2026.09.14.4

- Fixed: a title made of only spaces (e.g. typed then "cleared" with a
  space left behind) was treated as a set title, leaving the header
  blank while the auto-generated text incorrectly stayed demoted to the
  small subtitle. Title text is now trimmed before this check, so a
  blank/space-only title correctly falls back to the big auto-generated
  header.
- Added `show_title`: hides the header's title TEXT only, while still
  reserving its row height via `header_font_size` — for when you want
  the sizing/spacing without a visible label. Editor: new "Show title
  text" checkbox.
- Added `agenda_align_spacer` (agenda view only): adds an invisible
  spacer the height of the month grid's weekday-header row above the
  event list, so events line up with the month grid's day-of-week row
  when both views are placed side by side. Editor: new "Align top with
  month grid" checkbox in the Agenda-view-only section.

## 2026.09.14.3

- Agenda view rows now have four independent show/hide toggles:
  `agenda_show_calendar`, `agenda_show_time`, `agenda_show_location`,
  `agenda_show_description` (all default `true` except description,
  which defaults `false`). Each line only renders when its toggle is on
  AND the event actually has that data. Descriptions have HTML tags
  stripped and are truncated to one line, same as the other lines.
- Confirmed/documented: your custom `title`, when set, is used as the
  large header in the agenda view exactly as it already was in the
  month grid (with the auto-generated "Next N days" text moving to a
  smaller subtitle underneath) — this was already shared code, no
  behavior change needed there.
- GUI editor: added the four new checkboxes to the Agenda-view-only
  section (still hidden entirely when Month grid is selected).

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
