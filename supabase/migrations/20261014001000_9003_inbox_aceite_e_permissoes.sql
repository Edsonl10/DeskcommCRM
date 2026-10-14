-- manifest: Separa aceite humano de distribuição, unifica as visões do Inbox e protege a leitura global por permissão individual no vínculo da equipe.
alter table public.user_organizations add column if not exists inbox_permissions jsonb not null default '{"all":false,"ai":false,"closed":false}'::jsonb;
alter table public.team_invites add column if not exists inbox_permissions jsonb not null default '{"all":false,"ai":false,"closed":false}'::jsonb;
-- O backfill acontece uma vez: novas respostas sem aceite continuam respeitando a configuração.
do $inbox_backfill$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='conversations' and column_name='human_accepted_at') then
    alter table public.conversations add column human_accepted_at timestamptz;
    update public.conversations c set human_accepted_at = e.created_at
from public.conversation_assignment_events e
where c.human_accepted_at is null and c.assigned_to_user_id = e.to_user_id
  and c.id = e.conversation_id and c.organization_id = e.organization_id
  and e.reason = 'claim' and e.created_at >= coalesce(c.service_started_at, c.created_at)
  and e.created_at >= coalesce(c.assigned_at, c.created_at)
  and e.created_at >= coalesce(c.last_handoff_at, c.created_at)
  and c.status not in ('closed','archived','resolved')
  and not exists (select 1 from public.conversation_assignment_events later
    where later.organization_id = c.organization_id and later.conversation_id = c.id
      and later.created_at > e.created_at);
    -- Resposta comprovadamente enviada pelo responsável após a atribuição atual.
    update public.conversations c set human_accepted_at = (
      select min(m.sent_at) from public.messages m
      where m.organization_id = c.organization_id and m.conversation_id = c.id
        and m.direction = 'outbound' and m.status in ('sent','delivered','read')
        and m.sent_by_user_id = c.assigned_to_user_id
        and (m.service_revision is null or m.service_revision = c.service_revision)
        and m.sent_at >= greatest(coalesce(c.service_started_at,c.created_at),coalesce(c.assigned_at,c.created_at))
        and m.sent_at >= coalesce(c.last_handoff_at,c.created_at)
    ) where c.human_accepted_at is null and c.assigned_to_user_id is not null
      and c.status not in ('closed','archived','resolved');
  end if;
end $inbox_backfill$;

create or replace function public.fn_guard_inbox_permissions() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if jsonb_typeof(new.inbox_permissions) <> 'object'
     or new.inbox_permissions - array['all','ai','closed'] <> '{}'::jsonb
     or exists (select 1 from jsonb_each(new.inbox_permissions) where jsonb_typeof(value) <> 'boolean') then
    raise exception 'invalid_inbox_permissions' using errcode = '22023';
  end if;
  if auth.uid() is not null
    and ((tg_op = 'INSERT' and new.inbox_permissions <> '{"all":false,"ai":false,"closed":false}'::jsonb)
      or (tg_op = 'UPDATE' and new.inbox_permissions is distinct from old.inbox_permissions))
    and not public.fn_role_at_least(new.organization_id, 'admin') then
    raise exception 'inbox_permissions_admin_only' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.fn_guard_inbox_permissions() from public, anon, authenticated;
drop trigger if exists trg_guard_inbox_permissions on public.user_organizations;
create trigger trg_guard_inbox_permissions before insert or update on public.user_organizations
for each row execute function public.fn_guard_inbox_permissions();
drop trigger if exists trg_guard_inbox_permissions on public.team_invites;
create trigger trg_guard_inbox_permissions before insert or update on public.team_invites
for each row execute function public.fn_guard_inbox_permissions();

-- Campo calculado, não duplicação persistida: lista, contador e RLS usam a mesma régua.
-- Sem nome de parâmetro para não expor uma RPC com uma linha fabricada.
create or replace function public.inbox_state(public.conversations) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when $1.status in ('closed','archived','resolved') then 'closed'
    when public.fn_comando_da_conversa($1.status, null, $1.bot_silenced_until,
      coalesce((select ct.force_human from public.contacts ct where ct.id = $1.contact_id and ct.organization_id = $1.organization_id),false),
      coalesce((select ct.is_blocked from public.contacts ct where ct.id = $1.contact_id and ct.organization_id = $1.organization_id),false),
      now(), coalesce($1.is_group,false)) = 'automatico'
      and exists (select 1 from public.ai_agents a
        join public.ai_agent_versions v on v.id = a.published_version_id and v.organization_id = a.organization_id
        where a.organization_id = $1.organization_id and v.status = 'published'
          and a.operation_mode = 'automatic' and a.paused_at is null and a.archived_at is null
          and (v.channel_session_id = $1.channel_session_id or a.id = $1.active_ai_agent_id
            or exists (select 1 from public.ai_routers r where r.organization_id = a.organization_id
              and r.channel_session_id = $1.channel_session_id and r.is_active
              and (r.fallback_agent_id = a.id or exists (select 1 from public.ai_router_members m
                where m.organization_id = r.organization_id and m.router_id = r.id and m.agent_id = a.id)))
            or exists (select 1 from public.campaign_recipients cr join public.campaigns ca
              on ca.id = cr.campaign_id and ca.organization_id = cr.organization_id
              where cr.organization_id = a.organization_id and cr.conversation_id = $1.id and ca.agent_id = a.id)))
      then 'ai'
    when $1.assigned_to_user_id is null then 'unassigned'
    when $1.human_accepted_at >= greatest(coalesce($1.assigned_at,$1.created_at),coalesce($1.service_started_at,$1.created_at),coalesce($1.last_handoff_at,$1.created_at)) then 'active'
    else 'waiting'
  end;
$$;
revoke all on function public.inbox_state(public.conversations) from public, anon;
grant execute on function public.inbox_state(public.conversations) to authenticated, service_role;

create or replace function public.fn_can_read_inbox(public.conversations) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.fn_is_platform_admin() or exists (
    select 1 from public.user_organizations m
    where m.organization_id = $1.organization_id and m.user_id = auth.uid()
      and m.revoked_at is null and m.organization_id in (select public.fn_user_org_ids())
      and (m.role in ('manager','admin') or $1.assigned_to_user_id = auth.uid()
        or case when public.inbox_state($1) = 'closed' then m.inbox_permissions->'closed' = 'true'::jsonb
          when public.inbox_state($1) = 'ai' then m.inbox_permissions->'ai' = 'true'::jsonb or m.inbox_permissions->'all' = 'true'::jsonb
          else m.inbox_permissions->'all' = 'true'::jsonb end)
  );
$$;
revoke all on function public.fn_can_read_inbox(public.conversations) from public, anon;
grant execute on function public.fn_can_read_inbox(public.conversations) to authenticated, service_role;

-- Agenda e CRM mantêm o helper legado; as policies de conversa usam a régua específica abaixo.
drop policy if exists conversations_select on public.conversations;
drop policy if exists conversations_department_supervisor_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
using (public.fn_can_read_inbox(conversations));


-- As tabelas filhas conservam seus papéis/autoria e recebem a leitura exata da conversa.
do $inbox_policies$
declare p record; q text; w text; statement text;
begin
  for p in select * from pg_policies where schemaname = 'public'
    and (qual like '%fn_can_view_conversation%' or with_check like '%fn_can_view_conversation%') loop
    q := regexp_replace(p.qual, '(public\.)?fn_can_view_conversation\(([a-z_][a-z_0-9]*)\.organization_id,\s*\2\.assigned_to_user_id\)', 'public.fn_can_read_inbox(\2)', 'g');
    w := regexp_replace(p.with_check, '(public\.)?fn_can_view_conversation\(([a-z_][a-z_0-9]*)\.organization_id,\s*\2\.assigned_to_user_id\)', 'public.fn_can_read_inbox(\2)', 'g');
    statement := format('alter policy %I on public.%I', p.policyname, p.tablename);
    if q is not null then statement := statement || ' using (' || q || ')'; end if;
    if w is not null then statement := statement || ' with check (' || w || ')'; end if;
    execute statement;
  end loop;
end $inbox_policies$;

-- Invalida aceite quando muda o dono, episódio ou comando; uma RPC claim grava o novo.
create or replace function public.fn_reset_human_acceptance() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' and new.human_accepted_at is not null then
      raise exception 'acceptance_requires_claim' using errcode = '42501';
    end if;
    return new;
  end if;
  if current_user = 'authenticated' and new.human_accepted_at is distinct from old.human_accepted_at then
    raise exception 'acceptance_requires_claim' using errcode = '42501';
  end if;
  if new.assigned_to_user_id is distinct from old.assigned_to_user_id
     or new.service_revision is distinct from old.service_revision
     or new.last_handoff_at is distinct from old.last_handoff_at
     or new.status in ('closed','archived','resolved')
     or (old.bot_silenced_until is not null and new.bot_silenced_until is null) then
    new.human_accepted_at := null;
  end if;
  return new;
end $$;
revoke all on function public.fn_reset_human_acceptance() from public, anon, authenticated;
drop trigger if exists trg_reset_human_acceptance on public.conversations;
create trigger trg_reset_human_acceptance before insert or update on public.conversations
for each row execute function public.fn_reset_human_acceptance();

drop function if exists public.fn_accept_inbox_invite(uuid,uuid,text,uuid,timestamptz,timestamptz,jsonb,jsonb);
create or replace function public.fn_accept_inbox_invite(
  p_invite_id uuid, p_user uuid, p_org uuid, p_role text, p_invited_by uuid,
  p_issued_at timestamptz, p_invited_at timestamptz, p_interface_settings jsonb, p_inbox_permissions jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb; invitation public.team_invites%rowtype;
begin
  select * into invitation from public.team_invites where id = p_invite_id and organization_id = p_org for update;
  if found then
    if invitation.revoked_at is not null or invitation.expires_at <= now() then
      raise exception 'invite_revoked_or_expired' using errcode='42501';
    end if;
    -- A linha vigente prevalece sobre um token antigo de reenvio do mesmo convite.
    p_inbox_permissions := invitation.inbox_permissions;
  end if;
  result := public.fn_accept_team_invite(p_user,p_org,p_role,p_invited_by,p_issued_at,p_invited_at,p_interface_settings);
  if (result->>'changed')::boolean then
    update public.user_organizations set inbox_permissions = p_inbox_permissions
      where id = (result->>'id')::uuid and organization_id = p_org and user_id = p_user;
  end if;
  update public.team_invites set accepted_at = now(), accepted_by = p_user
    where id = p_invite_id and organization_id = p_org and accepted_at is null and revoked_at is null;
  return result;
end $$;
revoke all on function public.fn_accept_inbox_invite(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.fn_accept_inbox_invite(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,jsonb,jsonb) to service_role;

create or replace function public.fn_conversation_assign(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_to_user_id uuid,
  p_reason text,
  p_expected_assignee uuid default null,
  p_enforce_expected boolean default false
) returns setof public.conversations
language plpgsql security definer
set search_path = public
as $$
declare
  v_from uuid;
  v_conv public.conversations%rowtype;
begin
  if not public.fn_support_write_allowed(p_organization_id) then raise exception 'support_readonly' using errcode='42501'; end if;
  if auth.uid() is not null
     and not public.fn_role_at_least(p_organization_id, 'agent') then
    raise exception 'caller_not_authorized_for_org'
      using hint = 'caller must be an active agent+ member of the organization';
  end if;

  if p_to_user_id is not null then
    if coalesce(public.fn_member_role_in_org(p_to_user_id, p_organization_id), 'none')
         not in ('agent','manager','admin') then
      raise exception 'assignee_not_eligible_member'
        using hint = 'target must be an active agent+ member of the organization';
    end if;
  end if;

  select assigned_to_user_id into v_from
    from public.conversations
   where id = p_conversation_id
     and organization_id = p_organization_id
   for no key update;

  if not found then
    return;
  end if;

  if p_enforce_expected and v_from is distinct from p_expected_assignee
     and not (p_reason = 'claim' and v_from is not null and v_from = p_to_user_id) then
    return;
  end if;

  if auth.uid() is not null and not public.fn_role_at_least(p_organization_id, 'manager')
     and v_from is not null and v_from <> auth.uid() then
    raise exception 'conversation_owned_by_another' using errcode = '42501';
  end if;
  if auth.uid() is not null and p_reason = 'claim' and p_to_user_id is distinct from auth.uid() then
    raise exception 'claim_requires_self' using errcode = '42501';
  end if;
  if exists (select 1 from public.conversations where id = p_conversation_id and organization_id = p_organization_id and status in ('closed','archived','resolved')) then return; end if;

  update public.conversations
     set assigned_to_user_id = p_to_user_id,
         -- Desnormalizado JUNTO com o dono, na mesma transação: nunca existe
         -- uma janela em que id e nome discordam. NULL junto com o id quando
         -- a atribuição é removida (release) — nunca sobra um nome órfão de
         -- dono nenhum. Lido de auth.users porque quem chama esta função
         -- (RPC) não necessariamente tem acesso ao Admin API — a definer
         -- resolve por dentro.
         assigned_to_user_name = case
           when p_to_user_id is null then null
           else (select raw_user_meta_data ->> 'full_name' from auth.users where id = p_to_user_id)
         end,
         assigned_at = case when p_to_user_id is null then null else now() end,
         assignee_kind = case when p_to_user_id is null then null else 'user' end,
         status = case when p_to_user_id is null then 'open' else 'claimed' end,
         status_changed_at = now(),
         unread_count_for_assignee = 0,
         bot_silenced_until = case
           when p_reason = 'routing'  then bot_silenced_until
           when p_to_user_id is null  then (case when last_handoff_at is null
                                                 then null
                                                 else bot_silenced_until end)
           else 'infinity'::timestamptz
         end,
         updated_at = now()
   where id = p_conversation_id
   returning * into v_conv;

  insert into public.conversation_assignment_events
    (organization_id, conversation_id, from_user_id, to_user_id, changed_by, reason)
  values
    (p_organization_id, p_conversation_id, v_from, p_to_user_id, auth.uid(), p_reason);

  update public.conversations set human_accepted_at = case when p_reason = 'claim' and p_to_user_id is not null then now() else null end
    where id = p_conversation_id and organization_id = p_organization_id returning * into v_conv;
  return next v_conv;
end;
$$;
revoke all on function public.fn_conversation_assign(uuid,uuid,uuid,text,uuid,boolean) from public, anon;
grant execute on function public.fn_conversation_assign(uuid,uuid,uuid,text,uuid,boolean) to authenticated, service_role;
create or replace function public.fn_conversation_assign_department(
  p_organization_id uuid, p_conversation_id uuid, p_department_id uuid, p_to_user_id uuid default null
) returns setof public.conversations language plpgsql security definer set search_path = public as $$
declare v_from uuid; v_conv public.conversations%rowtype;
begin
  if not public.fn_support_write_allowed(p_organization_id) then raise exception 'support_readonly' using errcode='42501'; end if;
  if auth.uid() is null or not public.fn_role_at_least(p_organization_id, 'agent') then raise exception 'caller_not_authorized_for_org'; end if;
  if not exists (select 1 from public.departments where id = p_department_id and organization_id = p_organization_id and is_active) then raise exception 'department_not_found_or_inactive'; end if;
  if p_to_user_id is not null and not exists (select 1 from public.department_members where organization_id = p_organization_id and department_id = p_department_id and user_id = p_to_user_id) then raise exception 'assignee_not_member_of_department'; end if;
  select assigned_to_user_id into v_from from public.conversations where id = p_conversation_id and organization_id = p_organization_id for update;
  if not found then return; end if;
  if not public.fn_role_at_least(p_organization_id, 'manager') and v_from is not null and v_from <> auth.uid() then raise exception 'conversation_owned_by_another' using errcode = '42501'; end if;
  update public.conversations set human_accepted_at = null, assigned_department_id = p_department_id, assigned_to_user_id = p_to_user_id, assigned_at = case when p_to_user_id is null then null else now() end, assignee_kind = case when p_to_user_id is null then null else 'user' end, status = case when p_to_user_id is null then 'open' else 'claimed' end, status_changed_at = now(), unread_count_for_assignee = 0, bot_silenced_until = case when p_to_user_id is null then bot_silenced_until else 'infinity'::timestamptz end, updated_at = now() where id = p_conversation_id returning * into v_conv;
  insert into public.conversation_assignment_events (organization_id, conversation_id, from_user_id, to_user_id, changed_by, reason) values (p_organization_id, p_conversation_id, v_from, p_to_user_id, auth.uid(), 'transfer');
  return next v_conv;
end;
$$;
revoke all on function public.fn_conversation_assign_department(uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.fn_conversation_assign_department(uuid,uuid,uuid,uuid) to authenticated, service_role;

-- Uma permissão de leitura global não vira permissão de alteração de outro dono.
create or replace function public.fn_can_write_inbox(p_org uuid, p_conversation uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.fn_is_platform_admin_full() or exists (
    select 1 from public.conversations c join public.user_organizations m on m.organization_id = c.organization_id
    where c.organization_id = p_org and c.id = p_conversation and m.user_id = auth.uid()
      and m.revoked_at is null and m.role in ('agent','manager','admin')
      and public.fn_can_read_inbox(c)
      and (m.role in ('manager','admin') or c.assigned_to_user_id is null or c.assigned_to_user_id = auth.uid())
  );
$$;
revoke all on function public.fn_can_write_inbox(uuid,uuid) from public, anon;
grant execute on function public.fn_can_write_inbox(uuid,uuid) to authenticated, service_role;
drop policy if exists inbox_owner_update on public.conversations;
create policy inbox_owner_update on public.conversations as restrictive for update to authenticated
using (public.fn_can_write_inbox(organization_id,id)) with check (public.fn_can_write_inbox(organization_id,id));
drop policy if exists inbox_owner_delete on public.conversations;
create policy inbox_owner_delete on public.conversations as restrictive for delete to authenticated
using (public.fn_can_write_inbox(organization_id,id));
do $$ declare tbl text; begin
  foreach tbl in array array['messages','conversation_notes'] loop
    execute format('drop policy if exists inbox_owner_insert on public.%I',tbl);
    execute format('create policy inbox_owner_insert on public.%I as restrictive for insert to authenticated with check (public.fn_can_write_inbox(organization_id,conversation_id))',tbl);
    execute format('drop policy if exists inbox_owner_update on public.%I',tbl);
    execute format('create policy inbox_owner_update on public.%I as restrictive for update to authenticated using (public.fn_can_write_inbox(organization_id,conversation_id)) with check (public.fn_can_write_inbox(organization_id,conversation_id))',tbl);
    execute format('drop policy if exists inbox_owner_delete on public.%I',tbl);
    execute format('create policy inbox_owner_delete on public.%I as restrictive for delete to authenticated using (public.fn_can_write_inbox(organization_id,conversation_id))',tbl);
  end loop;
end $$;
notify pgrst, 'reload schema';

create or replace function public.fn_push_inscricoes_que_veem_a_conversa(
  p_org uuid,
  p_conversation uuid
) returns table (id uuid, user_id uuid, endpoint text, p256dh text, auth text)
language plpgsql volatile security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_conversation public.conversations%rowtype;
  v_user uuid;
  v_claims text := current_setting('request.jwt.claims', true);
  v_claim text := current_setting('request.jwt.claim', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
begin
  select c.* into v_conversation
    from public.conversations c
   where c.id = p_conversation and c.organization_id = p_org;
  if not found then
    return;
  end if;

  -- auth.uid()/auth.jwt() leem estas três; só `claims` carrega o inscrito.
  perform set_config('request.jwt.claim', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  for v_user in
    select distinct s.user_id from public.push_subscriptions s where s.organization_id = p_org
     order by s.user_id
  loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user)::text, true);
    if public.fn_can_read_inbox(v_conversation) then
      return query
        select s.id, s.user_id, s.endpoint, s.p256dh, s.auth
          from public.push_subscriptions s
         where s.organization_id = p_org and s.user_id = v_user;
    end if;
  end loop;

  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim', coalesce(v_claim, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
end;
$$;

revoke all on function public.fn_push_inscricoes_que_veem_a_conversa(uuid, uuid) from public;
revoke execute on function public.fn_push_inscricoes_que_veem_a_conversa(uuid, uuid) from anon, authenticated;
grant execute on function public.fn_push_inscricoes_que_veem_a_conversa(uuid, uuid) to service_role;

do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname = 'public'
    and tablename in ('messages','conversation_notes','conversation_assignment_events','ai_reply_drafts','conversation_handoffs','conversation_drafts','passagens_de_atendimento') loop
    execute format('drop policy if exists inbox_conversation_read on public.%I',r.tablename);
    execute format('create policy inbox_conversation_read on public.%I as restrictive for select to authenticated using (exists (select 1 from public.conversations c where c.id = conversation_id and c.organization_id = %I.organization_id))',r.tablename,r.tablename);
  end loop;
end $$;
notify pgrst, 'reload schema';
