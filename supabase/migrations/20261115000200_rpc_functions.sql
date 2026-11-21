-- 主催者用・調査者用の RPC 関数
-- 主催者用: SECURITY DEFINER + auth.uid() による所有者確認。authenticated に EXECUTE を付与。
-- 調査者用: SECURITY DEFINER。service_role（サーバー）にのみ EXECUTE を付与し、ブラウザから直接呼べない。

-- ---------------------------------------------------------------------------
-- 内部ヘルパー
-- ---------------------------------------------------------------------------
create or replace function public._assert_round_owner(p_round_id uuid)
returns public.survey_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.survey_rounds;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'MCS:unauthenticated ログインが必要です。';
  end if;
  select * into v_round from public.survey_rounds where id = p_round_id for update;
  if not found or v_round.owner_id <> v_uid then
    raise exception 'MCS:not_found 調査回が見つかりません。';
  end if;
  return v_round;
end;
$$;

create or replace function public._allow_transition()
returns void
language sql
set search_path = ''
as $$
  select set_config('mcs.allow_round_transition', 'on', true);
$$;

-- ---------------------------------------------------------------------------
-- 主催者: 調査回の作成（設問マスタまたは前回の設問をコピー）
-- ---------------------------------------------------------------------------
create or replace function public.create_round(p_survey_id uuid, p_copy_from uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_survey public.surveys;
  v_src public.survey_rounds;
  v_round_id uuid;
  v_no int;
begin
  if v_uid is null then
    raise exception 'MCS:unauthenticated ログインが必要です。';
  end if;
  select * into v_survey from public.surveys where id = p_survey_id;
  if not found or v_survey.owner_id <> v_uid then
    raise exception 'MCS:not_found 調査が見つかりません。';
  end if;
  if p_copy_from is not null then
    select * into v_src from public.survey_rounds where id = p_copy_from and survey_id = p_survey_id and owner_id = v_uid;
    if not found then
      raise exception 'MCS:not_found コピー元の調査回が見つかりません。';
    end if;
  end if;

  perform 1 from public.surveys where id = p_survey_id for update;
  select coalesce(max(round_number), 0) + 1 into v_no from public.survey_rounds where survey_id = p_survey_id;

  insert into public.survey_rounds (
    survey_id, owner_id, round_number, title, scope_text, frontage_scope_text, peripheral_scope_text,
    start_time, end_time, is_night, stay_measure_minutes, pass_measure_minutes, site_metrics
  ) values (
    p_survey_id, v_uid, v_no, '第' || v_no || '回',
    coalesce(v_src.scope_text, ''), coalesce(v_src.frontage_scope_text, ''), coalesce(v_src.peripheral_scope_text, ''),
    v_src.start_time, v_src.end_time, coalesce(v_src.is_night, false),
    v_src.stay_measure_minutes, v_src.pass_measure_minutes, coalesce(v_src.site_metrics, '{}'::jsonb)
  ) returning id into v_round_id;

  if p_copy_from is not null then
    insert into public.round_questions (
      round_id, master_id, is_custom, section, element, kind, code, pair_no, original_no, category, text,
      answer_format, options, applicability, computed_from, verification, visible, fixed_value, display_order, source, notes
    )
    select v_round_id, q.master_id, q.is_custom, q.section, q.element, q.kind, q.code, q.pair_no, q.original_no, q.category, q.text,
      q.answer_format, q.options, q.applicability, q.computed_from, q.verification, q.visible, q.fixed_value, q.display_order, q.source, q.notes
    from public.round_questions q where q.round_id = p_copy_from;
  else
    insert into public.round_questions (
      round_id, master_id, is_custom, section, element, kind, code, pair_no, original_no, category, text,
      answer_format, options, applicability, computed_from, verification, visible, fixed_value, display_order, source, notes
    )
    select v_round_id, m.id, false, m.section, m.element, m.kind, m.code, m.pair_no, m.original_no, m.category, m.text,
      m.answer_format, m.options, m.applicability, m.computed_from, m.verification,
      case
        when m.applicability ? 'siteTypes' and not ((m.applicability -> 'siteTypes') ? (v_survey.site_type::text)) then false
        when coalesce((m.applicability ->> 'nightOnly')::boolean, false) then false
        else m.default_visible
      end,
      null, m.display_order, m.source, m.notes
    from public.question_master m
    where m.version = 'ver1.1';
  end if;

  perform public.write_audit(v_round_id, 'organizer', v_uid, 'round.create', 'round', v_round_id::text,
    jsonb_build_object('copy_from', p_copy_from, 'round_number', v_no));
  return v_round_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 主催者: 独自項目の追加
-- ---------------------------------------------------------------------------
create or replace function public.add_custom_question(
  p_round_id uuid,
  p_section text,
  p_kind text,
  p_text text,
  p_pair_no int default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.survey_rounds;
  v_format text;
  v_options jsonb;
  v_element text;
  v_pair int;
  v_seq int;
  v_order int;
  v_id uuid;
  v_code text;
begin
  v_round := public._assert_round_owner(p_round_id);
  if v_round.status <> 'draft' then
    raise exception 'MCS:round_locked 開始済みの調査回には項目を追加できません。';
  end if;
  if p_text is null or char_length(btrim(p_text)) = 0 or char_length(p_text) > 500 then
    raise exception 'MCS:invalid 項目の文言は1～500文字で入力してください。';
  end if;

  if p_section = 'space_a' and p_kind = 'count' then
    v_format := 'count';
  elsif p_section = 'space_b' and p_kind = 'fact' then
    v_format := 'ynu3';
    v_options := '[{"value":1,"label":"はい"},{"value":2,"label":"いいえ"},{"value":3,"label":"不明"}]'::jsonb;
  elsif p_section in ('anshin', 'kanyo', 'yasuragi', 'kitai') and p_kind in ('subjective', 'activity') then
    v_format := 'scale4';
    v_element := p_section;
    if p_kind = 'subjective' then
      v_options := '[{"value":1,"label":"全くそう思わない"},{"value":2,"label":"あまりそう思わない"},{"value":3,"label":"少しそう思う"},{"value":4,"label":"とてもそう思う"}]'::jsonb;
    else
      v_options := '[{"value":1,"label":"いない"},{"value":2,"label":"一人いる"},{"value":3,"label":"数人いる"},{"value":4,"label":"たくさんいる"}]'::jsonb;
    end if;
    if p_pair_no is not null then
      if p_pair_no < 1 or p_pair_no > 99 then
        raise exception 'MCS:invalid 項目番号が不正です。';
      end if;
      v_pair := p_pair_no;
    else
      select coalesce(max(pair_no), 0) + 1 into v_pair from public.round_questions where round_id = p_round_id and section = p_section;
    end if;
    if exists (select 1 from public.round_questions where round_id = p_round_id and section = p_section and pair_no = v_pair and kind = p_kind) then
      raise exception 'MCS:invalid 同じ番号・種類の項目が既にあります。';
    end if;
  elsif p_section = 'kanyo_type' and p_kind = 'activity_type' then
    v_format := 'scale4';
    v_element := 'kanyo';
    v_options := '[{"value":1,"label":"いない"},{"value":2,"label":"一人いる"},{"value":3,"label":"数人いる"},{"value":4,"label":"たくさんいる"}]'::jsonb;
  elsif p_section = 'basic' and p_kind = 'memo' then
    v_format := 'text';
  else
    raise exception 'MCS:invalid この区分には独自項目を追加できません。';
  end if;

  select count(*) + 1 into v_seq from public.round_questions where round_id = p_round_id and is_custom;
  if v_seq > 60 then
    raise exception 'MCS:invalid 独自項目は60件までです。';
  end if;
  select coalesce(max(display_order), 0) + 1 into v_order from public.round_questions where round_id = p_round_id and section = p_section;
  v_code := 'X-' || upper(p_section) || '-' || lpad(v_seq::text, 2, '0') || case when p_kind = 'subjective' then '-S' when p_kind = 'activity' then '-A' else '' end;

  insert into public.round_questions (
    round_id, master_id, is_custom, section, element, kind, code, pair_no, original_no, category, text,
    answer_format, options, applicability, verification, visible, display_order, source
  ) values (
    p_round_id, null, true, p_section, v_element, p_kind, v_code, v_pair, '独自項目', '独自項目', btrim(p_text),
    v_format, v_options, null, 'app_defined', true, v_order, '主催者が追加した独自項目'
  ) returning id into v_id;

  perform public.write_audit(p_round_id, 'organizer', (select auth.uid()), 'question.add_custom', 'round_question', v_id::text,
    jsonb_build_object('section', p_section, 'kind', p_kind, 'text', p_text, 'code', v_code));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 主催者: 調査開始（設定・設問をスナップショットとして固定）
-- ---------------------------------------------------------------------------
create or replace function public.start_round(p_round_id uuid, p_calc_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.survey_rounds;
  v_survey public.surveys;
  v_snapshot jsonb;
  v_hash text;
begin
  v_round := public._assert_round_owner(p_round_id);
  if v_round.status <> 'draft' then
    raise exception 'MCS:invalid_state この調査回は既に開始されています。';
  end if;
  if v_round.survey_date is null then
    raise exception 'MCS:invalid 調査日を設定してください。';
  end if;
  if not exists (select 1 from public.round_questions where round_id = p_round_id and visible and section <> 'observation') then
    raise exception 'MCS:invalid 表示する設問が1つもありません。';
  end if;
  select * into v_survey from public.surveys where id = v_round.survey_id;

  v_snapshot := jsonb_build_object(
    'survey', to_jsonb(v_survey) - 'owner_id',
    'round', to_jsonb(v_round) - 'owner_id' - 'settings_snapshot' - 'snapshot_hash' - 'status',
    'questions', (
      select jsonb_agg(to_jsonb(q) order by q.display_order)
      from public.round_questions q where q.round_id = p_round_id
    ),
    'masterVersion', v_round.master_version,
    'calcVersion', p_calc_version,
    'startedAt', now()
  );
  v_hash := encode(extensions.digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'), 'hex');

  perform public._allow_transition();
  update public.survey_rounds
  set status = 'active', started_at = now(), settings_snapshot = v_snapshot, snapshot_hash = v_hash, calc_version = p_calc_version
  where id = p_round_id;

  perform public.write_audit(p_round_id, 'organizer', (select auth.uid()), 'round.start', 'round', p_round_id::text,
    jsonb_build_object('snapshot_hash', v_hash, 'calc_version', p_calc_version));
  return jsonb_build_object('snapshotHash', v_hash);
end;
$$;

-- ---------------------------------------------------------------------------
-- 主催者: 参加リンクの発行・再発行（旧リンクは失効）
-- ---------------------------------------------------------------------------
create or replace function public.issue_participant_link(
  p_round_id uuid,
  p_token_hash text,
  p_token_ciphertext text,
  p_expires_at timestamptz,
  p_max_submissions int default 300,
  p_max_registrations int default 200
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.survey_rounds;
  v_revoked int;
  v_id uuid;
begin
  v_round := public._assert_round_owner(p_round_id);
  if v_round.status <> 'active' then
    raise exception 'MCS:invalid_state 実施中の調査回でのみ参加リンクを発行できます。';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '90 days' then
    raise exception 'MCS:invalid 有効期限は現在から90日以内で指定してください。';
  end if;

  update public.participant_links
  set revoked_at = now(), revoked_reason = 'reissued'
  where round_id = p_round_id and revoked_at is null;
  get diagnostics v_revoked = row_count;

  insert into public.participant_links (round_id, token_hash, token_ciphertext, created_by, expires_at, max_submissions, max_registrations)
  values (p_round_id, p_token_hash, p_token_ciphertext, (select auth.uid()), p_expires_at, p_max_submissions, p_max_registrations)
  returning id into v_id;

  perform public.write_audit(p_round_id, 'organizer', (select auth.uid()), 'link.issue', 'participant_link', v_id::text,
    jsonb_build_object('revoked_previous', v_revoked, 'expires_at', p_expires_at, 'max_submissions', p_max_submissions));
  return v_id;
end;
$$;

create or replace function public.revoke_participant_links(p_round_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  perform public._assert_round_owner(p_round_id);
  update public.participant_links set revoked_at = now(), revoked_reason = 'manual'
  where round_id = p_round_id and revoked_at is null;
  get diagnostics v_count = row_count;
  perform public.write_audit(p_round_id, 'organizer', (select auth.uid()), 'link.revoke', 'round', p_round_id::text,
    jsonb_build_object('revoked', v_count));
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 主催者: 調査の終了
-- ---------------------------------------------------------------------------
create or replace function public.close_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.survey_rounds;
begin
  v_round := public._assert_round_owner(p_round_id);
  if v_round.status <> 'active' then
    raise exception 'MCS:invalid_state 実施中の調査回だけを終了できます。';
  end if;
  perform public._allow_transition();
  update public.survey_rounds set status = 'closed', closed_at = now() where id = p_round_id;
  update public.participant_links set revoked_at = now(), revoked_reason = 'round_closed'
  where round_id = p_round_id and revoked_at is null;
  perform public.write_audit(p_round_id, 'organizer', (select auth.uid()), 'round.close', 'round', p_round_id::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 主催者: 回答の採用・除外・差し戻し
-- ---------------------------------------------------------------------------
create or replace function public.review_submission(p_submission_id uuid, p_action text, p_note text default '')
returns public.submission_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.submissions;
  v_round public.survey_rounds;
  v_to public.submission_status;
  v_note text := coalesce(btrim(p_note), '');
begin
  select * into v_sub from public.submissions where id = p_submission_id for update;
  if not found then
    raise exception 'MCS:not_found 提出が見つかりません。';
  end if;
  v_round := public._assert_round_owner(v_sub.round_id);
  if char_length(v_note) > 2000 then
    raise exception 'MCS:invalid コメントは2000文字以内で入力してください。';
  end if;

  if p_action = 'accept' and v_sub.status in ('submitted', 'excluded') then
    v_to := 'accepted';
  elsif p_action = 'exclude' and v_sub.status in ('submitted', 'accepted') then
    v_to := 'excluded';
  elsif p_action = 'return' and v_sub.status in ('submitted', 'accepted', 'excluded') then
    if v_round.status <> 'active' then
      raise exception 'MCS:invalid_state 終了した調査回の回答は差し戻せません。';
    end if;
    if v_note = '' then
      raise exception 'MCS:invalid 差し戻し理由を入力してください。';
    end if;
    v_to := 'returned';
  else
    raise exception 'MCS:invalid_state 現在の状態（%）ではこの操作はできません。', v_sub.status;
  end if;

  update public.submissions
  set status = v_to, reviewed_at = now(), reviewed_by = (select auth.uid()),
      review_note = case when v_to = 'returned' then v_note else review_note end
  where id = p_submission_id;

  insert into public.submission_reviews (submission_id, round_id, from_status, to_status, note, actor_id)
  values (p_submission_id, v_sub.round_id, v_sub.status, v_to, v_note, (select auth.uid()));

  perform public.write_audit(v_sub.round_id, 'organizer', (select auth.uid()), 'submission.' || p_action, 'submission',
    p_submission_id::text, jsonb_build_object('from', v_sub.status, 'to', v_to, 'note', v_note));
  return v_to;
end;
$$;

create or replace function public.set_observations_included(p_submission_id uuid, p_included boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.submissions;
begin
  select * into v_sub from public.submissions where id = p_submission_id;
  if not found then
    raise exception 'MCS:not_found 提出が見つかりません。';
  end if;
  perform public._assert_round_owner(v_sub.round_id);
  update public.submissions set observations_included = p_included where id = p_submission_id;
  perform public.write_audit(v_sub.round_id, 'organizer', (select auth.uid()), 'submission.observations_included', 'submission',
    p_submission_id::text, jsonb_build_object('from', v_sub.observations_included, 'to', p_included));
end;
$$;

-- ---------------------------------------------------------------------------
-- 主催者: 代表値の確定（平均値とは別に保存。変更は履歴に残す）
-- ---------------------------------------------------------------------------
create or replace function public.set_representative_values(p_round_id uuid, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.survey_rounds;
  v_item jsonb;
  v_qid uuid;
  v_state text;
  v_num numeric;
  v_method text;
  v_prev public.representative_values;
  v_count int := 0;
begin
  v_round := public._assert_round_owner(p_round_id);
  if v_round.status = 'draft' then
    raise exception 'MCS:invalid_state 開始前の調査回には代表値を設定できません。';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 1000 then
    raise exception 'MCS:invalid 代表値の形式が不正です。';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_qid := (v_item ->> 'roundQuestionId')::uuid;
    exception when others then
      raise exception 'MCS:invalid 設問IDが不正です。';
    end;
    if not exists (select 1 from public.round_questions where id = v_qid and round_id = p_round_id) then
      raise exception 'MCS:invalid 調査回に属さない設問です。';
    end if;
    v_state := v_item ->> 'valueState';
    v_method := v_item ->> 'method';
    if v_state not in ('value', 'not_applicable', 'no_data') or v_method not in ('mean', 'mode', 'manual', 'fixed') then
      raise exception 'MCS:invalid 代表値の状態・方法が不正です。';
    end if;
    v_num := null;
    if v_state = 'value' then
      if jsonb_typeof(v_item -> 'valueNum') <> 'number' then
        raise exception 'MCS:invalid 代表値は数値で入力してください。';
      end if;
      v_num := (v_item ->> 'valueNum')::numeric;
      if v_num < 0 or v_num > 100000 then
        raise exception 'MCS:invalid 代表値の範囲が不正です。';
      end if;
    end if;

    select * into v_prev from public.representative_values where round_id = p_round_id and round_question_id = v_qid;

    insert into public.representative_values (round_id, round_question_id, value_state, value_num, method, basis, note, decided_by, decided_at)
    values (p_round_id, v_qid, v_state, v_num, v_method, coalesce(v_item -> 'basis', '{}'::jsonb), left(coalesce(v_item ->> 'note', ''), 2000),
      (select auth.uid()), now())
    on conflict (round_id, round_question_id) do update
    set value_state = excluded.value_state, value_num = excluded.value_num, method = excluded.method, basis = excluded.basis,
        note = excluded.note, decided_by = excluded.decided_by, decided_at = excluded.decided_at;

    perform public.write_audit(p_round_id, 'organizer', (select auth.uid()), 'representative.set', 'round_question', v_qid::text,
      jsonb_build_object(
        'from', case when v_prev.id is null then null else jsonb_build_object('state', v_prev.value_state, 'value', v_prev.value_num, 'method', v_prev.method) end,
        'to', jsonb_build_object('state', v_state, 'value', v_num, 'method', v_method),
        'basis', v_item -> 'basis'));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 主催者: 集計結果の確定（版管理）
-- ---------------------------------------------------------------------------
create or replace function public.finalize_round_result(p_round_id uuid, p_calc_version text, p_payload jsonb, p_note text default '')
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.survey_rounds;
  v_version int;
begin
  v_round := public._assert_round_owner(p_round_id);
  if v_round.status = 'draft' then
    raise exception 'MCS:invalid_state 開始前の調査回は集計を確定できません。';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 5000000 then
    raise exception 'MCS:invalid 集計データが不正です。';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.round_results where round_id = p_round_id;
  insert into public.round_results (round_id, version, calc_version, payload, note, finalized_by)
  values (p_round_id, v_version, p_calc_version, p_payload, left(coalesce(p_note, ''), 2000), (select auth.uid()));
  perform public.write_audit(p_round_id, 'organizer', (select auth.uid()), 'result.finalize', 'round', p_round_id::text,
    jsonb_build_object('version', v_version, 'calc_version', p_calc_version));
  return v_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- 主催者: 個人情報の削除（調査者氏名等の匿名化）・調査回の削除
-- ---------------------------------------------------------------------------
create or replace function public.purge_personal_data(p_round_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.survey_rounds;
  v_count int;
begin
  v_round := public._assert_round_owner(p_round_id);
  if v_round.status <> 'closed' then
    raise exception 'MCS:invalid_state 終了した調査回でのみ実行できます。';
  end if;
  update public.surveyors
  set display_name = '（削除済み）', affiliation = '', age_band = '', gender = '', personal_data_purged_at = now()
  where round_id = p_round_id and personal_data_purged_at is null;
  get diagnostics v_count = row_count;
  perform public.write_audit(p_round_id, 'organizer', (select auth.uid()), 'personal_data.purge', 'round', p_round_id::text,
    jsonb_build_object('surveyors', v_count));
  return v_count;
end;
$$;

create or replace function public.delete_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.survey_rounds;
begin
  v_round := public._assert_round_owner(p_round_id);
  if v_round.status = 'active' then
    raise exception 'MCS:invalid_state 実施中の調査回は削除できません。先に終了してください。';
  end if;
  perform public.write_audit(p_round_id, 'organizer', (select auth.uid()), 'round.delete', 'round', p_round_id::text,
    jsonb_build_object('round_number', v_round.round_number, 'status', v_round.status));
  perform public._allow_transition();
  delete from public.survey_rounds where id = p_round_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 調査者（service_role 経由のみ）
-- ---------------------------------------------------------------------------
create or replace function public._participant_link(p_token_hash text, p_require_usable boolean)
returns public.participant_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.participant_links;
  v_status public.round_status;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'MCS:invalid_link 参加リンクが無効です。';
  end if;
  select * into v_link from public.participant_links where token_hash = p_token_hash;
  if not found then
    raise exception 'MCS:invalid_link 参加リンクが無効です。';
  end if;
  if p_require_usable then
    select status into v_status from public.survey_rounds where id = v_link.round_id;
    if v_status = 'closed' then
      raise exception 'MCS:round_closed この調査は終了しました。';
    end if;
    if v_status <> 'active' then
      raise exception 'MCS:round_not_active この調査は実施中ではありません。';
    end if;
    if v_link.revoked_at is not null then
      raise exception 'MCS:link_revoked この参加リンクは失効しています。主催者から新しいQRコードを受け取ってください。';
    end if;
    if v_link.expires_at <= now() then
      raise exception 'MCS:link_expired この参加リンクは有効期限切れです。';
    end if;
  end if;
  return v_link;
end;
$$;

create or replace function public._participant_surveyor(p_link public.participant_links, p_surveyor_id uuid, p_key_hash text)
returns public.surveyors
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_surveyor public.surveyors;
begin
  select * into v_surveyor from public.surveyors
  where id = p_surveyor_id and round_id = p_link.round_id and key_hash = p_key_hash;
  if not found then
    raise exception 'MCS:invalid_surveyor 調査者情報を確認できません。最初から参加し直してください。';
  end if;
  return v_surveyor;
end;
$$;

create or replace function public._rate_limit(p_kind text, p_link_id uuid, p_surveyor_id uuid, p_limit int, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.rate_limit_events
  where kind = p_kind
    and link_id is not distinct from p_link_id
    and surveyor_id is not distinct from p_surveyor_id
    and created_at > now() - p_window;
  if v_count >= p_limit then
    raise exception 'MCS:rate_limited 短時間に操作が集中しています。しばらく待ってから再度お試しください。';
  end if;
  insert into public.rate_limit_events (kind, link_id, surveyor_id) values (p_kind, p_link_id, p_surveyor_id);
end;
$$;

create or replace function public.participant_open(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.participant_links;
  v_round public.survey_rounds;
  v_survey jsonb;
begin
  v_link := public._participant_link(p_token_hash, true);
  select * into v_round from public.survey_rounds where id = v_link.round_id;
  v_survey := v_round.settings_snapshot -> 'survey';
  return jsonb_build_object(
    'round', jsonb_build_object(
      'id', v_round.id,
      'roundNumber', v_round.round_number,
      'title', v_round.title,
      'status', v_round.status,
      'surveyName', v_survey ->> 'name',
      'purpose', v_survey ->> 'purpose',
      'organizerName', v_survey ->> 'organizer_name',
      'siteName', v_survey ->> 'site_name',
      'siteAddress', v_survey ->> 'site_address',
      'siteType', v_survey ->> 'site_type',
      'scopeText', v_round.scope_text,
      'frontageScopeText', v_round.frontage_scope_text,
      'peripheralScopeText', v_round.peripheral_scope_text,
      'surveyDate', v_round.survey_date,
      'isHoliday', v_round.is_holiday,
      'startTime', v_round.start_time,
      'endTime', v_round.end_time,
      'isNight', v_round.is_night,
      'eventName', v_round.event_name,
      'stayMeasureMinutes', v_round.stay_measure_minutes,
      'passMeasureMinutes', v_round.pass_measure_minutes,
      'snapshotHash', v_round.snapshot_hash
    ),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'code', q.code, 'section', q.section, 'element', q.element, 'kind', q.kind,
        'pairNo', q.pair_no, 'originalNo', q.original_no, 'category', q.category, 'text', q.text,
        'answerFormat', q.answer_format, 'options', q.options, 'applicability', q.applicability,
        'fixedValue', q.fixed_value, 'notes', q.notes, 'displayOrder', q.display_order, 'isCustom', q.is_custom
      ) order by q.display_order)
      from public.round_questions q
      where q.round_id = v_round.id and q.visible and q.answer_format <> 'computed'
    ), '[]'::jsonb),
    'link', jsonb_build_object('expiresAt', v_link.expires_at)
  );
end;
$$;

create or replace function public.participant_register(
  p_token_hash text,
  p_key_hash text,
  p_display_name text,
  p_affiliation text,
  p_age_band text,
  p_gender text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.participant_links;
  v_count int;
  v_surveyor_id uuid;
begin
  v_link := public._participant_link(p_token_hash, true);
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'MCS:invalid_payload 調査者キーが不正です。';
  end if;
  if p_display_name is null or char_length(btrim(p_display_name)) = 0 or char_length(p_display_name) > 100 then
    raise exception 'MCS:invalid_payload 氏名は1～100文字で入力してください。';
  end if;
  select count(*) into v_count from public.surveyors where round_id = v_link.round_id;
  if v_count >= v_link.max_registrations then
    raise exception 'MCS:rate_limited この調査の参加者数の上限に達しました。主催者に連絡してください。';
  end if;
  perform public._rate_limit('register', v_link.id, null, 60, interval '10 minutes');

  insert into public.surveyors (round_id, link_id, key_hash, display_name, affiliation, age_band, gender)
  values (v_link.round_id, v_link.id, p_key_hash, btrim(p_display_name), left(coalesce(btrim(p_affiliation), ''), 200),
    coalesce(p_age_band, ''), coalesce(p_gender, ''))
  returning id into v_surveyor_id;

  insert into public.submissions (round_id, surveyor_id) values (v_link.round_id, v_surveyor_id);

  perform public.write_audit(v_link.round_id, 'participant', v_surveyor_id, 'surveyor.register', 'surveyor', v_surveyor_id::text, '{}'::jsonb);
  return jsonb_build_object('surveyorId', v_surveyor_id, 'roundId', v_link.round_id);
end;
$$;

create or replace function public.participant_state(p_token_hash text, p_surveyor_id uuid, p_key_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.participant_links;
  v_surveyor public.surveyors;
  v_sub public.submissions;
begin
  v_link := public._participant_link(p_token_hash, false);
  v_surveyor := public._participant_surveyor(v_link, p_surveyor_id, p_key_hash);
  select * into v_sub from public.submissions where surveyor_id = v_surveyor.id;
  return jsonb_build_object(
    'surveyorId', v_surveyor.id,
    'displayName', v_surveyor.display_name,
    'status', v_sub.status,
    'revision', v_sub.revision,
    'draftPayload', coalesce(v_sub.draft_payload, case when v_sub.status = 'returned' then (
      select r.payload from public.submission_revisions r where r.submission_id = v_sub.id order by r.revision desc limit 1
    ) end),
    'draftSavedAt', v_sub.draft_saved_at,
    'submittedAt', v_sub.submitted_at,
    'reviewNote', case when v_sub.status = 'returned' then v_sub.review_note else '' end,
    'lastIdempotencyKey', v_sub.last_idempotency_key
  );
end;
$$;

create or replace function public.participant_save_draft(p_token_hash text, p_surveyor_id uuid, p_key_hash text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.participant_links;
  v_surveyor public.surveyors;
  v_sub public.submissions;
begin
  v_link := public._participant_link(p_token_hash, true);
  v_surveyor := public._participant_surveyor(v_link, p_surveyor_id, p_key_hash);
  select * into v_sub from public.submissions where surveyor_id = v_surveyor.id for update;
  if v_sub.status not in ('draft', 'returned') then
    raise exception 'MCS:already_submitted 提出済みのため途中保存できません。';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 1000000 then
    raise exception 'MCS:invalid_payload 途中保存データが大きすぎるか形式が不正です。';
  end if;
  perform public._rate_limit('draft', v_link.id, v_surveyor.id, 120, interval '10 minutes');
  update public.submissions set draft_payload = p_payload, draft_saved_at = now() where id = v_sub.id;
  return jsonb_build_object('draftSavedAt', now());
end;
$$;

create or replace function public._json_int(p_value jsonb, p_min int, p_max int)
returns int
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'number' then
    raise exception 'MCS:invalid_payload 数値が必要です。';
  end if;
  v := (p_value #>> '{}')::numeric;
  if v <> trunc(v) or v < p_min or v > p_max then
    raise exception 'MCS:invalid_payload 値が範囲外です（%～%）。', p_min, p_max;
  end if;
  return v::int;
end;
$$;

create or replace function public._json_opt_int(p_obj jsonb, p_key text, p_required boolean)
returns int
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not p_required then
    return null;
  end if;
  return public._json_int(p_obj -> p_key, 0, 500);
end;
$$;

create or replace function public.participant_submit(
  p_token_hash text,
  p_surveyor_id uuid,
  p_key_hash text,
  p_idempotency_key uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.participant_links;
  v_surveyor public.surveyors;
  v_sub public.submissions;
  v_prev public.submission_revisions;
  v_round public.survey_rounds;
  v_rev int;
  v_item jsonb;
  v_q public.round_questions;
  v_qid uuid;
  v_seen uuid[] := '{}';
  v_state text;
  v_num numeric;
  v_text text;
  v_submitted int;
  v_seq int := 0;
  v_gender boolean;
  v_age boolean;
  v_behavior boolean;
  v_nat boolean;
  v_is_pass boolean;
begin
  if p_idempotency_key is null then
    raise exception 'MCS:invalid_payload 送信IDがありません。';
  end if;
  v_link := public._participant_link(p_token_hash, false);
  v_surveyor := public._participant_surveyor(v_link, p_surveyor_id, p_key_hash);
  select * into v_sub from public.submissions where surveyor_id = v_surveyor.id for update;

  -- 冪等性: 同じ送信IDの再送は、最初の結果をそのまま返す
  select * into v_prev from public.submission_revisions where idempotency_key = p_idempotency_key;
  if found then
    if v_prev.submission_id <> v_sub.id then
      raise exception 'MCS:idempotency_conflict 送信IDが重複しています。';
    end if;
    return jsonb_build_object('ok', true, 'duplicate', true, 'submissionId', v_sub.id, 'revision', v_prev.revision,
      'submittedAt', v_prev.submitted_at, 'status', v_sub.status);
  end if;

  v_link := public._participant_link(p_token_hash, true);
  if v_sub.status not in ('draft', 'returned') then
    raise exception 'MCS:already_submitted この調査者の回答は既に提出済みです。';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 2000000 then
    raise exception 'MCS:invalid_payload 提出データが大きすぎるか形式が不正です。';
  end if;
  select count(*) into v_submitted from public.submissions where round_id = v_link.round_id and status <> 'draft' and id <> v_sub.id;
  if v_submitted >= v_link.max_submissions then
    raise exception 'MCS:rate_limited この調査の提出数の上限に達しました。主催者に連絡してください。';
  end if;
  perform public._rate_limit('submit', v_link.id, v_surveyor.id, 20, interval '1 hour');

  select * into v_round from public.survey_rounds where id = v_link.round_id;
  v_rev := v_sub.revision + 1;

  delete from public.answers where submission_id = v_sub.id;
  delete from public.space_counts where submission_id = v_sub.id;
  delete from public.observation_groups where submission_id = v_sub.id;

  -- 回答（空間A件数を含む）
  if p_payload ? 'answers' and jsonb_typeof(p_payload -> 'answers') <> 'array' then
    raise exception 'MCS:invalid_payload answers の形式が不正です。';
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'answers', '[]'::jsonb)) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item ->> 'questionId', '') !~ '^[0-9a-f-]{36}$' then
      raise exception 'MCS:invalid_payload 設問IDが不正です。';
    end if;
    v_qid := (v_item ->> 'questionId')::uuid;
    select * into v_q from public.round_questions where id = v_qid and round_id = v_round.id;
    if not found then
      raise exception 'MCS:invalid_payload この調査に存在しない設問です。';
    end if;
    if not v_q.visible or v_q.fixed_value is not null or v_q.answer_format in ('computed', 'observation') then
      raise exception 'MCS:invalid_payload 回答できない設問が含まれています（%）。', v_q.code;
    end if;
    if v_qid = any (v_seen) then
      raise exception 'MCS:invalid_payload 同じ設問への回答が重複しています（%）。', v_q.code;
    end if;
    v_seen := v_seen || v_qid;
    v_state := v_item ->> 'state';
    if v_state is null or v_state not in ('answered', 'unanswered', 'not_applicable') then
      raise exception 'MCS:invalid_payload 回答状態が不正です（%）。', v_q.code;
    end if;
    v_num := null;
    v_text := null;
    if v_state = 'answered' then
      case v_q.answer_format
        when 'scale4' then v_num := public._json_int(v_item -> 'value', 1, 4);
        when 'ynu3' then v_num := public._json_int(v_item -> 'value', 1, 3);
        when 'count' then v_num := public._json_int(v_item -> 'value', 0, 9999);
        when 'number' then
          if jsonb_typeof(v_item -> 'value') <> 'number' then
            raise exception 'MCS:invalid_payload 数値が必要です（%）。', v_q.code;
          end if;
          v_num := (v_item ->> 'value')::numeric;
          if v_num < -100 or v_num > 100000 then
            raise exception 'MCS:invalid_payload 数値が範囲外です（%）。', v_q.code;
          end if;
        when 'choice' then
          v_text := v_item ->> 'value';
          if jsonb_typeof(v_item -> 'value') <> 'string'
             or not exists (select 1 from jsonb_array_elements(v_q.options) o where o ->> 'value' = v_text) then
            raise exception 'MCS:invalid_payload 選択肢にない値です（%）。', v_q.code;
          end if;
        when 'time' then
          v_text := v_item ->> 'value';
          if jsonb_typeof(v_item -> 'value') <> 'string' or v_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
            raise exception 'MCS:invalid_payload 時刻の形式が不正です（%）。', v_q.code;
          end if;
        when 'text' then
          v_text := v_item ->> 'value';
          if jsonb_typeof(v_item -> 'value') <> 'string' or char_length(v_text) < 1 or char_length(v_text) > 2000 then
            raise exception 'MCS:invalid_payload 文字数が範囲外です（%）。', v_q.code;
          end if;
        else
          raise exception 'MCS:invalid_payload 未対応の回答形式です（%）。', v_q.code;
      end case;
    end if;

    if v_q.answer_format = 'count' then
      insert into public.space_counts (submission_id, round_id, round_question_id, revision, state, count)
      values (v_sub.id, v_round.id, v_qid, v_rev, v_state::public.answer_state, v_num::int);
    else
      insert into public.answers (submission_id, round_id, round_question_id, revision, state, value_num, value_text)
      values (v_sub.id, v_round.id, v_qid, v_rev, v_state::public.answer_state, v_num, v_text);
    end if;
  end loop;

  -- 送信されなかった設問: 非表示・固定値・未回答を区別して保存
  insert into public.answers (submission_id, round_id, round_question_id, revision, state, value_num, value_text)
  select v_sub.id, v_round.id, q.id, v_rev,
    (case when not q.visible then 'hidden' when q.fixed_value is not null then 'fixed' else 'unanswered' end)::public.answer_state,
    case when q.visible and q.fixed_value is not null and jsonb_typeof(q.fixed_value -> 'value') = 'number' then (q.fixed_value ->> 'value')::numeric end,
    case when q.visible and q.fixed_value is not null and jsonb_typeof(q.fixed_value -> 'value') = 'string' then q.fixed_value ->> 'value' end
  from public.round_questions q
  where q.round_id = v_round.id and q.answer_format not in ('computed', 'observation', 'count') and not (q.id = any (v_seen));

  insert into public.space_counts (submission_id, round_id, round_question_id, revision, state, count)
  select v_sub.id, v_round.id, q.id, v_rev,
    (case when not q.visible then 'hidden' when q.fixed_value is not null then 'fixed' else 'unanswered' end)::public.answer_state,
    case when q.visible and q.fixed_value is not null then (q.fixed_value ->> 'value')::int end
  from public.round_questions q
  where q.round_id = v_round.id and q.answer_format = 'count' and not (q.id = any (v_seen));

  -- 滞在者・通行者の観察グループ
  select coalesce(bool_or(visible) filter (where code = 'OBS-GENDER'), false),
         coalesce(bool_or(visible) filter (where code = 'OBS-AGE'), false),
         coalesce(bool_or(visible) filter (where code = 'OBS-BEHAVIOR'), false),
         coalesce(bool_or(visible) filter (where code = 'OBS-NATIONALITY'), false)
  into v_gender, v_age, v_behavior, v_nat
  from public.round_questions where round_id = v_round.id and section = 'observation';

  if p_payload ? 'observations' and jsonb_typeof(p_payload -> 'observations') <> 'array' then
    raise exception 'MCS:invalid_payload observations の形式が不正です。';
  end if;
  if jsonb_array_length(coalesce(p_payload -> 'observations', '[]'::jsonb)) > 3000 then
    raise exception 'MCS:invalid_payload 観察記録が多すぎます。';
  end if;
  if jsonb_array_length(coalesce(p_payload -> 'observations', '[]'::jsonb)) > 0
     and not exists (select 1 from public.round_questions where round_id = v_round.id and code = 'OBS-PRESENCE' and visible) then
    raise exception 'MCS:invalid_payload この調査では滞在者・通行者の記録を受け付けていません。';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'observations', '[]'::jsonb)) loop
    v_seq := v_seq + 1;
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'presence', '') not in ('stay', 'pass')
       or coalesce(v_item ->> 'groupType', '') not in ('single', 'family', 'group', 'party') then
      raise exception 'MCS:invalid_payload 観察記録 % の滞在・通行またはグループ属性が不正です。', v_seq;
    end if;
    v_is_pass := (v_item ->> 'presence') = 'pass';
    begin
      insert into public.observation_groups (
        submission_id, round_id, revision, seq, presence, group_type, group_size,
        male, female, gender_unknown, infant, child, teen, adult, elderly, age_unknown,
        walk_fast, walk_slow, japanese, foreigner, nationality_unknown, note
      ) values (
        v_sub.id, v_round.id, v_rev, v_seq, v_item ->> 'presence', v_item ->> 'groupType',
        public._json_int(v_item -> 'groupSize', 1, 500),
        public._json_opt_int(v_item, 'male', v_gender), public._json_opt_int(v_item, 'female', v_gender),
        public._json_opt_int(v_item, 'genderUnknown', v_gender),
        public._json_opt_int(v_item, 'infant', v_age), public._json_opt_int(v_item, 'child', v_age),
        public._json_opt_int(v_item, 'teen', v_age), public._json_opt_int(v_item, 'adult', v_age),
        public._json_opt_int(v_item, 'elderly', v_age), public._json_opt_int(v_item, 'ageUnknown', v_age),
        public._json_opt_int(v_item, 'walkFast', v_behavior and v_is_pass), public._json_opt_int(v_item, 'walkSlow', v_behavior and v_is_pass),
        public._json_opt_int(v_item, 'japanese', v_nat), public._json_opt_int(v_item, 'foreigner', v_nat),
        public._json_opt_int(v_item, 'nationalityUnknown', v_nat),
        left(coalesce(v_item ->> 'note', ''), 500)
      );
    exception
      when check_violation then
        raise exception 'MCS:invalid_payload 観察記録 % の人数が一致しません（属性別人数の合計はグループ人数と同じにしてください。1人=1名、家族・グループ・団体=2名以上）。', v_seq;
    end;
  end loop;

  insert into public.submission_revisions (submission_id, round_id, revision, idempotency_key, payload)
  values (v_sub.id, v_round.id, v_rev, p_idempotency_key, p_payload)
  returning * into v_prev;

  update public.submissions
  set status = 'submitted', revision = v_rev, submitted_at = v_prev.submitted_at, last_idempotency_key = p_idempotency_key,
      draft_payload = null, draft_saved_at = null
  where id = v_sub.id;

  perform public.write_audit(v_round.id, 'participant', v_surveyor.id, 'submission.submit', 'submission', v_sub.id::text,
    jsonb_build_object('revision', v_rev, 'answers', jsonb_array_length(coalesce(p_payload -> 'answers', '[]'::jsonb)),
      'observations', v_seq, 'resubmission', v_sub.status = 'returned'));

  return jsonb_build_object('ok', true, 'duplicate', false, 'submissionId', v_sub.id, 'revision', v_rev,
    'submittedAt', v_prev.submitted_at, 'status', 'submitted');
end;
$$;

-- ---------------------------------------------------------------------------
-- 実行権限
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.owns_round(uuid) to authenticated;
grant execute on function public.create_round(uuid, uuid) to authenticated;
grant execute on function public.add_custom_question(uuid, text, text, text, int) to authenticated;
grant execute on function public.start_round(uuid, text) to authenticated;
grant execute on function public.issue_participant_link(uuid, text, text, timestamptz, int, int) to authenticated;
grant execute on function public.revoke_participant_links(uuid) to authenticated;
grant execute on function public.close_round(uuid) to authenticated;
grant execute on function public.review_submission(uuid, text, text) to authenticated;
grant execute on function public.set_observations_included(uuid, boolean) to authenticated;
grant execute on function public.set_representative_values(uuid, jsonb) to authenticated;
grant execute on function public.finalize_round_result(uuid, text, jsonb, text) to authenticated;
grant execute on function public.purge_personal_data(uuid) to authenticated;
grant execute on function public.delete_round(uuid) to authenticated;

grant execute on function public.participant_open(text) to service_role;
grant execute on function public.participant_register(text, text, text, text, text, text) to service_role;
grant execute on function public.participant_state(text, uuid, text) to service_role;
grant execute on function public.participant_save_draft(text, uuid, text, jsonb) to service_role;
grant execute on function public.participant_submit(text, uuid, text, uuid, jsonb) to service_role;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
