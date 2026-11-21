-- 検証用の架空データ（ローカル開発・Preview 用）。本番 DB には適用しないこと。
-- `npx supabase db reset` で自動投入される。
-- 主催者A: organizer-a@example.com / パスワード local-dev-password-a
-- 主催者B: organizer-b@example.com / パスワード local-dev-password-b
-- （ローカル専用の既知パスワード。Preview/本番では使わない）

do $$
declare
  v_a uuid := '00000000-0000-4000-8000-00000000000a';
  v_b uuid := '00000000-0000-4000-8000-00000000000b';
  v_survey uuid;
  v_round uuid;
  v_link uuid;
  v_token_hash text := encode(extensions.digest('seed-demo-link-not-usable', 'sha256'), 'hex');
  v_s1 jsonb;
  v_s2 jsonb;
  v_payload jsonb;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values
    ('00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated', 'organizer-a@example.com',
      extensions.crypt('local-dev-password-a', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated', 'organizer-b@example.com',
      extensions.crypt('local-dev-password-b', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), v_a, jsonb_build_object('sub', v_a::text, 'email', 'organizer-a@example.com'), 'email', v_a::text, now(), now(), now()),
    (gen_random_uuid(), v_b, jsonb_build_object('sub', v_b::text, 'email', 'organizer-b@example.com'), 'email', v_b::text, now(), now(), now());

  -- 主催者Aとして操作（auth.uid() を設定）
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);

  insert into public.surveys (owner_id, name, purpose, organizer_name, site_name, site_address, site_type)
  values (v_a, '【架空】さくら通り 居心地調査', '架空データによる動作確認用', '架空まちづくり協議会', 'さくら通り（架空）', '架空県架空市', 'street')
  returning id into v_survey;

  v_round := public.create_round(v_survey, null);
  update public.survey_rounds
  set title = '第1回（架空・過去回）', survey_date = date '2026-05-10', start_time = '14:00', end_time = '15:00',
      scope_text = 'さくら通り 一丁目交差点から三丁目交差点まで（両側歩道）', frontage_scope_text = '同区間の沿道建物1階',
      peripheral_scope_text = '概ね300m圏', stay_measure_minutes = 15, pass_measure_minutes = 10
  where id = v_round;
  perform public.start_round(v_round, 'app-calc-1.0.0');

  -- 参加リンク（seed 用。トークン原文は存在しないため利用不可）
  v_link := public.issue_participant_link(v_round, v_token_hash, 'v1.seed.seed.seed', now() + interval '1 day', 300, 200);

  v_s1 := public.participant_register(v_token_hash, encode(extensions.digest('seed-key-1', 'sha256'), 'hex'), '架空 調査者一', '架空大学', '20s', '');
  v_s2 := public.participant_register(v_token_hash, encode(extensions.digest('seed-key-2', 'sha256'), 'hex'), '架空 調査者二', '架空市役所', '40s', '');

  -- 調査者1: 4段階は3、はい/いいえは1、件数は2
  select jsonb_build_object(
    'answers', jsonb_agg(jsonb_build_object('questionId', q.id, 'state', 'answered',
      'value', case q.answer_format when 'scale4' then 3 when 'ynu3' then 1 else 2 end)),
    'observations', jsonb_build_array(
      jsonb_build_object('presence', 'stay', 'groupType', 'single', 'groupSize', 1, 'male', 1, 'female', 0, 'genderUnknown', 0,
        'infant', 0, 'child', 0, 'teen', 0, 'adult', 1, 'elderly', 0, 'ageUnknown', 0, 'japanese', 1, 'foreigner', 0, 'nationalityUnknown', 0),
      jsonb_build_object('presence', 'stay', 'groupType', 'family', 'groupSize', 3, 'male', 1, 'female', 1, 'genderUnknown', 1,
        'infant', 1, 'child', 0, 'teen', 0, 'adult', 2, 'elderly', 0, 'ageUnknown', 0, 'japanese', 3, 'foreigner', 0, 'nationalityUnknown', 0),
      jsonb_build_object('presence', 'pass', 'groupType', 'group', 'groupSize', 2, 'male', 0, 'female', 2, 'genderUnknown', 0,
        'infant', 0, 'child', 0, 'teen', 2, 'adult', 0, 'elderly', 0, 'ageUnknown', 0, 'walkFast', 1, 'walkSlow', 1,
        'japanese', 1, 'foreigner', 1, 'nationalityUnknown', 0)))
  into v_payload
  from public.round_questions q
  where q.round_id = v_round and q.visible and q.fixed_value is null and q.answer_format in ('scale4', 'ynu3', 'count');
  perform public.participant_submit(v_token_hash, (v_s1 ->> 'surveyorId')::uuid, encode(extensions.digest('seed-key-1', 'sha256'), 'hex'), gen_random_uuid(), v_payload);

  -- 調査者2: 4段階は2、件数は0（0件）、はい/いいえは未回答、滞在者・通行者は記録なし
  select jsonb_build_object(
    'answers', jsonb_agg(jsonb_build_object('questionId', q.id, 'state', 'answered', 'value', case q.answer_format when 'scale4' then 2 else 0 end)),
    'observations', '[]'::jsonb)
  into v_payload
  from public.round_questions q
  where q.round_id = v_round and q.visible and q.fixed_value is null and q.answer_format in ('scale4', 'count');
  perform public.participant_submit(v_token_hash, (v_s2 ->> 'surveyorId')::uuid, encode(extensions.digest('seed-key-2', 'sha256'), 'hex'), gen_random_uuid(), v_payload);

  perform public.review_submission(s.id, 'accept', 'seed') from public.submissions s where s.round_id = v_round;
  perform public.close_round(v_round);

  -- 第2回（下書き。前回の設定をコピー）
  perform public.create_round(v_survey, v_round);

  -- 主催者Bの調査（主催者Aからは見えないことの確認用）
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_b::text, 'role', 'authenticated')::text, true);
  insert into public.surveys (owner_id, name, site_name) values (v_b, '【架空】主催者Bの調査', '架空広場');
  perform public.create_round((select id from public.surveys where owner_id = v_b limit 1), null);
  perform set_config('request.jwt.claims', '', true);
end;
$$;
