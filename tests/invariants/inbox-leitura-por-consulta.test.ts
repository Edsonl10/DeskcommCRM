import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GOV_ORG,
  GOV_SESSION,
  GOV_AGENT_A,
  GOV_AGENT_B,
  GOV_VIEWER,
  GOV_MANAGER,
  GOV_ADMIN,
  seedGov,
} from "./gov-helpers";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 1,
});
beforeAll(seedGov);
afterAll(() => pool.end());

async function ambiente(run: (db: pg.PoolClient, ids: Record<string, string>) => Promise<void>) {
  const db = await pool.connect();
  const ids: Record<string, string> = {};
  try {
    await db.query("begin");
    const agente = randomUUID(),
      versao = randomUUID();
    await db.query(
      "insert into ai_agents(id,organization_id,name,system_prompt) values($1,$2,'IA sintética','system')",
      [agente, GOV_ORG],
    );
    await db.query(
      "insert into ai_agent_versions(id,organization_id,agent_id,version_number,system_prompt,provider,model,channel_session_id,status) values($1,$2,$3,1,'system','anthropic','claude-sonnet-4-6',$4,'published')",
      [versao, GOV_ORG, agente, GOV_SESSION],
    );
    await db.query("update ai_agents set published_version_id=$2 where id=$1", [agente, versao]);
    const linhas = [
      ["propria", "claimed", GOV_AGENT_A],
      ["outra", "claimed", GOV_AGENT_B],
      ["encerrada", "closed", GOV_AGENT_B],
      ["propria_encerrada", "archived", GOV_AGENT_A],
      ["sem_dono", "open", null],
      ["ia", "claimed", GOV_AGENT_B],
    ];
    for (const [nome, status, dono] of linhas) {
      const contato = randomUUID(),
        conversa = randomUUID();
      ids[String(nome)] = conversa;
      await db.query(
        "insert into contacts(id,organization_id,display_name) values($1,$2,'Pessoa sintética')",
        [contato, GOV_ORG],
      );
      await db.query(
        "insert into conversations(id,organization_id,contact_id,channel_session_id,status,assigned_to_user_id,bot_silenced_until) values($1,$2,$3,$4,$5,$6,$7)",
        [conversa, GOV_ORG, contato, GOV_SESSION, status, dono, nome === "ia" ? null : "infinity"],
      );
    }
    await run(db, ids);
  } finally {
    await db.query("rollback");
    db.release();
  }
}
async function identidade(db: pg.PoolClient, pessoa: string) {
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: pessoa, role: "authenticated" }),
  ]);
  await db.query("set local role authenticated");
}
async function visiveis(db: pg.PoolClient, ids: Record<string, string>) {
  return (
    await db.query("select id from conversations where id=any($1::uuid[]) order by id", [
      Object.values(ids),
    ])
  ).rows.map((r: { id: string }) => r.id);
}

describe("leitura do Inbox: contexto por consulta", () => {
  it.each([
    ["próprio", GOV_AGENT_A, {}, ["propria", "propria_encerrada"]],
    [
      "Todos",
      GOV_AGENT_A,
      { all: true },
      ["propria", "propria_encerrada", "outra", "sem_dono", "ia"],
    ],
    ["Fechadas", GOV_AGENT_A, { closed: true }, ["propria", "propria_encerrada", "encerrada"]],
    ["IA", GOV_AGENT_A, { ai: true }, ["propria", "propria_encerrada", "ia"]],
    ["viewer", GOV_VIEWER, {}, []],
    [
      "gestor",
      GOV_MANAGER,
      {},
      ["propria", "propria_encerrada", "outra", "encerrada", "sem_dono", "ia"],
    ],
    [
      "admin",
      GOV_ADMIN,
      {},
      ["propria", "propria_encerrada", "outra", "encerrada", "sem_dono", "ia"],
    ],
  ] as const)("mantém o escopo %s sem alargar leitura", (_nome, pessoa, permissoes, esperadas) =>
    ambiente(async (db, ids) => {
      await db.query(
        "update user_organizations set inbox_permissions=$2 where user_id=$1 and organization_id=$3",
        [pessoa, { all: false, ai: false, closed: false, ...permissoes }, GOV_ORG],
      );
      await identidade(db, pessoa);
      expect(await visiveis(db, ids)).toEqual(esperadas.map((n) => ids[n]).sort());
    }),
  );

  it("não reutiliza contexto entre identidades ou depois da revogação", () =>
    ambiente(async (db, ids) => {
      await identidade(db, GOV_AGENT_A);
      expect(await visiveis(db, ids)).toHaveLength(2);
      await db.query("reset role");
      await identidade(db, GOV_VIEWER);
      expect(await visiveis(db, ids)).toEqual([]);
      await db.query("reset role");
      await db.query(
        "update user_organizations set revoked_at=now() where user_id=$1 and organization_id=$2",
        [GOV_AGENT_A, GOV_ORG],
      );
      await identidade(db, GOV_AGENT_A);
      expect(await visiveis(db, ids)).toEqual([]);
    }));

  it("isolamento inclui o dono após remoção do vínculo e usuário de outro tenant", () =>
    ambiente(async (db, ids) => {
      const pessoa = randomUUID(),
        org = randomUUID();
      await db.query("insert into auth.users(id,email) values($1,$2)", [
        pessoa,
        `${pessoa}@invariant.test`,
      ]);
      await db.query(
        "insert into organizations(id,slug,legal_name,display_name) values($1,$2,'Outro tenant','Outro tenant')",
        [org, `contexto-${org}`],
      );
      await db.query(
        'insert into user_organizations(user_id,organization_id,role,accepted_at,inbox_permissions) values($1,$2,\'admin\',now(),\'{"all":true,"ai":true,"closed":true}\')',
        [pessoa, org],
      );
      await identidade(db, pessoa);
      expect(await visiveis(db, ids)).toEqual([]);
      const contexto = (await db.query("select fn_contexto_de_leitura_inbox() as contexto")).rows[0]
        .contexto;
      expect(Object.keys(contexto.vinculos)).toEqual([org]);
    }));

  it("plataforma conserva sua leitura; retirar o papel não deixa contexto em cache", () =>
    ambiente(async (db, ids) => {
      await db.query(
        "insert into platform_admins(user_id,granted_by,mfa_required,reason) values($1,$1,false,'Teste sintético de leitura')",
        [GOV_AGENT_A],
      );
      await identidade(db, GOV_AGENT_A);
      expect(await visiveis(db, ids)).toHaveLength(6);
      await db.query("reset role");
      await db.query("update platform_admins set revoked_at=now() where user_id=$1", [GOV_AGENT_A]);
      await identidade(db, GOV_AGENT_A);
      expect(await visiveis(db, ids)).toHaveLength(2);
    }));

  it("a policy real calcula o contexto uma vez, mesmo varrendo várias conversas", () =>
    ambiente(async (db) => {
      await identidade(db, GOV_AGENT_A);
      const plano = (
        await db.query(
          "explain (analyze,format json) select count(*) from conversations where organization_id=$1",
          [GOV_ORG],
        )
      ).rows[0]["QUERY PLAN"][0].Plan;
      const visitados: Record<string, unknown>[] = [];
      function visitar(no: Record<string, unknown>) {
        visitados.push(no);
        for (const filho of (no.Plans ?? []) as Record<string, unknown>[]) visitar(filho);
      }
      visitar(plano);
      expect(JSON.stringify(plano)).toContain("fn_leitura_inbox_no_contexto");
      const init = visitados.filter((no) => no["Parent Relationship"] === "InitPlan");
      expect(init).toHaveLength(1);
      expect(init[0]?.["Actual Loops"]).toBe(1);
    }));

  it("anon não chama nenhum helper; o contexto não aceita identidade como argumento", async () => {
    const r = await pool.query(
      "select p.proname,p.pronargs,p.prosecdef,p.provolatile,has_function_privilege('anon',p.oid,'execute') as anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('fn_contexto_de_leitura_inbox','fn_leitura_inbox_no_contexto') order by p.proname",
    );
    expect(r.rows).toEqual([
      {
        proname: "fn_contexto_de_leitura_inbox",
        pronargs: 0,
        prosecdef: true,
        provolatile: "s",
        anon: false,
      },
      {
        proname: "fn_leitura_inbox_no_contexto",
        pronargs: 2,
        prosecdef: false,
        provolatile: "s",
        anon: false,
      },
    ]);
  });
});
