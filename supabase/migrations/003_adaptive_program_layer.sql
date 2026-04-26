create extension if not exists "pgcrypto";

create table if not exists program_slot_states (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  program_day_id uuid not null references program_days (id) on delete cascade,
  phase_number integer not null,
  week_number integer not null,
  day_number integer not null,
  sequence_order integer not null,
  status text not null default 'pending',
  last_session_id uuid references workout_sessions (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (program_id, phase_number, week_number, day_number),
  unique (program_id, sequence_order)
);

create index if not exists idx_program_slot_states_program_id
  on program_slot_states (program_id);

create index if not exists idx_program_slot_states_status
  on program_slot_states (program_id, status);

create index if not exists idx_program_slot_states_program_day_id
  on program_slot_states (program_day_id);

drop trigger if exists trg_program_slot_states_updated_at on program_slot_states;
create trigger trg_program_slot_states_updated_at
before update on program_slot_states
for each row
execute procedure set_row_updated_at();

create table if not exists workout_session_drafts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references workout_sessions (id) on delete cascade,
  program_id uuid references programs (id) on delete cascade,
  program_day_id uuid references program_days (id) on delete cascade,
  phase_number integer,
  week_number integer,
  day_number integer,
  updated_by_client_id text,
  draft_data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (session_id)
);

create index if not exists idx_workout_session_drafts_program_id
  on workout_session_drafts (program_id, updated_at desc);

drop trigger if exists trg_workout_session_drafts_updated_at on workout_session_drafts;
create trigger trg_workout_session_drafts_updated_at
before update on workout_session_drafts
for each row
execute procedure set_row_updated_at();

create table if not exists readiness_logs (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  session_id uuid references workout_sessions (id) on delete cascade,
  program_day_id uuid references program_days (id) on delete set null,
  phase_number integer,
  week_number integer,
  day_number integer,
  sleep_score integer check (sleep_score between 1 and 5),
  soreness_score integer check (soreness_score between 1 and 5),
  stress_score integer check (stress_score between 1 and 5),
  energy_score integer check (energy_score between 1 and 5),
  readiness_score numeric not null,
  readiness_band text not null,
  created_at timestamptz default now(),
  unique (session_id)
);

create index if not exists idx_readiness_logs_program_id
  on readiness_logs (program_id, created_at desc);

create table if not exists program_exercise_preferences (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  phase_number integer not null,
  day_number integer not null,
  display_order integer not null,
  original_exercise_id uuid references exercises (id) on delete set null,
  preferred_exercise_id uuid references exercises (id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (program_id, phase_number, day_number, display_order)
);

create index if not exists idx_program_exercise_preferences_program_id
  on program_exercise_preferences (program_id);

drop trigger if exists trg_program_exercise_preferences_updated_at on program_exercise_preferences;
create trigger trg_program_exercise_preferences_updated_at
before update on program_exercise_preferences
for each row
execute procedure set_row_updated_at();

create table if not exists program_load_guidance (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  phase_number integer not null,
  day_number integer not null,
  display_order integer not null,
  exercise_id uuid not null references exercises (id) on delete cascade,
  guidance_action text not null,
  target_weight numeric,
  source_session_id uuid references workout_sessions (id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (program_id, phase_number, day_number, display_order, exercise_id)
);

create index if not exists idx_program_load_guidance_program_id
  on program_load_guidance (program_id);

drop trigger if exists trg_program_load_guidance_updated_at on program_load_guidance;
create trigger trg_program_load_guidance_updated_at
before update on program_load_guidance
for each row
execute procedure set_row_updated_at();
