-- manifest: Passagem da IA resolve o setor na organização e aciona a distribuição existente sem tomar atendimento humano.
create or replace function public.fn_agent_handoff_department(
  p_organization_id uuid, p_conversation_id uuid, p_contact_id uuid, p_department_name text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_conv public.conversations%rowtype;
  v_department uuid;
  v_count integer;
begin
  if not public.fn_support_write_allowed(p_organization_id) then
    raise exception 'support_readonly' using errcode='42501';
  end if;
  select * into v_conv from public.conversations
    where organization_id=p_organization_id and id=p_conversation_id and contact_id=p_contact_id
    for update;
  if not found then raise exception 'conversation_not_found' using errcode='PT404'; end if;
  if v_conv.is_group or v_conv.status in ('closed','archived','resolved')
     or v_conv.human_accepted_at is not null then
    raise exception 'conversation_not_available_for_agent' using errcode='PT409';
  end if;
  select count(*), (array_agg(id))[1] into v_count, v_department
    from public.departments where organization_id=p_organization_id and is_active
    and lower(name)=lower(btrim(p_department_name));
  if v_count <> 1 then
    raise exception 'department_not_found_or_ambiguous' using errcode='PT422';
  end if;
  if v_conv.assigned_department_id=v_department
     and v_conv.bot_silenced_until='infinity'::timestamptz and v_conv.last_handoff_at is not null then
    return v_department;
  end if;
  -- Uma distribuição ainda não aceita pode ser corrigida pela triagem; o aceite
  -- humano foi conferido sob o mesmo lock usado pelas funções de atribuição.
  update public.conversations set
    assigned_department_id=v_department, assigned_to_user_id=null, assigned_to_user_name=null,
    assigned_at=null, assignee_kind=null, human_accepted_at=null, status='pending',
    status_changed_at=now(), unread_count_for_assignee=0,
    bot_silenced_until='infinity'::timestamptz, last_handoff_at=now(), updated_at=now()
    where organization_id=p_organization_id and id=p_conversation_id;
  insert into public.conversation_assignment_events
    (organization_id,conversation_id,from_user_id,to_user_id,changed_by,reason)
    values(p_organization_id,p_conversation_id,v_conv.assigned_to_user_id,null,null,'transfer');
  perform public.emit_event(
    p_event_type => 'conversation.department_routing_requested',
    p_entity_kind => 'conversation', p_entity_id => p_conversation_id,
    p_organization_id => p_organization_id,
    p_payload => jsonb_build_object('organization_id',p_organization_id,
      'conversation_id',p_conversation_id,'department_id',v_department),
    p_metadata => jsonb_build_object('source','agent_handoff'));
  return v_department;
end;
$$;
revoke all on function public.fn_agent_handoff_department(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.fn_agent_handoff_department(uuid,uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
