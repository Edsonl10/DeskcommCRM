import { describe, expect, it } from "vitest";
import { sql } from "./gov-helpers";

const id = (n: number) => `90030100-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1), admin = id(2), guest = id(3), invite = id(4);
const accept = `public.fn_accept_inbox_invite('${invite}','${guest}','${org}','agent','${admin}',now(),now(),'{"preset":"simplificada"}','{"all":true,"ai":true,"closed":true}')`;
const seed = `begin;
  insert into auth.users(id,email) values('${admin}','inbox-invite-admin@invariant.test'),('${guest}','inbox-invite-guest@invariant.test');
  insert into public.organizations(id,slug,display_name,legal_name) values('${org}','inbox-invite-9003','Inbox convite','Inbox convite');
  insert into public.user_organizations(organization_id,user_id,role,accepted_at) values('${org}','${admin}','admin',now());
  insert into public.team_invites(id,organization_id,email,role,invited_by,expires_at,inbox_permissions)
    values('${invite}','${org}','inbox-invite-guest@invariant.test','agent','${admin}',now()+interval '1 day','{"all":false,"ai":true,"closed":false}');`;
function prove(body: string) {
  expect(sql(`${seed}\n${body}\nrollback; select 'proved';`)).toContain("proved");
}

describe("convite aplica a autorização do Inbox de forma atômica", () => {
  it("a permissão persistida prevalece sobre token antigo; replay não desfaz edição posterior", () => prove(`
    select ${accept};
    do $$ begin
      if (select inbox_permissions from public.user_organizations where organization_id='${org}' and user_id='${guest}')
          <> '{"all":false,"ai":true,"closed":false}'::jsonb then raise exception 'stale token granted access'; end if;
      if not exists(select 1 from public.team_invites where id='${invite}' and accepted_by='${guest}' and accepted_at is not null)
          then raise exception 'invite not consumed'; end if;
    end $$;
    update public.user_organizations set inbox_permissions='{"all":false,"ai":false,"closed":true}', interface_settings='{"preset":"completa"}'
      where organization_id='${org}' and user_id='${guest}';
    select ${accept};
    do $$ begin
      if (select inbox_permissions from public.user_organizations where organization_id='${org}' and user_id='${guest}')
          <> '{"all":false,"ai":false,"closed":true}'::jsonb then raise exception 'replay overwrote permissions'; end if;
      if (select interface_settings->>'preset' from public.user_organizations where organization_id='${org}' and user_id='${guest}')
          <> 'completa' then raise exception 'replay overwrote appearance'; end if;
    end $$;`));

  it("convite revogado não cria vínculo nem concede permissão; RPC não é pública", () => prove(`
    update public.team_invites set revoked_at=now() where id='${invite}';
    do $$ begin
      begin
        perform ${accept};
        raise exception 'revoked invite accepted';
      exception when insufficient_privilege then null; end;
      if exists(select 1 from public.user_organizations where organization_id='${org}' and user_id='${guest}')
          then raise exception 'revoked invite created membership'; end if;
      if has_function_privilege('authenticated','public.fn_accept_inbox_invite(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,jsonb,jsonb)','execute')
        or has_function_privilege('anon','public.fn_accept_inbox_invite(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,jsonb,jsonb)','execute')
          then raise exception 'invite RPC exposed'; end if;
    end $$;`));
});
