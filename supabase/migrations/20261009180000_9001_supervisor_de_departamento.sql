-- manifest: Preserva a visualização do supervisor das conversas do seu departamento; numeração do fork isolada para evitar colisão com o upstream.
-- Política aditiva e estrita: não altera as regras existentes de visualização.
-- Só libera uma conversa quando ela pertence a um departamento e o usuário
-- autenticado é Supervisor exatamente daquele departamento, na mesma organização.
drop policy if exists conversations_department_supervisor_select on public.conversations;
create policy conversations_department_supervisor_select on public.conversations
  for select using (
    assigned_department_id is not null
    and organization_id in (select public.fn_user_org_ids())
    and exists (
      select 1
      from public.department_members dm
      where dm.organization_id = conversations.organization_id
        and dm.department_id = conversations.assigned_department_id
        and dm.user_id = auth.uid()
        and dm.member_role = 'supervisor'
    )
  );
notify pgrst, 'reload schema';
