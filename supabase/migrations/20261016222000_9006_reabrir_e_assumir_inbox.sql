-- manifest: Reabertura explícita assume o novo episódio atomicamente sem tomar conversas abertas.
create or replace function public.fn_reopen_inbox(p_org uuid,p_conversation uuid,p_expected bigint)
returns public.conversations language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.conversations; pre_contact uuid; previous_owner uuid;
begin
 if auth.uid() is null or not public.fn_role_at_least(p_org,'agent')
    or not public.fn_support_write_allowed(p_org) or not public.fn_session_mfa_proven() then
   raise exception 'caller_not_authorized' using errcode='42501'; end if;
 select * into c from public.conversations where id=p_conversation and organization_id=p_org;
 if not found or not public.fn_can_read_inbox(c) then
   raise exception 'conversation_not_found' using errcode='P0002'; end if;
 pre_contact := c.contact_id;
 perform public.fn_service_lock(p_org,pre_contact);
 select * into c from public.conversations where id=p_conversation and organization_id=p_org for no key update;
 if not found or c.contact_id is distinct from pre_contact or not public.fn_can_read_inbox(c) then
   raise exception 'service_stale' using errcode='PT409'; end if;
 if p_expected is null or c.service_revision <> p_expected or c.status not in ('closed','archived','resolved') then
   raise exception 'service_stale' using errcode='PT409'; end if;
 previous_owner := c.assigned_to_user_id;
 c := public.fn_service_status(p_org,p_conversation,'open',p_expected);
 -- O aceite e a troca de responsável pertencem à mesma transação da reabertura.
 update public.conversations set assigned_to_user_id=auth.uid(),
   assigned_to_user_name=(select raw_user_meta_data->>'full_name' from auth.users where id=auth.uid()),
   assigned_at=clock_timestamp(),assignee_kind='user',status='claimed',
   status_changed_at=clock_timestamp(),bot_silenced_until='infinity'::timestamptz,
   unread_count_for_assignee=0,updated_at=clock_timestamp()
 where id=p_conversation and organization_id=p_org;
 insert into public.conversation_assignment_events
   (organization_id,conversation_id,from_user_id,to_user_id,changed_by,reason)
 values(p_org,p_conversation,previous_owner,auth.uid(),auth.uid(),'claim');
 update public.conversations set human_accepted_at=clock_timestamp()
 where id=p_conversation and organization_id=p_org returning * into c;
 return c;
end $$;
revoke all on function public.fn_reopen_inbox(uuid,uuid,bigint) from public,anon;
grant execute on function public.fn_reopen_inbox(uuid,uuid,bigint) to authenticated;
notify pgrst,'reload schema';
