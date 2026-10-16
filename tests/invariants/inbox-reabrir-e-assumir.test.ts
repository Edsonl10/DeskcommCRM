import { beforeAll, describe, expect, it } from "vitest";
import { sql, lastLine } from "./gov-helpers";
const id = (n: number) => `90060000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const org=id(1), eu=id(2), outro=id(3), canal=id(4), contato=id(5), conversa=id(6);
const asEu = (query: string, aal = "aal1") => sql(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${eu}","aal":"${aal}"}',false); ${query}`);
beforeAll(() => {
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${eu}','reabre@invariant.test','{"full_name":"Maria"}'),('${outro}','anterior@invariant.test','{}');
    insert into public.organizations(id,slug,legal_name,display_name) values('${org}','reabre9006','Reabre','Reabre');
    insert into public.user_organizations(user_id,organization_id,role,accepted_at,inbox_permissions) values
      ('${eu}','${org}','agent',now(),'{"all":false,"ai":false,"closed":true}'),('${outro}','${org}','agent',now(),'{"all":false,"ai":false,"closed":false}');
    insert into public.channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values('${canal}','${org}','reabre9006','\\x00'::bytea);
    insert into public.contacts(id,organization_id,display_name,force_human) values('${contato}','${org}','Sintético',true);
    insert into public.conversations(id,organization_id,contact_id,channel_session_id,status,assigned_to_user_id) values('${conversa}','${org}','${contato}','${canal}','closed','${outro}');`);
});
const revision = () => lastLine(sql(`select service_revision from public.conversations where id='${conversa}';`));
describe("Reabrir assume o novo episódio", () => {
  it("revalida o acesso ao histórico", () => {
    sql(`update public.user_organizations set inbox_permissions='{}' where organization_id='${org}' and user_id='${eu}';`);
    expect(() => asEu(`select public.fn_reopen_inbox('${org}','${conversa}',${revision()});`)).toThrow();
    expect(lastLine(sql(`select status from public.conversations where id='${conversa}';`))).toBe("closed");
    sql(`update public.user_organizations set inbox_permissions='{"closed":true,"all":false,"ai":false}' where organization_id='${org}' and user_id='${eu}';`);
  });
  it("viewer e membro revogado não reabrem", () => {
    try {
      sql(`update public.user_organizations set role='viewer' where organization_id='${org}' and user_id='${eu}';`);
      expect(() => asEu(`select public.fn_reopen_inbox('${org}','${conversa}',${revision()});`)).toThrow();
      sql(`update public.user_organizations set role='agent',revoked_at=now() where organization_id='${org}' and user_id='${eu}';`);
      expect(() => asEu(`select public.fn_reopen_inbox('${org}','${conversa}',${revision()});`)).toThrow();
    } finally {
      sql(`update public.user_organizations set role='agent',revoked_at=null where organization_id='${org}' and user_id='${eu}';`);
    }
  });
  it("quem ativou MFA precisa comprovar na sessão, inclusive pela RPC direta", () => {
    sql(`insert into auth.mfa_factors(id,user_id,status,factor_type) values('${id(90)}','${eu}','verified','totp');`);
    try {
      expect(() => asEu(`select public.fn_reopen_inbox('${org}','${conversa}',${revision()});`)).toThrow();
      // A aprovação aal2 ocorre numa transação descartada: os próximos casos
      // ainda começam no mesmo episódio fechado, sem eventos de preparação.
      expect(() => asEu(`begin; select public.fn_reopen_inbox('${org}','${conversa}',${revision()}); rollback;`, "aal2")).not.toThrow();
      expect(lastLine(sql(`select status from public.conversations where id='${conversa}';`))).toBe("closed");
    } finally { sql(`delete from auth.mfa_factors where id='${id(90)}';`); }
  });
  it("reabre, troca o dono, aceita, pausa a IA e registra a troca na mesma operação", () => {
    asEu(`select public.fn_reopen_inbox('${org}','${conversa}',${revision()});`);
    expect(lastLine(sql(`select assigned_to_user_id::text||'|'||assigned_to_user_name||'|'||public.inbox_state(c)||'|'||(human_accepted_at is not null)::text||'|'||bot_silenced_until::text from public.conversations c where id='${conversa}';`))).toBe(`${eu}|Maria|active|true|infinity`);
    expect(lastLine(sql(`select count(*) from public.conversation_assignment_events where conversation_id='${conversa}' and from_user_id='${outro}' and to_user_id='${eu}' and changed_by='${eu}' and reason='claim';`))).toBe("1");
    expect(lastLine(sql(`select force_human from public.contacts where id='${contato}';`))).toBe("t");
  });
  it("duplo clique ou revisão vencida não toma uma conversa aberta", () => {
    expect(() => asEu(`select public.fn_reopen_inbox('${org}','${conversa}',${revision()});`)).toThrow();
    expect(lastLine(sql(`select count(*) from public.conversation_assignment_events where conversation_id='${conversa}';`))).toBe("1");
  });
  it("não cruza organização nem aceita chamada anônima", () => {
    expect(() => asEu(`select public.fn_reopen_inbox('${id(99)}','${conversa}',0);`)).toThrow();
    expect(() => sql(`set role anon; select public.fn_reopen_inbox('${org}','${conversa}',0);`)).toThrow();
  });
});
