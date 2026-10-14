import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { createAdminClient } from "@/lib/supabase/admin";
import { runRoutingWorker } from "@/lib/routing/worker";
import { routingPgSupabase } from "../support/routing-pg-supabase";
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
const pool = new Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT}/postgres`, max: 5 });
const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
const org = randomUUID(), channel = randomUUID(), department = randomUUID(), otherDepartment = randomUUID();
const ana = randomUUID(), bruno = randomUUID(), outsider = randomUUID();
const candidates = () => JSON.stringify([ana, bruno].map(user_id => ({ user_id, schedule: {} })));
async function snapshot(id = department) {
  return (await q("select jsonb_build_object('distribution_method',distribution_method,'only_online',only_online,'contact_stickiness',contact_stickiness,'schedule',schedule) s from departments where organization_id=$1 and id=$2", [org,id])).rows[0].s;
}
async function conversation(dept: string | null = null, contactId?: string, extra: Record<string, unknown> = {}) {
  const contact = contactId ?? randomUUID(), id = randomUUID();
  await q("insert into contacts(id,organization_id,display_name) values($1,$2,'Cliente de teste') on conflict do nothing", [contact,org]);
  await q("insert into conversations(id,organization_id,contact_id,channel_session_id,status,assigned_department_id,is_group) values($1,$2,$3,$4,$5,$6,$7)", [id,org,contact,channel,extra.status ?? "open",dept,extra.is_group ?? false]);
  return { id,contact };
}
async function claim(id: string, dept = department, config?: unknown, users = candidates()) {
  return (await q("select fn_department_routing_claim($1,$2,$3,$4,$5,$6) result", [org,id,channel,dept,users,JSON.stringify(config ?? await snapshot(dept))])).rows[0].result;
}
beforeAll(async () => {
  await q("insert into organizations(id,slug,legal_name,display_name,settings) values($1,$2,'Departamentos','Departamentos','{\"routing\":{\"mode\":\"manual\"}}')", [org,`dept-${org}`]);
  for (const user of [ana,bruno,outsider]) {
    await q("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",[user,`${user}@invariant.test`,JSON.stringify({full_name:user === ana ? "Ana" : "Bruno"})]);
    await q("insert into user_organizations(organization_id,user_id,role,accepted_at) values($1,$2,'agent',now())",[org,user]);
  }
  await q("insert into channel_sessions(id,organization_id,waha_session_name,status,webhook_secret_encrypted) values($1,$2,$3,'STOPPED',decode('00','hex'))",[channel,org,`dept-${channel}`]);
  await q("insert into departments(id,organization_id,name,distribution_method,is_default) values($1,$2,'Comercial de teste','round_robin',true),($3,$2,'Outro setor','least_loaded',false)",[department,org,otherDepartment]);
});
afterAll(async () => { await q("delete from organizations where id=$1",[org]); await q("delete from auth.users where id=any($1)",[[ana,bruno,outsider]]); await pool.end(); });
beforeEach(async () => {
  await q("delete from event_log where organization_id=$1",[org]);
  await q("delete from conversations where organization_id=$1",[org]);
  await q("delete from department_members where organization_id=$1",[org]);
  await q("delete from channel_routing_policies where organization_id=$1",[org]);
  await q("update user_organizations set revoked_at=null where organization_id=$1",[org]);
  // O índice de padrão ativo é imediato: retire o anterior antes de trocar.
  await q("update departments set is_default=false where organization_id=$1",[org]);
  await q("update departments set is_active=true,distribution_method='round_robin',only_online=true,contact_stickiness=false,schedule='{}',is_default=(id=$2) where organization_id=$1",[org,department]);
  for (const user of [ana,bruno]) {
    await q("insert into department_members(organization_id,department_id,user_id) values($1,$2,$3)",[org,department,user]);
    await q("insert into attendant_availability(organization_id,user_id,is_available,capacity,schedule) values($1,$2,true,0,'{}') on conflict(organization_id,user_id) do update set is_available=true,capacity=0,schedule='{}'",[org,user]);
  }
});
describe("departamentos instalados, sem nomes ou tenants fixos", () => {
  it("disponibilidade e configuração acordam eventos antigos sem depender do backoff", async () => {
    const a=await conversation();
    await q("update event_log set next_attempt_at=now()+interval '1 hour' where organization_id=$1 and entity_id=$2 and event_type='conversation.routing_requested'",[org,a.id]);
    await q("update attendant_availability set is_available=false where organization_id=$1 and user_id=$2",[org,ana]);
    expect((await q("select next_attempt_at<=now() due from event_log where organization_id=$1 and entity_id=$2 and event_type='conversation.routing_requested' and status='pending'",[org,a.id])).rows[0].due).toBe(true);
    await q("update event_log set next_attempt_at=now()+interval '1 hour' where organization_id=$1 and entity_id=$2",[org,a.id]);
    await q("update departments set distribution_method='least_loaded' where id=$1",[department]);
    expect((await q("select next_attempt_at<=now() due from event_log where organization_id=$1 and entity_id=$2 and event_type='conversation.routing_requested' and status='pending'",[org,a.id])).rows[0].due).toBe(true);
  });
  it("entrada recebe o padrão; vínculo explícito, grupos e conversas fechadas são preservados", async () => {
    const a = await conversation(), b = await conversation(otherDepartment);
    const group = await conversation(null,undefined,{is_group:true}), closed = await conversation(null,undefined,{status:"closed"});
    const rows=(await q("select id,assigned_department_id from conversations where organization_id=$1",[org])).rows;
    expect(rows.find(r=>r.id===a.id).assigned_department_id).toBe(department);
    expect(rows.find(r=>r.id===b.id).assigned_department_id).toBe(otherDepartment);
    expect(rows.find(r=>r.id===group.id).assigned_department_id).toBeNull();
    expect(rows.find(r=>r.id===closed.id).assigned_department_id).toBeNull();
    await q("update departments set is_default=false where id=$1",[department]);
    await q("update departments set is_default=true where id=$1",[otherDepartment]);
    expect((await q("select assigned_department_id from conversations where id=$1",[(await conversation()).id])).rows[0].assigned_department_id).toBe(otherDepartment);
  });
  it("eventos anteriores ganham o padrão; dono existente não é transferido", async () => {
    await q("update departments set is_default=false where id=$1",[department]);
    const a=await conversation(), b=await conversation();
    await q("select fn_conversation_assign($1,$2,$3,'routing',null,true)",[org,b.id,ana]);
    await q("update departments set is_default=true where id=$1",[department]);
    expect((await q("select fn_prepare_conversation_department($1,$2) d",[org,a.id])).rows[0].d).toBe(department);
    expect((await q("select fn_prepare_conversation_department($1,$2) d",[org,b.id])).rows[0].d).toBeNull();
  });
  it("o worker usa o método do setor mesmo com organização manual e gera Aguardando", async () => {
    const a=await conversation(); const adapter=routingPgSupabase(pool);
    vi.mocked(createAdminClient).mockReturnValue(adapter.client as never);
    await runRoutingWorker(); expect(adapter.errors).toEqual([]);
    const row=(await q("select assigned_department_id,assigned_to_user_id,human_accepted_at,inbox_state(c) state from conversations c where id=$1",[a.id])).rows[0];
    expect(row.assigned_department_id).toBe(department);
    expect([ana,bruno]).toContain(row.assigned_to_user_id);
    expect(row.human_accepted_at).toBeNull(); expect(row.state).toBe("waiting");
  });
  it("rodízio concorrente distribui para ambos; replay não troca responsável", async () => {
    const a=await conversation(), b=await conversation();
    const assigned=await Promise.all([claim(a.id),claim(b.id)]);
    expect(new Set(assigned.map(r=>r.user_id))).toEqual(new Set([ana,bruno]));
    expect((await claim(a.id)).result).toBe("already_assigned");
  });
  it("outro setor usa seus participantes e Só online, sem herdar os responsáveis do número", async () => {
    await q("insert into department_members(organization_id,department_id,user_id) values($1,$2,$3)",[org,otherDepartment,bruno]);
    await q("update departments set only_online=false,distribution_method='least_loaded' where id=$1",[otherDepartment]);
    await q("update attendant_availability set is_available=false where organization_id=$1 and user_id=$2",[org,bruno]);
    const policy=randomUUID(); await q("insert into channel_routing_policies(id,organization_id,channel_session_id) values($1,$2,$3)",[policy,org,channel]);
    await q("insert into channel_routing_responsibles(organization_id,policy_id,user_id) values($1,$2,$3)",[org,policy,outsider]);
    const a=await conversation(otherDepartment);
    expect(await claim(a.id,otherDepartment)).toMatchObject({result:"assigned",user_id:bruno});
    await q("update departments set only_online=true where id=$1",[otherDepartment]);
    expect((await claim((await conversation(otherDepartment)).id,otherDepartment)).result).toBe("no_eligible");
  });
  it("menor carga e fidelização usam fatos vigentes do setor", async () => {
    await q("update departments set distribution_method='least_loaded' where id=$1",[department]);
    const previous=await conversation();
    await q("select fn_conversation_assign($1,$2,$3,'routing',null,true)",[org,previous.id,ana]);
    expect(await claim((await conversation()).id)).toMatchObject({user_id:bruno});
    await q("update departments set contact_stickiness=true where id=$1",[department]);
    await q("update conversations set status='closed' where id=$1",[previous.id]);
    expect(await claim((await conversation(null,previous.contact)).id)).toMatchObject({user_id:ana});
  });
  it("configuração, transferência, membro e capacidade alterados invalidam a escolha antiga", async () => {
    const a=await conversation(), config=await snapshot();
    await q("update departments set only_online=false where id=$1",[department]);
    expect((await claim(a.id,department,config)).result).toBe("department_changed");
    await q("update conversations set assigned_department_id=$2 where id=$1",[a.id,otherDepartment]);
    expect((await claim(a.id)).result).toBe("conversation_changed");
    const b=await conversation();
    await q("update department_members set receives_auto_distribution=false where organization_id=$1",[org]);
    expect((await claim(b.id)).result).toBe("no_eligible");
    await q("update department_members set receives_auto_distribution=true where organization_id=$1",[org]);
    await q("update attendant_availability set capacity=1 where organization_id=$1",[org]);
    await claim(b.id); await claim((await conversation()).id);
    expect((await claim((await conversation()).id)).result).toBe("no_eligible");
  });
  it("RPC de atribuição de setor é privada, sem conceder execução à sessão humana", async () => {
    const result=(await q("select has_function_privilege('authenticated','fn_department_routing_claim(uuid,uuid,uuid,uuid,jsonb,jsonb)','execute') human,has_function_privilege('anon','fn_prepare_conversation_department(uuid,uuid)','execute') anon")).rows[0];
    expect(result).toEqual({human:false,anon:false});
    const a=await conversation();
    expect((await q("select fn_department_routing_claim($1,$2,$3,$4,$5,$6) r",[randomUUID(),a.id,channel,department,candidates(),JSON.stringify(await snapshot())])).rows[0].r.result).toBe("conversation_changed");
  });
});
