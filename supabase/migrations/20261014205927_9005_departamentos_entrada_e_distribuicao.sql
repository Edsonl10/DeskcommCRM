-- manifest: Liga a entrada ao departamento padrão e distribui pela configuração do setor, com reserva atômica, fidelização e espera pelo aceite humano.
create or replace function public.fn_default_conversation_department() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.assigned_department_id is null and new.assigned_to_user_id is null
   and new.status in ('open','pending') and not coalesce(new.is_group,false)
   and not exists(select 1 from public.contacts where id=new.contact_id and organization_id=new.organization_id and is_personal) then
   select id into new.assigned_department_id from public.departments
    where organization_id=new.organization_id and is_default and is_active;
 end if;
 return new;
end $$;
revoke all on function public.fn_default_conversation_department() from public,anon,authenticated;
drop trigger if exists trg_default_conversation_department on public.conversations;
create trigger trg_default_conversation_department before insert on public.conversations
 for each row execute function public.fn_default_conversation_department();

-- Também prepara eventos anteriores à atualização, sem transferir conversas com dono.
create or replace function public.fn_prepare_conversation_department(p_org uuid,p_conversation uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations; contact uuid; department uuid;
begin
 if not public.fn_support_write_allowed(p_org) then raise exception 'support_readonly' using errcode='42501';end if;
 select contact_id into contact from public.conversations where organization_id=p_org and id=p_conversation;
 if not found then return null;end if;
 perform public.fn_service_lock(p_org,contact);
 select * into c from public.conversations where organization_id=p_org and id=p_conversation for no key update;
 if not found or c.contact_id is distinct from contact then return null;end if;
 if c.assigned_department_id is not null then return c.assigned_department_id;end if;
 if c.assigned_to_user_id is not null or c.status not in('open','pending','claimed','ai_handling') or c.is_group
   or exists(select 1 from public.contacts where organization_id=p_org and id=c.contact_id and is_personal) then return null;end if;
 select id into department from public.departments where organization_id=p_org and is_default and is_active;
 if department is not null then
   update public.conversations set assigned_department_id=department,updated_at=now() where organization_id=p_org and id=c.id;
 end if;
 return department;
end $$;
revoke all on function public.fn_prepare_conversation_department(uuid,uuid) from public,anon,authenticated;
grant execute on function public.fn_prepare_conversation_department(uuid,uuid) to service_role;

-- O setor é a autoridade de distribuição quando a conversa tem setor. A política
-- do número continua sendo a autoridade no caminho legado, sem departamento.
-- O lock do setor ordena rodízios concorrentes; a vaga continua global por pessoa.
create or replace function public.fn_department_routing_claim(
 p_org uuid,p_conversation uuid,p_channel uuid,p_department uuid,p_candidates jsonb,p_department_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations; d public.departments; a public.attendant_availability;
 contact uuid; chosen uuid; previous_user uuid; current_load integer; candidate_schedule jsonb;
begin
 if not public.fn_support_write_allowed(p_org) then raise exception 'support_readonly' using errcode='42501';end if;
 if jsonb_typeof(p_candidates) is distinct from 'array' then raise exception 'routing_candidates_invalid' using errcode='22023';end if;
 select contact_id into contact from public.conversations where organization_id=p_org and id=p_conversation;
 if not found then return jsonb_build_object('result','conversation_changed');end if;
 perform public.fn_service_lock(p_org,contact);
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_department::text,9005));
 select * into d from public.departments where organization_id=p_org and id=p_department and is_active for share;
 if not found or jsonb_build_object('distribution_method',d.distribution_method,'only_online',d.only_online,
   'contact_stickiness',d.contact_stickiness,'schedule',d.schedule) is distinct from p_department_snapshot
   then return jsonb_build_object('result','department_changed');end if;
 if d.distribution_method='manual' then return jsonb_build_object('result','department_changed');end if;
 perform 1 from public.channel_sessions where organization_id=p_org and id=p_channel for share;
 if not found then return jsonb_build_object('result','conversation_changed');end if;
 select * into c from public.conversations where organization_id=p_org and id=p_conversation for no key update;
 if not found or c.contact_id is distinct from contact or c.channel_session_id is distinct from p_channel
   or c.assigned_department_id is distinct from p_department or c.status not in('open','pending','claimed','ai_handling') or c.is_group
   then return jsonb_build_object('result','conversation_changed');end if;
 if c.assigned_to_user_id is not null then return jsonb_build_object('result','already_assigned');end if;
 if exists(select 1 from public.contacts where organization_id=p_org and id=contact and is_personal)
   then return jsonb_build_object('result','conversation_changed');end if;
 if d.contact_stickiness then
   select e.to_user_id into previous_user from public.conversation_assignment_events e
    join public.conversations h on h.id=e.conversation_id and h.organization_id=e.organization_id
    where e.organization_id=p_org and h.contact_id=contact and h.assigned_department_id=p_department and e.to_user_id is not null
    order by e.created_at desc,e.id desc limit 1;
 end if;
 select (candidate->>'user_id')::uuid into chosen
  from jsonb_array_elements(p_candidates) candidate
  join public.user_organizations m on m.organization_id=p_org and m.user_id=(candidate->>'user_id')::uuid
    and m.revoked_at is null and m.role in('agent','manager','admin')
  join public.department_members dm on dm.organization_id=p_org and dm.department_id=p_department
    and dm.user_id=m.user_id and dm.receives_auto_distribution
  left join public.attendant_availability av on av.organization_id=p_org and av.user_id=m.user_id
  cross join lateral (select count(*) n from public.conversations x where x.organization_id=p_org
    and x.assigned_to_user_id=m.user_id and x.status in('open','pending','claimed','ai_handling')) load
  left join lateral (select max(e.created_at) last_at from public.conversation_assignment_events e
    join public.conversations h on h.id=e.conversation_id and h.organization_id=e.organization_id
    where e.organization_id=p_org and e.to_user_id=m.user_id and h.assigned_department_id=p_department) history on true
  where (not d.only_online or coalesce(av.is_available,false))
    and (coalesce(av.capacity,5)=0 or load.n<coalesce(av.capacity,5))
    and coalesce(av.schedule,'{}'::jsonb)=coalesce(candidate->'schedule','{}'::jsonb)
  order by coalesce(m.user_id=previous_user,false) desc,
    case when d.distribution_method='least_loaded' then load.n else 0 end,
    history.last_at asc nulls first,m.user_id limit 1;
 if chosen is null then return jsonb_build_object('result','no_eligible');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||chosen::text,228));
 perform 1 from public.user_organizations where organization_id=p_org and user_id=chosen
   and revoked_at is null and role in('agent','manager','admin') for share;
 if not found then return jsonb_build_object('result','candidate_revoked');end if;
 perform 1 from public.department_members where organization_id=p_org and department_id=p_department
   and user_id=chosen and receives_auto_distribution for share;
 if not found then return jsonb_build_object('result','candidate_not_allowed');end if;
 select * into a from public.attendant_availability where organization_id=p_org and user_id=chosen for share;
 select candidate->'schedule' into candidate_schedule from jsonb_array_elements(p_candidates) candidate
   where (candidate->>'user_id')::uuid=chosen limit 1;
 if (d.only_online and not coalesce(a.is_available,false))
   or coalesce(a.schedule,'{}'::jsonb) is distinct from coalesce(candidate_schedule,'{}'::jsonb)
   then return jsonb_build_object('result','capacity_changed');end if;
 select count(*) into current_load from public.conversations where organization_id=p_org and assigned_to_user_id=chosen
   and status in('open','pending','claimed','ai_handling');
 if coalesce(a.capacity,5)>0 and current_load>=coalesce(a.capacity,5) then return jsonb_build_object('result','capacity_changed');end if;
 perform public.fn_conversation_assign(p_org,p_conversation,chosen,'routing',null,true);
 -- Distribuir não é aceitar: o humano recebe na sua fila Aguardando.
 update public.conversations set human_accepted_at=null,bot_silenced_until='infinity'::timestamptz
   where organization_id=p_org and id=p_conversation;
 return jsonb_build_object('result','assigned','user_id',chosen);
end $$;
revoke all on function public.fn_department_routing_claim(uuid,uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.fn_department_routing_claim(uuid,uuid,uuid,uuid,jsonb,jsonb) to service_role;

-- Configuração nova acorda a fila que já esperava; heartbeat não reabre eventos.
-- Só agenda: a atribuição permanece no worker, e não há trigger de eco no assign.
create or replace function public.fn_wake_department_queues() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare organization uuid;
begin
 if tg_table_name='attendant_availability' and tg_op='UPDATE' then
   if new.is_available is not distinct from old.is_available
     and new.capacity is not distinct from old.capacity
     and new.schedule is not distinct from old.schedule then return null;end if;
 end if;
 if tg_op='DELETE' then organization:=old.organization_id;else organization:=new.organization_id;end if;
 if not exists(select 1 from public.organizations where id=organization) then return null;end if;
 perform public.fn_wake_channel_routing(organization);
 return null;
end $$;
revoke all on function public.fn_wake_department_queues() from public,anon,authenticated;
drop trigger if exists trg_wake_department_queues on public.departments;
create trigger trg_wake_department_queues after insert or update on public.departments
 for each row execute function public.fn_wake_department_queues();
drop trigger if exists trg_wake_department_member_queues on public.department_members;
create trigger trg_wake_department_member_queues after insert or update or delete on public.department_members
 for each row execute function public.fn_wake_department_queues();
drop trigger if exists trg_wake_availability_queues on public.attendant_availability;
create trigger trg_wake_availability_queues after insert or update of is_available,capacity,schedule on public.attendant_availability
 for each row execute function public.fn_wake_department_queues();
notify pgrst,'reload schema';
