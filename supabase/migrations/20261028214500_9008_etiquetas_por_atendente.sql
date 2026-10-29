-- manifest: Etiquetas da conversa pertencem ao atendente; transferência guarda e restaura somente o conjunto do responsável de destino.
-- conversations.tags é o conjunto ATIVO (continua indexado e filtrável). O mapa
-- metadata.inbox_tags_por_atendente guarda só os conjuntos anteriores desta conversa.
-- Sem nova tabela, sem mudança de grants/RLS e sem mover etiquetas de contatos/leads.
create or replace function public.fn_inbox_tags_por_atendente()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  guardadas jsonb;
  destino jsonb;
begin
  if new.assigned_to_user_id is not distinct from old.assigned_to_user_id then return new; end if;
  if exists (select 1 from public.contacts where id = new.contact_id
      and organization_id = new.organization_id and is_anonymized) then
    new.tags := '{}'::text[];
    new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'inbox_tags_por_atendente';
    return new;
  end if;
  guardadas := coalesce(new.metadata, '{}'::jsonb)->'inbox_tags_por_atendente';
  if jsonb_typeof(guardadas) is distinct from 'object' then guardadas := '{}'::jsonb; end if;
  guardadas := guardadas || jsonb_build_object(coalesce(old.assigned_to_user_id::text, '_sem_atendente'), to_jsonb(coalesce(old.tags, '{}'::text[])));
  destino := guardadas->new.assigned_to_user_id::text;
  if new.assigned_to_user_id is not null and jsonb_typeof(destino) = 'array' then
    select coalesce(array_agg(v), '{}'::text[]) into new.tags
      from (select value as v from jsonb_array_elements_text(destino) limit 20) t;
  else
    new.tags := '{}'::text[];
  end if;
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('inbox_tags_por_atendente', guardadas);
  return new;
end $$;
revoke execute on function public.fn_inbox_tags_por_atendente() from public, anon, authenticated;
grant execute on function public.fn_inbox_tags_por_atendente() to service_role;
drop trigger if exists zz_inbox_tags_por_atendente on public.conversations;
create trigger zz_inbox_tags_por_atendente
before update of assigned_to_user_id on public.conversations
for each row execute function public.fn_inbox_tags_por_atendente();
