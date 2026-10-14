import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { decidirElegibilidadeDaConversa } from "@/lib/ai/elegibilidade/consulta-pg";
import { countAs, sql, lastLine } from "./gov-helpers";

const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${Number(process.env.TEST_DB_PORT ?? 54329)}/postgres`, max: 1 });
afterAll(async () => { await pool.end(); });

const id = (n: number) => `90030000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const org=id(1), eu=id(2), outro=id(3), gestor=id(4), canal=id(5), contato=id(6), conversa=id(7), fechada=id(8);
beforeAll(() => {
  sql(`insert into auth.users(id,email) values ('${eu}','eu@invariant.test'),('${outro}','outro@invariant.test'),('${gestor}','gestor@invariant.test') on conflict do nothing;
    insert into public.organizations(id,slug,legal_name,display_name) values('${org}','inbox-9003','Inbox','Inbox');
    insert into public.user_organizations(user_id,organization_id,role,accepted_at) values ('${eu}','${org}','agent',now()),('${outro}','${org}','agent',now()),('${gestor}','${org}','manager',now());
    insert into public.channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values('${canal}','${org}','inbox9003','\\x00'::bytea);
    insert into public.contacts(id,organization_id,display_name,force_human) values('${contato}','${org}','Pessoa sintética',true),('${id(9)}','${org}','Pessoa do histórico',true);
    insert into public.conversations(id,organization_id,contact_id,channel_session_id,status,assigned_to_user_id) values
      ('${conversa}','${org}','${contato}','${canal}','claimed','${outro}'),
      ('${fechada}','${org}','${id(9)}','${canal}','archived','${outro}');`);
});
const count = (who: string) => countAs(who, `select count(*) from public.conversations where organization_id='${org}';`);
describe("Inbox: segurança real e aceite", () => {
  it("agente não recebe visão global pelo papel ou visibility_mode", () => {
    sql(`update public.organizations set settings='{"visibility_mode":"all"}' where id='${org}';`);
    expect(count(eu)).toBe(0); expect(count(gestor)).toBe(2);
  });
  it("Todos vê andamento mas não histórico; Fechadas é independente", () => {
    sql(`update public.user_organizations set inbox_permissions='{"all":true,"ai":false,"closed":false}' where user_id='${eu}' and organization_id='${org}';`);
    expect(count(eu)).toBe(1);
    sql(`update public.user_organizations set inbox_permissions='{"all":false,"ai":false,"closed":true}' where user_id='${eu}' and organization_id='${org}';`);
    expect(count(eu)).toBe(1);
    expect(countAs(eu,`select count(*) from public.conversations where id='${conversa}';`)).toBe(0);
    expect(countAs(eu,`select count(*) from public.conversations where id='${fechada}';`)).toBe(1);
  });
  it("distribuir não assume; claim assume; transferir e reabrir não reutilizam aceite", () => {
    sql(`select public.fn_conversation_assign('${org}','${conversa}','${eu}','routing');`);
    expect(lastLine(sql(`select public.inbox_state(c) from public.conversations c where id='${conversa}';`))).toBe("waiting");
    sql(`select public.fn_conversation_assign('${org}','${conversa}','${eu}','claim',null,true);`);
    expect(lastLine(sql(`select public.inbox_state(c) from public.conversations c where id='${conversa}';`))).toBe("active");
    sql(`select public.fn_conversation_assign('${org}','${conversa}','${outro}','transfer');`);
    expect(lastLine(sql(`select human_accepted_at is null from public.conversations where id='${conversa}';`))).toBe("t");
    sql(`select public.fn_conversation_assign('${org}','${conversa}','${outro}','claim'); update public.conversations set status='closed' where id='${conversa}';`);
    expect(lastLine(sql(`select human_accepted_at is null from public.conversations where id='${conversa}';`))).toBe("t");
  });
  it("não permite conceder a própria permissão pelo banco", () => {
    try { sql(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${eu}"}',false); update public.user_organizations set inbox_permissions='{"all":true,"ai":true,"closed":true}' where user_id='${eu}' and organization_id='${org}';`); } catch { /* RLS ou trigger recusam; o fato é a permissão não mudar. */ }
    expect(lastLine(sql(`select inbox_permissions->>'all' from public.user_organizations where user_id='${eu}' and organization_id='${org}';`))).toBe("false");
  });
  it("IA prevalece sobre indicação de responsável e Todos também pode lê-la", () => {
    sql(`insert into public.contacts(id,organization_id,display_name) values('${id(14)}','${org}','Pessoa da IA');
      insert into public.ai_agents(id,organization_id,name,system_prompt) values('${id(15)}','${org}','IA de teste','system');
      insert into public.ai_agent_versions(id,organization_id,agent_id,version_number,system_prompt,provider,model,channel_session_id,status)
        values('${id(16)}','${org}','${id(15)}',1,'system','anthropic','claude-sonnet-4-6','${canal}','published');
      update public.ai_agents set published_version_id='${id(16)}' where id='${id(15)}';
      insert into public.conversations(id,organization_id,contact_id,channel_session_id,status,assigned_to_user_id)
        values('${id(17)}','${org}','${id(14)}','${canal}','claimed','${outro}');
      update public.user_organizations set inbox_permissions='{"all":false,"ai":true,"closed":false}' where user_id='${eu}' and organization_id='${org}';
      insert into public.conversation_notes(organization_id,conversation_id,body,created_by_name) values('${org}','${id(17)}','Nota sintética','seed');`);
    expect(lastLine(sql(`select public.inbox_state(c) from public.conversations c where id='${id(17)}';`))).toBe("ai");
    sql(`update public.ai_agents set operation_mode='assisted' where id='${id(15)}';`);
    expect(lastLine(sql(`select public.inbox_state(c) from public.conversations c where id='${id(17)}';`))).toBe("waiting");
    sql(`update public.ai_agents set operation_mode='automatic', paused_at=now() where id='${id(15)}';`);
    expect(lastLine(sql(`select public.inbox_state(c) from public.conversations c where id='${id(17)}';`))).toBe("waiting");
    sql(`update public.ai_agents set paused_at=null where id='${id(15)}';
      insert into public.channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values('${id(18)}','${org}','inbox9003-outro','\\x00'::bytea);
      update public.conversations set channel_session_id='${id(18)}' where id='${id(17)}';`);
    expect(lastLine(sql(`select public.inbox_state(c) from public.conversations c where id='${id(17)}';`))).toBe("waiting");
    sql(`update public.conversations set channel_session_id='${canal}' where id='${id(17)}';`);
    expect(countAs(eu,`select count(*) from public.conversations where id='${id(17)}';`)).toBe(1);
    expect(countAs(eu,`select count(*) from public.conversation_notes where conversation_id='${id(17)}';`)).toBe(1);
    sql(`update public.user_organizations set inbox_permissions='{"all":true,"ai":false,"closed":false}' where user_id='${eu}' and organization_id='${org}';`);
    expect(countAs(eu,`select count(*) from public.conversations where id='${id(17)}';`)).toBe(1);
    expect(lastLine(sql(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${eu}"}',false); select public.fn_can_write_inbox('${org}','${id(17)}');`))).toBe("f");
    sql(`update public.user_organizations set inbox_permissions='{"all":false,"ai":false,"closed":false}' where user_id='${eu}' and organization_id='${org}';`);
    expect(countAs(eu,`select count(*) from public.conversation_notes where conversation_id='${id(17)}';`)).toBe(0);
    sql(`update public.contacts set force_human=true where id='${id(14)}';`);
    expect(lastLine(sql(`select public.inbox_state(c) from public.conversations c where id='${id(17)}';`))).toBe("waiting");
    sql(`select public.fn_conversation_assign('${org}','${id(17)}','${outro}','claim');`);
    expect(lastLine(sql(`select public.inbox_state(c) from public.conversations c where id='${id(17)}';`))).toBe("active");
    sql(`update public.contacts set force_human=false where id='${id(14)}';
      update public.conversations set bot_silenced_until=null where id='${id(17)}';`);
    expect(lastLine(sql(`select human_accepted_at is null from public.conversations where id='${id(17)}';`))).toBe("t");
    expect(lastLine(sql(`select public.inbox_state(c) from public.conversations c where id='${id(17)}';`))).toBe("ai");
  });
  it("o motor mantém a IA elegível após indicação sem aceite e veta após Assumir", async () => {
    const entrada = { organizationId: org, conversationId: id(17), agora: new Date(), ttlMs: 21 * 86400000 };
    expect(await decidirElegibilidadeDaConversa(pool, entrada)).toMatchObject({ permite: true });
    sql(`select public.fn_conversation_assign('${org}','${id(17)}','${outro}','claim');`);
    expect(await decidirElegibilidadeDaConversa(pool, entrada)).toMatchObject({ permite: false, motivo: "conversa_silenciada" });
  });
});
