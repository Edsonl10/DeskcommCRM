import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GOV_AGENT_A, GOV_AGENT_B, GOV_ORG, GOV_SESSION, seedGov } from "./gov-helpers";
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 2,
});
beforeAll(seedGov);
afterAll(() => pool.end());
async function ambiente(run: (db: pg.PoolClient, conv: string, contact: string) => Promise<void>) {
  const db = await pool.connect(),
    contact = randomUUID(),
    conv = randomUUID();
  try {
    await db.query("begin");
    await db.query(
      "insert into contacts (id, organization_id, display_name, tags) values ($1,$2,'Contato Kanban sintético',array['contato-global'])",
      [contact, GOV_ORG],
    );
    await db.query(
      "insert into conversations (id,organization_id,contact_id,channel_session_id,status,assigned_to_user_id,tags,metadata) values ($1,$2,$3,$4,'closed',$5,array['em andamento'],'{\"preservar\":true}')",
      [conv, GOV_ORG, contact, GOV_SESSION, GOV_AGENT_A],
    );
    await run(db, conv, contact);
  } finally {
    await db.query("rollback");
    db.release();
  }
}
async function tags(db: pg.PoolClient, conv: string) {
  return (await db.query("select tags from conversations where id=$1", [conv])).rows[0].tags;
}
async function atribuir(db: pg.PoolClient, conv: string, user: string | null) {
  await db.query(
    "update conversations set assigned_to_user_id=$2, assignee_kind=case when $2::uuid is null then null else 'user' end where id=$1",
    [conv, user],
  );
}
describe("etiquetas pertencem à conversa com o mesmo atendente", () => {
  it("A → B não herda etiquetas; retorno a cada atendente restaura somente o conjunto dele", () =>
    ambiente(async (db, conv, contact) => {
      await atribuir(db, conv, GOV_AGENT_B);
      expect(await tags(db, conv)).toEqual([]);
      await db.query("update conversations set tags=array['proposta enviada'] where id=$1", [conv]);
      await atribuir(db, conv, GOV_AGENT_A);
      expect(await tags(db, conv)).toEqual(["em andamento"]);
      await atribuir(db, conv, GOV_AGENT_B);
      expect(await tags(db, conv)).toEqual(["proposta enviada"]);
      expect(
        (
          await db.query("select metadata->'preservar' as valor from conversations where id=$1", [
            conv,
          ])
        ).rows[0].valor,
      ).toBe(true);
      expect(
        (await db.query("select tags from contacts where id=$1", [contact])).rows[0].tags,
      ).toEqual(["contato-global"]);
    }));
  it("editar sem transferir preserva etiquetas, soltar não expõe o conjunto anterior", () =>
    ambiente(async (db, conv) => {
      await db.query("update conversations set tags=array['fechado'] where id=$1", [conv]);
      await atribuir(db, conv, GOV_AGENT_A);
      expect(await tags(db, conv)).toEqual(["fechado"]);
      await atribuir(db, conv, null);
      expect(await tags(db, conv)).toEqual([]);
      await atribuir(db, conv, GOV_AGENT_A);
      expect(await tags(db, conv)).toEqual(["fechado"]);
    }));
  it("outra conversa do mesmo contato não herda; outro tenant não lê o histórico", () =>
    ambiente(async (db, conv, contact) => {
      const outra = randomUUID(),
        canal = randomUUID();
      await db.query(
        "insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values($1,$2,$3,decode('00','hex'))",
        [canal, GOV_ORG, `kanban-${canal}`],
      );
      await db.query(
        "insert into conversations(id,organization_id,contact_id,channel_session_id,channel,status,assigned_to_user_id) values($1,$2,$3,$4,'whatsapp','closed',$5)",
        [outra, GOV_ORG, contact, canal, GOV_AGENT_A],
      );
      expect(await tags(db, outra)).toEqual([]);
      await atribuir(db, conv, GOV_AGENT_B);
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: randomUUID() }),
      ]);
      expect(
        (await db.query("select metadata from conversations where id=$1", [conv])).rowCount,
      ).toBe(0);
    }));
  it("anônimo não recupera conjuntos anteriores numa atribuição posterior", () =>
    ambiente(async (db, conv, contact) => {
      await atribuir(db, conv, GOV_AGENT_B);
      await db.query("update contacts set is_anonymized=true where id=$1", [contact]);
      await atribuir(db, conv, GOV_AGENT_A);
      expect(await tags(db, conv)).toEqual([]);
      expect(
        (
          await db.query(
            "select metadata ? 'inbox_tags_por_atendente' as existe from conversations where id=$1",
            [conv],
          )
        ).rows[0].existe,
      ).toBe(false);
    }));
});
