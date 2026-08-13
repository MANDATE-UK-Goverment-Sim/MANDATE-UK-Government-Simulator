# MANDATE v5 — Political Careers Edition

A static browser political simulator for GitHub Pages with optional Supabase cloud saving.

## Flat-file structure

Everything stays in the repository root:

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `schema.sql`
- `seed.sql`
- `README.md`

There are **no folders required**.

## New in v5

### Multiple premierships / save slots
- Open **Premierships** from the sidebar.
- Each slot is an independent political career.
- **New premiership** creates another slot instead of deleting your existing government.
- v4 local saves are automatically migrated into a v5 slot when possible.

### Personal voting
The player can personally vote in:
- Opening General Election
- Later General Elections
- Snap General Elections
- Annual Local Elections
- Governing-party leadership contests after resignation

Your personal ballot is recorded separately from the national result. One player ballot does not magically decide the whole country.

### Local elections
- Held annually on the first Thursday in May.
- 3,000 fictional council seats are allocated across Avalon.
- Results react to national polling plus local variation.
- Strong or weak government performance can move Prime Ministerial likeness.
- Local elections appear in the Prime Minister's calendar.

### Likeness and leadership pressure
The visible Prime Minister **likeness** scale runs around zero:
- `0%` = country is evenly divided
- positive = net favourable
- negative = net unfavourable

When likeness reaches **-20% or worse**, Cabinet and party pressure begins. Each bad week can increase leadership pressure, reduce ministerial loyalty and generate resignation headlines. Recovering above the danger zone gradually calms the revolt.

### Resignation succession
The formal resignation route remains:
1. Announce resignation
2. Make timetable
3. Announce timetable
4. Final day: meet the King/Queen and resign

After the final royal audience:
- Two serving Cabinet ministers reach a leadership final.
- You personally vote for one.
- The party chooses the winner.
- You can retire, or **continue as the winning minister** and begin their premiership.
- The successor's name is fixed and cannot be edited.

### Election defeat succession
If another party beats your government in a later General Election:
- Your outgoing premiership is archived.
- The winning party and its incoming leader are shown.
- You can end that career or **take control of the incoming Prime Minister**.
- The incoming PM's name is fixed and cannot be changed.

The same takeover choice is also available if you lose the opening General Election.

## Supabase

`config.js` already contains the supplied project URL and browser publishable key.

To enable cloud saves:
1. Open your Supabase project.
2. Enable Anonymous Sign-Ins under Authentication if you want frictionless saving.
3. Open SQL Editor.
4. Run `schema.sql`.
5. Optionally run `seed.sql`.
6. Upload the flat files to GitHub Pages.

The app saves the whole simulation state in the `games.state` JSONB field. The additional SQL tables in v5 provide a future-ready structure for premiership history, local election results, leadership contests and personal ballots.

## Safety of the browser key

The key in `config.js` is a **publishable** client key. Keep Row Level Security enabled. Never place a Supabase service-role secret or other private server credential in this static site.
