import { beforeAll, describe, expect, it } from "vitest";
import { countAs, sql, lastLine } from "./gov-helpers";

const id = (n: number) => `90030000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const org=id(1), eu=id(2), outro=id(3), gestor=id(4), canal=id(5), contato=id(6), conversa=id(7), fechada=id(8);
beforeAll(() => {
  sql(`insert into auth.users(id,email) values ('${eu}','eu@invariant.test'),('${outro}','outro@invariant.test'),('${gestor}','gestor@invariant.test') on conflict do nothing;
    insert into public.organizations(id,slug,legal_name,display_name) values('${org}','inbox-9003','Inbox','Inbox');
    insert into public.user_organizations(user_id,organization_id,role,accepted_at) values ('${eu}','${org}','agent',now()),('${outro}','${org}','agent',now()),('${gestor}','${org}','manager',now());
    insert into public.channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values('${canal}','${org}','inbox9003','\\x00'::bytea);
    insert into public.contacts(id,organization_id,display_name,force_human) values('${contato}','${org}','Pessoa sintética',true);
    insert into public.conversations(id,organization_id,contact_id,channel_session_id,status,assigned_to_user_id) values
      ('${conversa}','${org}','${contato}','${canal}','claimed','${outro}'),
      ('${fechada}','${org}','${contato}','${canal}','archived','${outro}');`);
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
    sql(`select public.fn_conversation_assign('${org}','${conversa}','${eu}','claim');`);
    expect(lastLine(sql(`select public.inbox_state(c) from public.conversations c where id='${conversa}';`))).toBe("active");
    sql(`select public.fn_conversation_assign('${org}','${conversa}','${outro}','transfer');`);
    expect(lastLine(sql(`select human_accepted_at is null from public.conversations where id='${conversa}';`))).toBe("t");
    sql(`select public.fn_conversation_assign('${org}','${conversa}','${outro}','claim'); update public.conversations set status='closed' where id='${conversa}';`);
    expect(lastLine(sql(`select human_accepted_at is null from public.conversations where id='${conversa}';`))).toBe("t");
  });
  it("não permite conceder a própria permissão pelo banco", () => {
    expect(() => sql(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${eu}"}',false); update public.user_organizations set inbox_permissions='{"all":true,"ai":true,"closed":true}' where user_id='${eu}' and organization_id='${org}';`)).toThrow();
  });
});
