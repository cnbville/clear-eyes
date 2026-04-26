create table if not exists exercise_notes (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references exercises (id) on delete cascade,
  note text,
  last_session_id uuid references workout_sessions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exercise_id)
);

alter table logged_sets
  add column if not exists rest_baseline_seconds int;

alter table logged_sets
  add column if not exists rest_target_source text;

create index if not exists idx_exercise_notes_exercise_id
  on exercise_notes (exercise_id);
