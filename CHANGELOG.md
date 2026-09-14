# Changelog

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
