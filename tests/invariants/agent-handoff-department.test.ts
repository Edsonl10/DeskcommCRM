import { haQuemAtendaASessao } from "@/lib/ai/agents/quem-atende-a-sessao";
import { loadActiveRouter } from "@/lib/agent-engine/agent/router-config";
import { handoffRouterDepartment } from "@/lib/agent-engine/agent/department-handoff";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
const pool = new Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT}/postgres`,
  max: 5,
});
const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
const org = randomUUID(),
  channel = randomUUID(),
  department = randomUUID(),
  otherDepartment = randomUUID();
const ana = randomUUID(),
  bruno = randomUUID(),
  outsider = randomUUID();
async function conversation(
  dept: string | null = null,
  contactId?: string,
  extra: Record<string, unknown> = {},
) {
  const contact = contactId ?? randomUUID(),
    id = randomUUID();
  await q(
    "insert into contacts(id,organization_id,display_name) values($1,$2,'Cliente de teste') on conflict do nothing",
    [contact, org],
  );
  await q(
    "insert into conversations(id,organization_id,contact_id,channel_session_id,status,assigned_department_id,is_group) values($1,$2,$3,$4,$5,$6,$7)",
    [id, org, contact, channel, extra.status ?? "open", dept, extra.is_group ?? false],
  );
  return { id, contact };
}
beforeAll(async () => {
  await q(
    "insert into organizations(id,slug,legal_name,display_name,settings) values($1,$2,'Departamentos','Departamentos','{\"routing\":{\"mode\":\"manual\"}}')",
    [org, `dept-${org}`],
  );
  for (const user of [ana, bruno, outsider]) {
    await q("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)", [
      user,
      `${user}@invariant.test`,
      JSON.stringify({ full_name: user === ana ? "Ana" : "Bruno" }),
    ]);
    await q(
      "insert into user_organizations(organization_id,user_id,role,accepted_at) values($1,$2,'agent',now())",
      [org, user],
    );
  }
  await q(
    "insert into channel_sessions(id,organization_id,waha_session_name,status,webhook_secret_encrypted) values($1,$2,$3,'STOPPED',decode('00','hex'))",
    [channel, org, `dept-${channel}`],
  );
  await q(
    "insert into departments(id,organization_id,name,distribution_method,is_default) values($1,$2,'Comercial de teste','round_robin',true),($3,$2,'Outro setor','least_loaded',false)",
    [department, org, otherDepartment],
  );
});
afterAll(async () => {
  await q("delete from organizations where id=$1", [org]);
  await q("delete from auth.users where id=any($1)", [[ana, bruno, outsider]]);
  await pool.end();
});
beforeEach(async () => {
  await q("delete from event_log where organization_id=$1", [org]);
  await q("delete from conversations where organization_id=$1", [org]);
  await q("delete from department_members where organization_id=$1", [org]);
  await q("delete from channel_routing_policies where organization_id=$1", [org]);
  await q("update user_organizations set revoked_at=null where organization_id=$1", [org]);
  // O índice de padrão ativo é imediato: retire o anterior antes de trocar.
  await q("update departments set is_default=false where organization_id=$1", [org]);
  await q(
    "update departments set is_active=true,distribution_method='round_robin',only_online=true,contact_stickiness=false,schedule='{}',is_default=(id=$2) where organization_id=$1",
    [org, department],
  );
  for (const user of [ana, bruno]) {
    await q(
      "insert into department_members(organization_id,department_id,user_id) values($1,$2,$3)",
      [org, department, user],
    );
    await q(
      "insert into attendant_availability(organization_id,user_id,is_available,capacity,schedule) values($1,$2,true,0,'{}') on conflict(organization_id,user_id) do update set is_available=true,capacity=0,schedule='{}'",
      [org, user],
    );
  }
});
describe("triagem da IA encaminha ao setor sem tomar o aceite humano", () => {
  const passar = (id: string, contact: string, nome: string, tenant = org) =>
    q("select fn_agent_handoff_department($1,$2,$3,$4) destino", [tenant, id, contact, nome]);
  it.each(["Comercial", "Financeiro"])(
    "encaminha %s, audita e pede a distribuição do setor",
    async (nome) => {
      await q("update departments set name=$2 where id=$1", [otherDepartment, nome]);
      const a = await conversation(department);
      expect((await passar(a.id, a.contact, nome)).rows[0].destino).toBe(otherDepartment);
      expect(
        (
          await q(
            "select assigned_department_id,assigned_to_user_id,status,bot_silenced_until='infinity'::timestamptz silenciado from conversations where id=$1",
            [a.id],
          )
        ).rows[0],
      ).toEqual({
        assigned_department_id: otherDepartment,
        assigned_to_user_id: null,
        status: "pending",
        silenciado: true,
      });
      expect(
        (
          await q(
            "select count(*)::int n from conversation_assignment_events where conversation_id=$1 and reason='transfer'",
            [a.id],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await q(
            "select payload->>'department_id' destino from event_log where entity_id=$1 and event_type='conversation.department_routing_requested'",
            [a.id],
          )
        ).rows[0].destino,
      ).toBe(otherDepartment);
      await passar(a.id, a.contact, nome);
      expect(
        (
          await q(
            "select count(*)::int n from conversation_assignment_events where conversation_id=$1 and reason='transfer'",
            [a.id],
          )
        ).rows[0].n,
      ).toBe(1);
    },
  );
  it("roteador humano abre o dreno sem agente publicado e transfere pelo handoff nativo", async () => {
    const router = randomUUID();
    await q("insert into ai_routers(id,organization_id,channel_session_id,name,is_active,config) values($1,$2,$3,'Triagem humana',true,$4)", [router, org, channel, JSON.stringify({ human_routing: { fallback_department_id: department, routes: [{ intent_name: 'Cobrança', intent_description: 'Boleto', examples: [], department_id: otherDepartment }] } })]);
    try {
      expect(await haQuemAtendaASessao(pool, org, channel)).toBe(true);
      expect(await haQuemAtendaASessao(pool, randomUUID(), channel)).toBe(false);
      const loaded = await loadActiveRouter(pool, org, channel);
      expect(loaded?.members[0]?.destinationDepartmentId).toBe(otherDepartment);
      const a = await conversation();
      await handoffRouterDepartment(pool, { tenantId: org, leadId: a.contact, conversationId: a.id, departmentId: otherDepartment, intentName: 'Cobrança' }, { info: vi.fn(), warn: vi.fn(), error: vi.fn() });
      const row = (await q("select c.force_human,v.assigned_department_id,v.status,v.bot_silenced_until::text silence from contacts c join conversations v on v.contact_id=c.id where v.id=$1", [a.id])).rows[0];
      expect(row).toMatchObject({ force_human: true, assigned_department_id: otherDepartment, status: 'pending', silence: 'infinity' });
      expect((await q("select origem from passagens_de_atendimento where conversation_id=$1", [a.id])).rows[0]?.origem).toBe('runtime_nativo');
      await q("update ai_routers set is_active=false where id=$1", [router]);
      expect(await haQuemAtendaASessao(pool, org, channel)).toBe(false);
    } finally { await q("delete from ai_routers where id=$1", [router]); }
  });
  it("repetição da passagem preserva quem o rodízio já escolheu", async () => {
    await q("update departments set name='Financeiro' where id=$1", [otherDepartment]);
    await q("insert into department_members(organization_id,department_id,user_id) values($1,$2,$3)", [org,otherDepartment,ana]);
    const a = await conversation(department);
    await passar(a.id,a.contact,"Financeiro");
    await q("select fn_conversation_assign($1,$2,$3,'routing',null,true)", [org,a.id,ana]);
    await passar(a.id,a.contact,"Financeiro");
    expect((await q("select assigned_to_user_id from conversations where id=$1",[a.id])).rows[0].assigned_to_user_id).toBe(ana);
    expect((await q("select count(*)::int n from conversation_assignment_events where conversation_id=$1 and reason='transfer'",[a.id])).rows[0].n).toBe(1);
  });
  it("outro tenant, contato trocado, setor inativo e nome inexistente não alteram conversa", async () => {
    const a = await conversation(department);
    const antes = (await q("select row_to_json(c) estado from conversations c where id=$1", [a.id]))
      .rows[0].estado;
    await expect(passar(a.id, a.contact, "Comercial", randomUUID())).rejects.toThrow(
      "conversation_not_found",
    );
    await expect(passar(a.id, randomUUID(), "Comercial")).rejects.toThrow("conversation_not_found");
    await expect(passar(a.id, a.contact, "Não existe")).rejects.toThrow(
      "department_not_found_or_ambiguous",
    );
    await q("update departments set is_active=false where id=$1", [otherDepartment]);
    await expect(passar(a.id, a.contact, "Financeiro")).rejects.toThrow(
      "department_not_found_or_ambiguous",
    );
    expect(
      (await q("select row_to_json(c) estado from conversations c where id=$1", [a.id])).rows[0]
        .estado,
    ).toEqual(antes);
  });
  it("aceite humano e encerramento são preservados", async () => {
    const a = await conversation(department);
    await q("select fn_conversation_assign($1,$2,$3,'claim',null,true)", [org, a.id, ana]);
    await expect(passar(a.id, a.contact, "Financeiro")).rejects.toThrow(
      "conversation_not_available_for_agent",
    );
    await q("update conversations set human_accepted_at=null,status='closed' where id=$1", [a.id]);
    await expect(passar(a.id, a.contact, "Financeiro")).rejects.toThrow(
      "conversation_not_available_for_agent",
    );
    expect(
      (await q("select assigned_to_user_id from conversations where id=$1", [a.id])).rows[0]
        .assigned_to_user_id,
    ).toBe(ana);
  });
  it("somente o runtime privilegiado pode chamar a função", async () => {
    for (const role of ["anon", "authenticated"]) {
      expect(
        (
          await q(
            "select has_function_privilege($1,'public.fn_agent_handoff_department(uuid,uuid,uuid,text)','EXECUTE') permitido",
            [role],
          )
        ).rows[0].permitido,
      ).toBe(false);
    }
    expect(
      (
        await q(
          "select has_function_privilege('service_role','public.fn_agent_handoff_department(uuid,uuid,uuid,text)','EXECUTE') permitido",
        )
      ).rows[0].permitido,
    ).toBe(true);
  });
});
