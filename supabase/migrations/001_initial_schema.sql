create extension if not exists "pgcrypto";

create table programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  author text,
  days_per_week int default 5,
  is_active bool default false,
  source_filename text,
  created_at timestamptz default now()
);

create table program_phases (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  phase_number int not null,
  name text not null,
  description text,
  num_weeks int not null,
  color_accent text default '#c9a227',
  unique (program_id, phase_number)
);

create table program_weeks (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references program_phases (id) on delete cascade,
  week_number int not null,
  global_week_number int not null,
  label text,
  unique (phase_id, week_number)
);

create table program_days (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references program_weeks (id) on delete cascade,
  day_number int not null,
  name text not null,
  day_type text,
  rest_note text,
  unique (week_id, day_number)
);

create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  primary_muscle_group text,
  secondary_muscle_groups text[],
  equipment text,
  is_custom bool default false,
  video_url text,
  created_at timestamptz default now()
);

create table prescribed_exercises (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references program_days (id) on delete cascade,
  exercise_id uuid references exercises (id),
  display_order int not null,
  warmup_sets int default 0,
  working_sets int not null,
  rep_notation text not null,
  rep_min int,
  rep_max int,
  rpe_target numeric,
  rpe_notation text,
  rest_seconds int,
  rest_notation text,
  group_id text,
  group_type text,
  group_order int,
  substitution_1 text,
  substitution_2 text,
  coaching_cue text,
  unique (day_id, display_order)
);

create table set_targets (
  id uuid primary key default gen_random_uuid(),
  prescribed_exercise_id uuid not null references prescribed_exercises (id) on delete cascade,
  set_number int not null,
  target_reps int,
  target_rpe numeric,
  target_weight_pct numeric,
  notes text,
  unique (prescribed_exercise_id, set_number)
);

create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid references program_days (id),
  phase_number int,
  week_number int,
  date date default current_date,
  started_at timestamptz,
  completed_at timestamptz,
  status text default 'planned',
  notes text,
  mood_rating int check (mood_rating between 1 and 5),
  session_rpe int check (session_rpe between 1 and 10),
  total_volume numeric,
  total_sets int,
  duration_minutes int,
  rest_discipline_score numeric,
  prs_hit int default 0,
  created_at timestamptz default now()
);

create table logged_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references workout_sessions (id) on delete cascade,
  prescribed_exercise_id uuid references prescribed_exercises (id),
  exercise_id uuid not null references exercises (id),
  set_number int not null,
  set_type text default 'working',
  weight numeric,
  reps int,
  duration_seconds int,
  rpe_actual numeric,
  rest_prescribed_seconds int,
  rest_taken_seconds int,
  is_adhoc bool default false,
  is_pr bool default false,
  pr_type text,
  logged_at timestamptz default now()
);

create table personal_records (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid references exercises (id),
  pr_type text not null,
  value numeric not null,
  weight numeric,
  reps int,
  session_id uuid references workout_sessions (id),
  achieved_at date not null,
  unique (exercise_id, pr_type)
);

create table user_progress (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs (id),
  current_phase int default 1,
  current_week int default 1,
  current_day int default 1,
  session_streak int default 0,
  longest_streak int default 0,
  streak_shields_remaining int default 2,
  streak_shields_reset_at date,
  weekly_target int default 5,
  weekly_completed int default 0,
  week_start_date date,
  total_sessions int default 0,
  total_volume_lifetime numeric default 0,
  total_prs int default 0,
  total_xp int default 0,
  level int default 1,
  last_workout_date date,
  updated_at timestamptz default now()
);

create table phase_snapshots (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs (id),
  phase_number int not null,
  completed_at timestamptz,
  sessions_completed int,
  sessions_total int,
  total_volume numeric,
  prs_hit int,
  avg_rest_discipline numeric,
  streak_at_completion int,
  xp_earned int,
  lift_comparisons jsonb,
  phase_baselines jsonb,
  unique (program_id, phase_number)
);

create table user_equipment (
  id uuid primary key default gen_random_uuid(),
  equipment_type text not null,
  weight numeric not null,
  quantity int default 2,
  unit text default 'kg',
  label text
);

create table body_metrics (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  weight_kg numeric,
  body_fat_pct numeric,
  notes text,
  created_at timestamptz default now()
);

create index idx_logged_sets_session_id on logged_sets (session_id);
create index idx_logged_sets_exercise_id on logged_sets (exercise_id);
create index idx_workout_sessions_date on workout_sessions (date);
create index idx_workout_sessions_program_day_id on workout_sessions (program_day_id);
create index idx_prescribed_exercises_day_id on prescribed_exercises (day_id);
create index idx_personal_records_exercise_id on personal_records (exercise_id);
create index idx_program_days_week_id on program_days (week_id);
create index idx_program_weeks_phase_id on program_weeks (phase_id);
create index idx_phase_snapshots_program_id on phase_snapshots (program_id);

insert into user_equipment (equipment_type, weight, quantity, unit, label)
values
  ('olympic_barbell', 20, 1, 'kg', 'Olympic Barbell'),
  ('ez_curl_bar', 10, 1, 'kg', 'EZ Curl Bar'),
  ('plate', 20, 2, 'kg', '20 kg Plate'),
  ('plate', 15, 2, 'kg', '15 kg Plate'),
  ('plate', 10, 2, 'kg', '10 kg Plate'),
  ('plate', 5, 2, 'kg', '5 kg Plate'),
  ('plate', 2.5, 2, 'kg', '2.5 kg Plate'),
  ('plate', 1.25, 2, 'kg', '1.25 kg Plate');
