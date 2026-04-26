create extension if not exists "pgcrypto";

alter table exercises
  add column if not exists slug text,
  add column if not exists muscle_group text,
  add column if not exists secondary_muscles text[] default '{}',
  add column if not exists movement_type text default 'isolation',
  add column if not exists force text,
  add column if not exists mechanic text,
  add column if not exists instructions text,
  add column if not exists image_id text;

update exercises
set slug = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')
where slug is null;

update exercises
set slug = trim(both '-' from slug)
where slug is not null;

update exercises
set muscle_group = coalesce(muscle_group, primary_muscle_group, 'full_body')
where muscle_group is null;

update exercises
set secondary_muscles = coalesce(secondary_muscles, secondary_muscle_groups, '{}')
where secondary_muscles is null;

update exercises
set equipment = coalesce(equipment, 'bodyweight')
where equipment is null;

update exercises
set movement_type = coalesce(
  movement_type,
  case
    when lower(name) ~ '(press|row|squat|deadlift|lunge|thrust|clean|pull-through|carry)'
      then 'compound'
    else 'isolation'
  end
)
where movement_type is null;

update exercises
set mechanic = coalesce(
  mechanic,
  case
    when equipment = 'cable' then 'cable'
    when equipment in ('bodyweight', 'bench') then 'bodyweight'
    else 'free_weight'
  end
)
where mechanic is null;

update exercises
set force = coalesce(
  force,
  case
    when lower(name) ~ '(press|push|dip|thruster)' then 'push'
    when lower(name) ~ '(plank|wall sit|carry|hold)' then 'static'
    else 'pull'
  end
)
where force is null;

alter table exercises
  alter column slug set not null,
  alter column muscle_group set not null,
  alter column equipment set not null,
  alter column movement_type set default 'isolation',
  alter column secondary_muscles set default '{}',
  alter column is_custom set default false;

create unique index if not exists idx_exercises_slug_unique on exercises (slug);
create index if not exists idx_exercises_muscle_group on exercises (muscle_group);
create index if not exists idx_exercises_equipment on exercises (equipment);

create table if not exists custom_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  focus text not null,
  focus_color text,
  estimated_duration integer,
  total_sets integer,
  notes text,
  times_used integer default 0,
  last_used_at timestamptz,
  is_archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists custom_template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references custom_templates (id) on delete cascade,
  exercise_id uuid references exercises (id) on delete set null,
  order_index integer not null,
  sets integer not null,
  reps_target text not null,
  tempo text,
  rest_seconds integer,
  rpe text,
  technique text,
  superset_group text,
  notes text
);

create index if not exists idx_custom_template_exercises_template_id
  on custom_template_exercises (template_id);

create or replace function set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_custom_templates_updated_at on custom_templates;
create trigger trg_custom_templates_updated_at
before update on custom_templates
for each row
execute procedure set_row_updated_at();

alter table workout_sessions
  add column if not exists source text not null default 'program',
  add column if not exists template_id uuid references custom_templates (id) on delete set null;

create index if not exists idx_workout_sessions_source on workout_sessions (source);
create index if not exists idx_workout_sessions_template_id on workout_sessions (template_id);
