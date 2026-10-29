-- manifest: Calcula o contexto de leitura do Inbox uma vez por consulta e preserva o mesmo escopo por responsável e permissões, evitando timeouts com vários atendentes.
-- O vínculo ativo já implica fn_user_org_ids(): esse helper inclui todos os
-- vínculos não revogados. Repeti-lo para cada conversa repetia também a leitura
-- do suporte, sem acrescentar uma condição de acesso.
-- Nenhum contexto é persistido: a policy usa InitPlan por statement, nunca cache
-- entre usuários, organizações, sessões ou requisições.
create or replace function public.fn_contexto_de_leitura_inbox() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'pessoa', auth.uid(),
    'plataforma', public.fn_is_platform_admin(),
    'vinculos', coalesce((
      select jsonb_object_agg(m.organization_id::text,
        jsonb_build_object('papel', m.role, 'permissoes', m.inbox_permissions))
      from public.user_organizations m
      where m.user_id = auth.uid() and m.revoked_at is null
    ), '{}'::jsonb)
  );
$$;
revoke execute on function public.fn_contexto_de_leitura_inbox() from public, anon;
grant execute on function public.fn_contexto_de_leitura_inbox() to authenticated, service_role;

-- Critério compartilhado pela policy e pelo helper de escrita existente.
-- Invoker: receber um JSON fabricado só devolve um booleano; não lê conversas
-- nem concede acesso. A policy recebe exclusivamente o contexto calculado acima.
-- Os argumentos compostos são anônimos, como nos demais campos calculados.
create or replace function public.fn_leitura_inbox_no_contexto(public.conversations, jsonb)
returns boolean language plpgsql stable set search_path = public, pg_temp as $$
declare
  vinculo jsonb;
begin
  if coalesce(($2->>'plataforma')::boolean, false) then return true; end if;
  vinculo := $2->'vinculos'->($1.organization_id::text);
  if vinculo is null then return false; end if;
  if vinculo->>'papel' in ('manager', 'admin')
     or $1.assigned_to_user_id = ($2->>'pessoa')::uuid then
    return true;
  end if;
  -- inbox_state encerra nestes mesmos três estados antes de consultar IA.
  if $1.status in ('closed', 'archived', 'resolved') then
    return coalesce(vinculo->'permissoes'->'closed' = 'true'::jsonb, false);
  end if;
  -- Todos inclui todas as conversas não encerradas, inclusive as da IA.
  if vinculo->'permissoes'->'all' = 'true'::jsonb then return true; end if;
  if vinculo->'permissoes'->'ai' = 'true'::jsonb then
    return public.inbox_state($1) = 'ai';
  end if;
  return false;
end $$;
revoke execute on function public.fn_leitura_inbox_no_contexto(public.conversations, jsonb) from public, anon;
grant execute on function public.fn_leitura_inbox_no_contexto(public.conversations, jsonb) to authenticated, service_role;

create or replace function public.fn_can_read_inbox(public.conversations)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.fn_leitura_inbox_no_contexto($1, public.fn_contexto_de_leitura_inbox());
$$;
revoke execute on function public.fn_can_read_inbox(public.conversations) from public, anon;
grant execute on function public.fn_can_read_inbox(public.conversations) to authenticated, service_role;

alter policy conversations_select on public.conversations
using (public.fn_leitura_inbox_no_contexto(conversations, (select public.fn_contexto_de_leitura_inbox())));
