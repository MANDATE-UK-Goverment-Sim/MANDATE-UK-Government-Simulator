# MANDATE - Government Simulator v4

A flat-file browser political simulation. Upload every file in this ZIP to the root of a GitHub Pages repository. No folders are required.

## v4 game flow

1. Create your leader and original political party.
2. Fight a mandatory two-week general election campaign.
3. Campaign choices can succeed or backfire. The election can now be lost.
4. Run election night across a 640-seat Parliament.
5. If you win 321+ seats, name your Cabinet and begin the premiership.
6. If you lose, you return to party creation rather than entering government.

## Prime Minister diary

Each government week contains a major engagement. Examples include a bilateral meeting with the US President, a royal audience, an NHS hospital visit, a European leaders' summit, national security briefings, business roundtables, transport visits, and science or space announcements.

You choose what the Prime Minister says. Responses can affect popularity, political capital, diplomatic relationships, Treasury headroom, GDP growth, or public services.

## Popularity meter

The Overview screen now includes a large Prime Minister popularity scale from deeply unpopular through divided to very popular.

## Calendar and Number 10 speeches

The Calendar screen shows a six-week diary with weekly Cabinet meetings, PMQs, the current major diary engagement, and scheduled Number 10 speeches.

You can choose the date, topic and tone of a speech outside Number 10. Speeches are delivered when their scheduled date is reached by the simulation and can move popularity.

## PMQs

Prime Minister's Questions now occurs every two government weeks. Missing a scheduled session carries a political penalty. Completing PMQs schedules the next session two weeks later.

## Files

- `index.html` - app shell
- `styles.css` - blue responsive game UI
- `app.js` - complete simulation
- `config.js` - Supabase public connection settings
- `schema.sql` - Supabase tables, RLS and triggers
- `seed.sql` - optional seed reference data

## Supabase

The included `config.js` contains a Supabase publishable browser key. Keep Row Level Security enabled. Do not put a service-role key or other secret key in client-side files.

Run `schema.sql` in the Supabase SQL editor. For frictionless cloud saves, enable Anonymous Sign-Ins in Supabase Authentication. If cloud auth is unavailable, the game still auto-saves locally in the browser.

## Constitutional flows

Snap election: Seek Cabinet -> Meet the King/Queen -> Announce election -> Polling day.

Resignation: Announce resignation -> Make timetable -> Announce timetable -> Reach final date -> Meet the King/Queen and resign.
