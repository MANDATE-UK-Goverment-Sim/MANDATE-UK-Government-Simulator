-- Optional reference scenario metadata for MANDATE v5.
-- The live browser game creates the player's party dynamically during the opening campaign.

create table if not exists public.scenario_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  configuration jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.scenario_templates (slug,title,description,configuration)
values (
  'avalon-2029-campaign',
  'Avalon: The General Election',
  'Create an original party, fight a two-week national campaign, contest a 640-seat general election, form a Cabinet and begin a premiership.',
  '{"parliament_seats":640,"campaign_weeks":2,"starting_player_poll":36.8,"currency":"GBP","requires_cabinet_formation":true,"annual_local_elections":true,"pmqs_frequency_weeks":2,"succession_system":true}'::jsonb
)
on conflict (slug) do update set
  title=excluded.title,
  description=excluded.description,
  configuration=excluded.configuration;
