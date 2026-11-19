-- Reparo idempotente de dados, sem schema. Execute após backup com psql -v organization_id=UUID.
-- Só nomes comprovados pelo webhook da MESMA organização, sessão e mensagem.
-- Não ressuscita mídia expirada, mensagem revogada ou anonimizada e não substitui nome existente.
with fontes as (
  select distinct on (m.id) m.id, w.received_at,
    coalesce(
      nullif(btrim(case when jsonb_typeof(w.payload_parsed #> '{payload,media,filename}')='string'
        then w.payload_parsed #>> '{payload,media,filename}' end), ''),
      nullif(btrim(case when jsonb_typeof(w.payload_parsed #> '{payload,_data,message,documentMessage,fileName}')='string'
        then w.payload_parsed #>> '{payload,_data,message,documentMessage,fileName}' end), ''),
      nullif(btrim(case when jsonb_typeof(w.payload_parsed #> '{payload,_data,message,documentWithCaptionMessage,message,documentMessage,fileName}')='string'
        then w.payload_parsed #>> '{payload,_data,message,documentWithCaptionMessage,message,documentMessage,fileName}' end), '')
    ) as nome
  from public.messages m join public.webhook_events_log w
    on w.organization_id=m.organization_id and w.channel_session_id=m.channel_session_id
    and w.external_id=m.external_id
  where m.organization_id=:'organization_id'::uuid and m.type='document'
    and m.revoked_at is null and m.body is distinct from '[mensagem anonimizada]'
    and coalesce(m.metadata->>'media_status','') <> 'expired'
    and (m.media_storage_path is not null or m.media_url is not null)
    and nullif(btrim(m.metadata->>'media_filename'),'') is null
    and w.provider='waha' and w.status='processed'
  order by m.id, (w.payload_parsed #>> '{payload,media,filename}' is not null) desc, w.received_at desc
), alteradas as (
  update public.messages m set metadata=coalesce(m.metadata,'{}'::jsonb)
    || jsonb_build_object('media_filename', left(f.nome,255))
  from fontes f where m.id=f.id and f.nome is not null
    and m.organization_id=:'organization_id'::uuid
    and m.revoked_at is null and m.body is distinct from '[mensagem anonimizada]'
    and nullif(btrim(m.metadata->>'media_filename'),'') is null
  returning m.id, m.organization_id
), auditadas as (
  insert into public.api_audit_log(organization_id, action, resource_type, metadata, bypassed_rls)
  select organization_id, 'message.media_filename_recovered', 'messages',
    jsonb_build_object('count', count(*), 'source', 'webhook_events_log'), true
  from alteradas group by organization_id returning id
)
select (select count(*) from alteradas) as recuperadas, (select count(*) from auditadas) as auditorias;
