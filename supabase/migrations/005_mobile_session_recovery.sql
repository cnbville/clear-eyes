alter table workout_sessions
  add column if not exists session_snapshot jsonb not null default '{}'::jsonb;

alter table workout_session_drafts
  add column if not exists source text not null default 'program',
  add column if not exists template_id uuid references custom_templates (id) on delete set null;

create index if not exists idx_workout_sessions_status_source
  on workout_sessions (status, source, started_at desc);

create index if not exists idx_workout_session_drafts_source_template
  on workout_session_drafts (source, template_id, updated_at desc);
