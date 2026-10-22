import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./helpers/test";
import { loginComoAdmin, lerCreds } from "./helpers/login-admin";
import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
const { url, serviceRole } = credenciaisSupabaseDeTeste();
const db = createClient(url, serviceRole, { auth: { persistSession: false } });
test("roteador salva setores sem agente e permite teste inativo", async ({ page }) => {
  test.setTimeout(180_000);
  await loginComoAdmin(page, lerCreds());
  const org = (JSON.parse(readFileSync(".e2e-creds.json", "utf8")) as { org_id: string }).org_id;
  const channel = randomUUID(),
    router = randomUUID(),
    department = randomUUID();
  const ensure = async (request: PromiseLike<{ error: unknown }>) => {
    const { error } = await request;
    if (error) throw error;
  };
  try {
    await ensure(
      db
        .from("departments")
        .insert({
          id: department,
          organization_id: org,
          name: `Equipe ${department.slice(0, 8)}`,
          distribution_method: "manual",
        } as never),
    );
    await ensure(
      db
        .from("channel_sessions")
        .insert({
          id: channel,
          organization_id: org,
          waha_session_name: `router-${channel}`,
          display_name: "Número de teste de setores",
          webhook_secret_encrypted: "\\x00",
        } as never),
    );
    await ensure(
      db
        .from("ai_routers")
        .insert({
          id: router,
          organization_id: org,
          channel_session_id: channel,
          name: "Triagem para equipes",
          is_active: false,
          config: {
            human_routing: {
              fallback_department_id: department,
              routes: [
                {
                  intent_name: "Cobrança",
                  intent_description: "Boleto existente",
                  examples: ["segunda via"],
                  department_id: department,
                },
              ],
            },
          },
        } as never),
    );
    await page.goto(`/app/ai/routers/${router}`);
    await expect(
      page.getByRole("heading", { name: "Encaminhar para setores humanos" }),
    ).toBeVisible();
    await expect(page.getByLabel("Ativo", { exact: true })).not.toBeChecked();
    await page
      .getByLabel("Quando escolher esta intenção")
      .fill("Pagamento de pedido já contratado; boletos e segunda via.");
    await page.getByRole("button", { name: "Salvar roteador", exact: true }).click();
    await expect(page.getByText("Roteador salvo.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Quando escolher esta intenção")).toHaveValue(
      "Pagamento de pedido já contratado; boletos e segunda via.",
    );
    const row = await db
      .from("ai_routers")
      .select("is_active, config, fallback_agent_id")
      .eq("id", router)
      .single();
    expect(row.error).toBeNull();
    expect(row.data?.is_active).toBe(false);
    expect(row.data?.fallback_agent_id).toBeNull();
    const before = await db
      .from("conversations")
      .select("id", { head: true, count: "exact" })
      .eq("channel_session_id", channel);
    await page.getByLabel("Mensagem de teste").fill("Preciso de segunda via do boleto");
    const response = page.waitForResponse(
      (r) => r.url().endsWith(`/routers/${router}/test`) && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Testar encaminhamento", exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(
      page.getByRole("status").filter({ hasText: `Equipe ${department.slice(0, 8)}` }),
    ).toBeVisible();
    const after = await db
      .from("conversations")
      .select("id", { head: true, count: "exact" })
      .eq("channel_session_id", channel);
    expect(after.count).toBe(before.count);
    mkdirSync("evidence/roteador-setores-humanos", { recursive: true });
    await page.screenshot({ path: "evidence/roteador-setores-humanos/editor.png", fullPage: true });
  } finally {
    await ensure(db.from("ai_routers").delete().eq("id", router));
    await ensure(db.from("channel_sessions").delete().eq("id", channel));
    await ensure(db.from("departments").delete().eq("id", department));
  }
});
