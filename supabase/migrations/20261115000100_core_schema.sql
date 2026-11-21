-- まちなかの居心地の良さを測る指標 調査アプリ：基本スキーマ
-- 方針:
--   * public スキーマの全テーブルで RLS を有効化する。
--   * 主催者は自分が所有する調査（surveys.owner_id = auth.uid()）のデータだけ参照できる。
--   * 主催者の書き込みは列単位 GRANT とトリガーで制限し、状態遷移は SECURITY DEFINER 関数に限定する。
--   * 調査者（QR参加者）は DB に直接アクセスしない。サーバー（service_role）だけが participant_* 関数を呼ぶ。

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 型
-- ---------------------------------------------------------------------------
create type public.round_status as enum ('draft', 'active', 'closed');
create type public.submission_status as enum ('draft', 'submitted', 'returned', 'accepted', 'excluded');
create type public.answer_state as enum ('answered', 'unanswered', 'not_applicable', 'hidden', 'fixed');
create type public.site_type as enum ('street', 'plaza', 'other');

-- ---------------------------------------------------------------------------
-- 設問マスタ（不変。新しい版は新しい行として追加する）
-- ---------------------------------------------------------------------------
create table public.question_master (
  id text primary key,
  version text not null,
  section text not null,
  element text,
  kind text not null,
  code text not null,
  pair_no int,
  original_no text not null,
  category text,
  text text not null,
  answer_format text not null,
  options jsonb,
  applicability jsonb,
  computed_from text[],
  source text not null,
  verification text not null check (verification in ('pdf_verified', 'pdf_excel_verified', 'app_defined', 'unverified')),
  excel_row int,
  excel_label text,
  notes text,
  display_order int not null,
  default_visible boolean not null default true,
  created_at timestamptz not null default now(),
  unique (version, code)
);
comment on table public.question_master is '設問マスタ。原票番号・正式文言・版・回答形式・適用条件・出典を持つ。行は不変。';

create or replace function public.prevent_master_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'MCS:master_immutable 設問マスタは変更できません。新しい版として追加してください。';
end;
$$;

create trigger question_master_immutable
before update or delete on public.question_master
for each row execute function public.prevent_master_mutation();

-- ---------------------------------------------------------------------------
-- 調査・調査回
-- ---------------------------------------------------------------------------
create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  purpose text not null default '' check (char_length(purpose) <= 4000),
  organizer_name text not null default '' check (char_length(organizer_name) <= 200),
  site_name text not null default '' check (char_length(site_name) <= 200),
  site_address text not null default '' check (char_length(site_address) <= 300),
  site_type public.site_type not null default 'street',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index surveys_owner_idx on public.surveys (owner_id);

create table public.survey_rounds (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  round_number int not null check (round_number >= 1),
  title text not null default '' check (char_length(title) <= 200),
  status public.round_status not null default 'draft',
  scope_text text not null default '' check (char_length(scope_text) <= 4000),
  frontage_scope_text text not null default '' check (char_length(frontage_scope_text) <= 4000),
  peripheral_scope_text text not null default '' check (char_length(peripheral_scope_text) <= 4000),
  survey_date date,
  is_holiday boolean not null default false,
  start_time time,
  end_time time,
  is_night boolean not null default false,
  event_name text not null default '' check (char_length(event_name) <= 200),
  stay_measure_minutes numeric(7, 2) check (stay_measure_minutes is null or (stay_measure_minutes > 0 and stay_measure_minutes <= 1440)),
  pass_measure_minutes numeric(7, 2) check (pass_measure_minutes is null or (pass_measure_minutes > 0 and pass_measure_minutes <= 1440)),
  previous_actions text not null default '' check (char_length(previous_actions) <= 4000),
  notes text not null default '' check (char_length(notes) <= 4000),
  site_metrics jsonb not null default '{}'::jsonb,
  master_version text not null default 'ver1.1',
  calc_version text,
  settings_snapshot jsonb,
  snapshot_hash text,
  started_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (survey_id, round_number),
  check (status = 'draft' or settings_snapshot is not null)
);
create index survey_rounds_owner_idx on public.survey_rounds (owner_id);
create index survey_rounds_survey_idx on public.survey_rounds (survey_id);

-- 調査回の設問スナップショット（開始後は変更不可）
create table public.round_questions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.survey_rounds (id) on delete cascade,
  master_id text references public.question_master (id),
  is_custom boolean not null default false,
  section text not null,
  element text,
  kind text not null,
  code text not null,
  pair_no int,
  original_no text,
  category text,
  text text not null check (char_length(text) between 1 and 500),
  answer_format text not null,
  options jsonb,
  applicability jsonb,
  computed_from text[],
  verification text not null,
  visible boolean not null default true,
  fixed_value jsonb,
  display_order int not null,
  source text,
  notes text check (notes is null or char_length(notes) <= 2000),
  unique (round_id, code),
  unique (id, round_id),
  check (is_custom or master_id is not null)
);
create index round_questions_round_idx on public.round_questions (round_id);

-- ---------------------------------------------------------------------------
-- 参加リンク（トークンは SHA-256 ハッシュで照合。再表示用の暗号文はアプリ鍵で暗号化）
-- ---------------------------------------------------------------------------
create table public.participant_links (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.survey_rounds (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_ciphertext text not null check (char_length(token_ciphertext) <= 1000),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text,
  max_submissions int not null default 300 check (max_submissions between 1 and 10000),
  max_registrations int not null default 200 check (max_registrations between 1 and 10000)
);
create unique index participant_links_one_active on public.participant_links (round_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- 調査者・提出・回答
-- ---------------------------------------------------------------------------
create table public.surveyors (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.survey_rounds (id) on delete cascade,
  link_id uuid not null references public.participant_links (id) on delete cascade,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  display_name text not null check (char_length(display_name) between 1 and 100),
  affiliation text not null default '' check (char_length(affiliation) <= 200),
  age_band text not null default '' check (age_band in ('', '10s', '20s', '30s', '40s', '50s', '60s', '70plus', 'no_answer')),
  gender text not null default '' check (gender in ('', 'male', 'female', 'other', 'no_answer')),
  personal_data_purged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, round_id)
);
create index surveyors_round_idx on public.surveyors (round_id);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.survey_rounds (id) on delete cascade,
  surveyor_id uuid not null unique,
  status public.submission_status not null default 'draft',
  revision int not null default 0,
  draft_payload jsonb,
  draft_saved_at timestamptz,
  submitted_at timestamptz,
  last_idempotency_key uuid,
  review_note text not null default '' check (char_length(review_note) <= 2000),
  observations_included boolean not null default true,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (surveyor_id, round_id) references public.surveyors (id, round_id) on delete cascade,
  unique (id, round_id)
);
create index submissions_round_idx on public.submissions (round_id);

create table public.submission_revisions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  round_id uuid not null,
  revision int not null,
  idempotency_key uuid not null unique,
  payload jsonb not null,
  submitted_at timestamptz not null default now(),
  foreign key (submission_id, round_id) references public.submissions (id, round_id) on delete cascade,
  unique (submission_id, revision)
);

create table public.answers (
  id bigint generated always as identity primary key,
  submission_id uuid not null,
  round_id uuid not null,
  round_question_id uuid not null,
  revision int not null,
  state public.answer_state not null,
  value_num numeric,
  value_text text check (value_text is null or char_length(value_text) <= 2000),
  foreign key (submission_id, round_id) references public.submissions (id, round_id) on delete cascade,
  foreign key (round_question_id, round_id) references public.round_questions (id, round_id) on delete cascade,
  unique (submission_id, round_question_id),
  check (
    (state in ('answered', 'fixed') and num_nonnulls(value_num, value_text) = 1)
    or (state not in ('answered', 'fixed') and value_num is null and value_text is null)
  )
);
create index answers_round_idx on public.answers (round_id);

-- 空間A（沿道建物・土地）の件数。0件は state=answered, count=0。未回答は count=null。
create table public.space_counts (
  id bigint generated always as identity primary key,
  submission_id uuid not null,
  round_id uuid not null,
  round_question_id uuid not null,
  revision int not null,
  state public.answer_state not null,
  count int check (count is null or count between 0 and 9999),
  foreign key (submission_id, round_id) references public.submissions (id, round_id) on delete cascade,
  foreign key (round_question_id, round_id) references public.round_questions (id, round_id) on delete cascade,
  unique (submission_id, round_question_id),
  check ((state in ('answered', 'fixed')) = (count is not null))
);
create index space_counts_round_idx on public.space_counts (round_id);

-- 滞在者・通行者の観察（グループ単位）。属性を非表示にした場合はその列が null。
create table public.observation_groups (
  id bigint generated always as identity primary key,
  submission_id uuid not null,
  round_id uuid not null,
  revision int not null,
  seq int not null check (seq between 1 and 5000),
  presence text not null check (presence in ('stay', 'pass')),
  group_type text not null check (group_type in ('single', 'family', 'group', 'party')),
  group_size int not null check (group_size between 1 and 500),
  male int check (male >= 0),
  female int check (female >= 0),
  gender_unknown int check (gender_unknown >= 0),
  infant int check (infant >= 0),
  child int check (child >= 0),
  teen int check (teen >= 0),
  adult int check (adult >= 0),
  elderly int check (elderly >= 0),
  age_unknown int check (age_unknown >= 0),
  walk_fast int check (walk_fast >= 0),
  walk_slow int check (walk_slow >= 0),
  japanese int check (japanese >= 0),
  foreigner int check (foreigner >= 0),
  nationality_unknown int check (nationality_unknown >= 0),
  note text not null default '' check (char_length(note) <= 500),
  foreign key (submission_id, round_id) references public.submissions (id, round_id) on delete cascade,
  unique (submission_id, seq),
  check (
    (group_type = 'single' and group_size = 1)
    or (group_type = 'family' and group_size >= 2)
    or (group_type in ('group', 'party') and group_size >= 2)
  ),
  check (num_nonnulls(male, female, gender_unknown) in (0, 3)),
  check (male is null or male + female + gender_unknown = group_size),
  check (num_nonnulls(infant, child, teen, adult, elderly, age_unknown) in (0, 6)),
  check (infant is null or infant + child + teen + adult + elderly + age_unknown = group_size),
  check (num_nonnulls(japanese, foreigner, nationality_unknown) in (0, 3)),
  check (japanese is null or japanese + foreigner + nationality_unknown = group_size),
  check (num_nonnulls(walk_fast, walk_slow) in (0, 2)),
  check (presence = 'pass' or walk_fast is null),
  check (walk_fast is null or walk_fast + walk_slow = group_size)
);
create index observation_groups_round_idx on public.observation_groups (round_id);

-- ---------------------------------------------------------------------------
-- 審査・代表値・集計・履歴
-- ---------------------------------------------------------------------------
create table public.submission_reviews (
  id bigint generated always as identity primary key,
  submission_id uuid not null,
  round_id uuid not null,
  from_status public.submission_status not null,
  to_status public.submission_status not null,
  note text not null default '',
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (submission_id, round_id) references public.submissions (id, round_id) on delete cascade
);

create table public.representative_values (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null,
  round_question_id uuid not null,
  value_state text not null check (value_state in ('value', 'not_applicable', 'no_data')),
  value_num numeric,
  method text not null check (method in ('mean', 'mode', 'manual', 'fixed')),
  basis jsonb not null default '{}'::jsonb,
  note text not null default '' check (char_length(note) <= 2000),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz not null default now(),
  foreign key (round_question_id, round_id) references public.round_questions (id, round_id) on delete cascade,
  unique (round_id, round_question_id),
  check ((value_state = 'value') = (value_num is not null))
);

create table public.round_results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.survey_rounds (id) on delete cascade,
  version int not null,
  calc_version text not null,
  payload jsonb not null,
  note text not null default '' check (char_length(note) <= 2000),
  finalized_by uuid references auth.users (id) on delete set null,
  finalized_at timestamptz not null default now(),
  unique (round_id, version)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  owner_id uuid,
  survey_id uuid,
  round_id uuid,
  actor_type text not null check (actor_type in ('organizer', 'participant', 'system')),
  actor_id uuid,
  action text not null,
  target_type text,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_round_idx on public.audit_logs (round_id, created_at desc);
create index audit_logs_owner_idx on public.audit_logs (owner_id, created_at desc);

create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  link_id uuid,
  surveyor_id uuid,
  kind text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_idx on public.rate_limit_events (kind, link_id, surveyor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 共通関数・トリガー
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger surveys_touch before update on public.surveys for each row execute function public.touch_updated_at();
create trigger survey_rounds_touch before update on public.survey_rounds for each row execute function public.touch_updated_at();
create trigger submissions_touch before update on public.submissions for each row execute function public.touch_updated_at();

create or replace function public.owns_round(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.survey_rounds r
    where r.id = p_round_id and r.owner_id = (select auth.uid())
  );
$$;

create or replace function public.write_audit(
  p_round_id uuid,
  p_actor_type text,
  p_actor_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_detail jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_survey uuid;
begin
  select owner_id, survey_id into v_owner, v_survey from public.survey_rounds where id = p_round_id;
  insert into public.audit_logs (owner_id, survey_id, round_id, actor_type, actor_id, action, target_type, target_id, detail)
  values (v_owner, v_survey, p_round_id, p_actor_type, p_actor_id, p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
end;
$$;

-- 調査回: 開始後は設定を変更できない（状態遷移は SECURITY DEFINER 関数のみ）
create or replace function public.guard_round_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' and current_setting('mcs.allow_round_transition', true) is distinct from 'on' then
    raise exception 'MCS:round_locked 開始済みの調査回の設定は変更できません。';
  end if;
  if new.owner_id <> old.owner_id or new.survey_id <> old.survey_id then
    raise exception 'MCS:forbidden 所有者・調査は変更できません。';
  end if;
  return new;
end;
$$;

create trigger survey_rounds_guard before update on public.survey_rounds
for each row execute function public.guard_round_update();

-- 設問スナップショット: 下書き中のみ変更可。標準設問の文言は変更不可。
create or replace function public.guard_round_questions()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.round_status;
  v_round uuid;
begin
  if current_setting('mcs.allow_round_transition', true) = 'on' then
    return coalesce(new, old);
  end if;
  v_round := coalesce(new.round_id, old.round_id);
  select status into v_status from public.survey_rounds where id = v_round;
  if tg_op = 'DELETE' and not found then
    -- 調査回・調査の削除に伴うカスケード削除
    return old;
  end if;
  if v_status is distinct from 'draft' and current_setting('mcs.allow_round_transition', true) is distinct from 'on' then
    raise exception 'MCS:round_locked 開始済みの調査回の設問は変更できません。';
  end if;
  if tg_op = 'UPDATE' then
    if new.round_id <> old.round_id or new.code <> old.code or new.is_custom <> old.is_custom
       or new.master_id is distinct from old.master_id or new.answer_format <> old.answer_format
       or new.section <> old.section or new.kind <> old.kind then
      raise exception 'MCS:forbidden 設問の識別情報は変更できません。';
    end if;
    if not old.is_custom and new.text <> old.text then
      raise exception 'MCS:forbidden 標準設問の文言は変更できません（独自項目を追加してください）。';
    end if;
    if new.visible = false and old.code in ('OBS-PRESENCE', 'OBS-GROUP') then
      raise exception 'MCS:invalid 滞在・通行とグループ属性は非表示にできません。';
    end if;
    if new.fixed_value is not null and (new.answer_format in ('computed', 'observation', 'text') ) then
      raise exception 'MCS:invalid この設問には固定値を設定できません。';
    end if;
  end if;
  if tg_op = 'DELETE' and not old.is_custom then
    raise exception 'MCS:forbidden 標準設問は削除できません（非表示にしてください）。';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger round_questions_guard before insert or update or delete on public.round_questions
for each row execute function public.guard_round_questions();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.question_master enable row level security;
alter table public.surveys enable row level security;
alter table public.survey_rounds enable row level security;
alter table public.round_questions enable row level security;
alter table public.participant_links enable row level security;
alter table public.surveyors enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_revisions enable row level security;
alter table public.answers enable row level security;
alter table public.space_counts enable row level security;
alter table public.observation_groups enable row level security;
alter table public.submission_reviews enable row level security;
alter table public.representative_values enable row level security;
alter table public.round_results enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limit_events enable row level security;

-- 既定の広い権限を外し、必要な権限だけを付与する
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.question_master to authenticated;
create policy question_master_read on public.question_master for select to authenticated using (true);

grant select, insert, delete on public.surveys to authenticated;
grant update (name, purpose, organizer_name, site_name, site_address, site_type) on public.surveys to authenticated;
create policy surveys_select on public.surveys for select to authenticated using (owner_id = (select auth.uid()));
create policy surveys_insert on public.surveys for insert to authenticated with check (owner_id = (select auth.uid()));
create policy surveys_update on public.surveys for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy surveys_delete on public.surveys for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and not exists (select 1 from public.survey_rounds r where r.survey_id = surveys.id and r.status = 'active')
  );

grant select on public.survey_rounds to authenticated;
grant update (
  title, scope_text, frontage_scope_text, peripheral_scope_text, survey_date, is_holiday, start_time, end_time,
  is_night, event_name, stay_measure_minutes, pass_measure_minutes, previous_actions, notes, site_metrics
) on public.survey_rounds to authenticated;
create policy survey_rounds_select on public.survey_rounds for select to authenticated using (owner_id = (select auth.uid()));
create policy survey_rounds_update on public.survey_rounds for update to authenticated
  using (owner_id = (select auth.uid()) and status = 'draft') with check (owner_id = (select auth.uid()));

grant select, delete on public.round_questions to authenticated;
grant update (visible, fixed_value, text, display_order, notes) on public.round_questions to authenticated;
create policy round_questions_select on public.round_questions for select to authenticated using (public.owns_round(round_id));
create policy round_questions_update on public.round_questions for update to authenticated
  using (public.owns_round(round_id)) with check (public.owns_round(round_id));
create policy round_questions_delete on public.round_questions for delete to authenticated
  using (public.owns_round(round_id) and is_custom);

grant select (id, round_id, created_at, expires_at, revoked_at, revoked_reason, max_submissions, max_registrations, token_ciphertext, created_by)
  on public.participant_links to authenticated;
create policy participant_links_select on public.participant_links for select to authenticated using (public.owns_round(round_id));

grant select (id, round_id, link_id, display_name, affiliation, age_band, gender, personal_data_purged_at, created_at)
  on public.surveyors to authenticated;
create policy surveyors_select on public.surveyors for select to authenticated using (public.owns_round(round_id));

grant select on public.submissions to authenticated;
create policy submissions_select on public.submissions for select to authenticated using (public.owns_round(round_id));

grant select on public.submission_revisions to authenticated;
create policy submission_revisions_select on public.submission_revisions for select to authenticated using (public.owns_round(round_id));

grant select on public.answers to authenticated;
create policy answers_select on public.answers for select to authenticated using (public.owns_round(round_id));

grant select on public.space_counts to authenticated;
create policy space_counts_select on public.space_counts for select to authenticated using (public.owns_round(round_id));

grant select on public.observation_groups to authenticated;
create policy observation_groups_select on public.observation_groups for select to authenticated using (public.owns_round(round_id));

grant select on public.submission_reviews to authenticated;
create policy submission_reviews_select on public.submission_reviews for select to authenticated using (public.owns_round(round_id));

grant select on public.representative_values to authenticated;
create policy representative_values_select on public.representative_values for select to authenticated using (public.owns_round(round_id));

grant select on public.round_results to authenticated;
create policy round_results_select on public.round_results for select to authenticated using (public.owns_round(round_id));

grant select on public.audit_logs to authenticated;
create policy audit_logs_select on public.audit_logs for select to authenticated using (owner_id = (select auth.uid()));

-- rate_limit_events: ポリシーなし（service_role / SECURITY DEFINER 関数のみ）
