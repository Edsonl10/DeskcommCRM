-- 0176_departamentos_e_distribuicao
-- Departamentos são unidades de atendimento dentro da organização. A associação
-- pessoa↔departamento guarda tanto o papel (normal/supervisor) quanto a
-- participação na fila automática; são conceitos diferentes por desenho.

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  color text not null default '#16a34a' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  distribution_method text not null default 'manual'
    check (distribution_method in ('manual', 'round_robin', 'least_loaded')),
  only_online boolean not null default true,
  contact_stickiness boolean not null default false,
  schedule jsonb not null default '{}'::jsonb,
  out_of_hours_message text,
  closing_reasons jsonb not null default '[]'::jsonb,
  closing_message text,
  satisfaction_enabled boolean not null default false,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);
create unique index if not exists departments_one_default_per_org
  on public.departments (organization_id) where is_default and is_active;
create index if not exists departments_org_active_idx
  on public.departments (organization_id, name) where is_active;

create table if not exists public.department_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'normal' check (member_role in ('normal', 'supervisor')),
  receives_auto_distribution boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, user_id)
);
create index if not exists department_members_user_idx on public.department_members (organization_id, user_id);
create index if not exists department_members_routing_idx on public.department_members (department_id, user_id) where receives_auto_distribution;

alter table public.conversations add column if not exists assigned_department_id uuid references public.departments(id) on delete set null;
create index if not exists conversations_assigned_department_idx on public.conversations (organization_id, assigned_department_id) where assigned_department_id is not null;

alter table public.departments enable row level security;
alter table public.department_members enable row level security;
drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments for select using (public.fn_is_platform_admin() or organization_id in (select public.fn_user_org_ids()));
drop policy if exists departments_manager_write on public.departments;
create policy departments_manager_write on public.departments for all using (public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'manager'))) with check (public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'manager')));
drop policy if exists department_members_select on public.department_members;
create policy department_members_select on public.department_members for select using (public.fn_is_platform_admin() or organization_id in (select public.fn_user_org_ids()));
drop policy if exists department_members_manager_write on public.department_members;
create policy department_members_manager_write on public.department_members for all using (public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'manager'))) with check (public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'manager')));

-- Duas FKs independentes não garantem que o setor e o membro são do mesmo tenant.
create or replace function public.fn_validate_department_member_org()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.departments d where d.id = new.department_id and d.organization_id = new.organization_id) then raise exception 'department_member_organization_mismatch'; end if;
  if coalesce(public.fn_member_role_in_org(new.user_id, new.organization_id), 'none') not in ('agent', 'manager', 'admin') then raise exception 'department_member_not_eligible'; end if;
  return new;
end;
$$;
revoke all on function public.fn_validate_department_member_org() from public, anon;
grant execute on function public.fn_validate_department_member_org() to authenticated, service_role;
drop trigger if exists trg_validate_department_member_org on public.department_members;
create trigger trg_validate_department_member_org before insert or update on public.department_members for each row execute function public.fn_validate_department_member_org();

-- Atribuição para setor ou pessoa: valida o vínculo e usa a trilha auditável existente.
create or replace function public.fn_conversation_assign_department(
  p_organization_id uuid, p_conversation_id uuid, p_department_id uuid, p_to_user_id uuid default null
) returns setof public.conversations language plpgsql security definer set search_path = public as $$
declare v_from uuid; v_conv public.conversations%rowtype;
begin
  if auth.uid() is not null and not public.fn_role_at_least(p_organization_id, 'agent') then raise exception 'caller_not_authorized_for_org'; end if;
  if not exists (select 1 from public.departments where id = p_department_id and organization_id = p_organization_id and is_active) then raise exception 'department_not_found_or_inactive'; end if;
  if p_to_user_id is not null and not exists (select 1 from public.department_members where organization_id = p_organization_id and department_id = p_department_id and user_id = p_to_user_id) then raise exception 'assignee_not_member_of_department'; end if;
  select assigned_to_user_id into v_from from public.conversations where id = p_conversation_id and organization_id = p_organization_id for update;
  if not found then return; end if;
  update public.conversations set assigned_department_id = p_department_id, assigned_to_user_id = p_to_user_id, assigned_at = case when p_to_user_id is null then null else now() end, assignee_kind = case when p_to_user_id is null then null else 'user' end, status = case when p_to_user_id is null then 'open' else 'claimed' end, status_changed_at = now(), unread_count_for_assignee = 0, bot_silenced_until = case when p_to_user_id is null then bot_silenced_until else 'infinity'::timestamptz end, updated_at = now() where id = p_conversation_id returning * into v_conv;
  insert into public.conversation_assignment_events (organization_id, conversation_id, from_user_id, to_user_id, changed_by, reason) values (p_organization_id, p_conversation_id, v_from, p_to_user_id, auth.uid(), 'transfer');
  return next v_conv;
end;
$$;
revoke all on function public.fn_conversation_assign_department(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.fn_conversation_assign_department(uuid, uuid, uuid, uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
