-- manifest: Mantém a atribuição por departamento fechada a sessão autenticada agent da organização e aplica as travas de escrita do suporte às tabelas personalizadas.
create or replace function public.fn_conversation_assign_department(
  p_organization_id uuid, p_conversation_id uuid, p_department_id uuid, p_to_user_id uuid default null
) returns setof public.conversations language plpgsql security definer set search_path = public as $$
declare v_from uuid; v_conv public.conversations%rowtype;
begin
  if auth.uid() is null or not public.fn_role_at_least(p_organization_id, 'agent') then raise exception 'caller_not_authorized_for_org'; end if;
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

select public.fn_aplicar_travas_de_suporte();
