import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "./helpers/test";
import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { BLOCOS_DO_PAINEL } from "../../lib/inbox/painel-do-cliente";

const env = credenciaisSupabaseDeTeste();
const db = createClient(env.url, env.serviceRole, { auth: { persistSession: false } });
const suffix = randomUUID().slice(0, 8);
const password = `Teste-${randomUUID()}!`;
const pessoas: Record<string, { id: string; email: string }> = {};
let org = "",
  outraOrg = "",
  contato = "",
  conversa = "";
async function insert(table: string, row: Record<string, unknown>) {
  const { data, error } = await db.from(table).insert(row).select("id").single();
  if (error) throw error;
  return data.id as string;
}
async function login(page: Page, role: string) {
  await page.goto("/login");
  await page.locator("#email").fill(pessoas[role]!.email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });
}
test.beforeAll(async () => {
  org = await insert("organizations", {
    slug: `painel-${suffix}`,
    legal_name: "Equipe de Teste",
    display_name: "Equipe de Teste",
    onboarded_at: new Date().toISOString(),
    settings: { crm: { cliente_pela_agenda: false }, teste_preservado: true },
  });
  outraOrg = await insert("organizations", {
    slug: `painel-outra-${suffix}`,
    legal_name: "Outra Equipe",
    display_name: "Outra Equipe",
    onboarded_at: new Date().toISOString(),
    settings: { teste_isolamento: true },
  });
  for (const role of ["admin", "agent", "viewer", "outro"]) {
    const email = `painel-${role}-${suffix}@invariant.test`;
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Pessoa Teste ${role}` },
    });
    if (error || !data.user) throw error ?? new Error("Usuário ausente");
    pessoas[role] = { id: data.user.id, email };
    await insert("user_organizations", {
      organization_id: role === "outro" ? outraOrg : org,
      user_id: data.user.id,
      role: role === "outro" ? "admin" : role,
      accepted_at: new Date().toISOString(),
    });
  }
  const channel = await insert("channel_sessions", {
    organization_id: org,
    waha_session_name: `painel-${suffix}`,
    status: "WORKING",
    webhook_secret_encrypted: "\\x00",
  });
  contato = await insert("contacts", {
    organization_id: org,
    name: "Cliente de Teste",
    display_name: "Nome do Canal",
    phone_number: "+5511999990981",
    force_human: true,
    custom_fields: { endereco: "Endereço de teste" },
  });
  conversa = await insert("conversations", {
    organization_id: org,
    contact_id: contato,
    channel_session_id: channel,
    status: "claimed",
    assigned_to_user_id: pessoas.admin!.id,
    assignee_kind: "user",
    last_message_at: new Date().toISOString(),
  });
  fs.mkdirSync("evidence/cliente-painel", { recursive: true });
});
test.afterAll(async () => {
  if (org) await db.from("organizations").delete().eq("id", org);
  if (outraOrg) await db.from("organizations").delete().eq("id", outraOrg);
  for (const pessoa of Object.values(pessoas)) await db.auth.admin.deleteUser(pessoa.id);
});

test("nome e resumo editados nas telas persistem; administrador organiza para a equipe", async ({
  page,
  browser,
}) => {
  await login(page, "admin");
  await page.goto(`/app/inbox?id=${conversa}&filter=all`);
  const painel = page.getByTestId("painel-cliente");
  await expect(painel.getByRole("button", { name: "Configurar painel", exact: true })).toBeEnabled({
    timeout: 20_000,
  });
  // As duas portas no Inbox: cabeçalho e ficha lateral.
  await page.getByRole("button", { name: "Editar nome do contato", exact: true }).first().click();
  await page
    .getByRole("textbox", { name: "Nome do contato", exact: true })
    .fill("Nome pelo Cabeçalho");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(painel.getByText("Nome pelo Cabeçalho", { exact: true })).toBeVisible();
  await painel.getByRole("button", { name: "Editar nome do contato", exact: true }).click();
  await painel
    .getByRole("textbox", { name: "Nome do contato", exact: true })
    .fill("Nome pela Ficha");
  await painel.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nome pela Ficha", exact: true })).toBeVisible();
  await painel.getByRole("button", { name: "Editar Sobre o Cliente", exact: true }).click();
  await painel
    .getByRole("textbox", { name: "Sobre o Cliente", exact: true })
    .fill("Prefere propostas detalhadas.\nCliente recorrente.");
  await painel.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(painel.getByText("Cliente recorrente.", { exact: false })).toBeVisible();

  await painel.getByRole("button", { name: "Configurar painel", exact: true }).click();
  const dialog = page.getByRole("dialog");
  // Drag real; não é gravação por API disfarçada de teste visual.
  await dialog
    .locator('[data-bloco-ordem="pedidos"]')
    .dragTo(dialog.locator('[data-bloco-ordem="contato"]'));
  await expect(dialog.locator("[data-bloco-ordem]").first()).toHaveAttribute(
    "data-bloco-ordem",
    "pedidos",
  );
  await page.screenshot({ path: "evidence/cliente-painel/configuracao.png" });
  await dialog.getByRole("button", { name: "Salvar padrão da equipe", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(painel.locator("[data-painel-bloco]").first()).toHaveAttribute(
    "data-painel-bloco",
    "pedidos",
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Nome pela Ficha", exact: true })).toBeVisible();
  await expect(painel.locator("[data-painel-bloco]").first()).toHaveAttribute(
    "data-painel-bloco",
    "pedidos",
  );
  await page.screenshot({ path: "evidence/cliente-painel/inbox.png" });

  await page.goto(`/app/contacts/${contato}`);
  await expect(page.getByText("Cliente recorrente.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Editar nome do contato", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nome do contato", exact: true })
    .fill("Nome no Cadastro");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nome no Cadastro", exact: true })).toBeVisible();
  await page.screenshot({ path: "evidence/cliente-painel/cadastro.png", fullPage: true });

  const context = await browser.newContext();
  const atendente = await context.newPage();
  await login(atendente, "agent");
  await atendente.goto(`/app/contacts/${contato}`);
  await expect(
    atendente.getByRole("heading", { name: "Nome no Cadastro", exact: true }),
  ).toBeVisible();
  await expect(atendente.getByText("Cliente recorrente.", { exact: false })).toBeVisible();
  const config = await atendente.request.get("/api/v1/settings/painel-cliente");
  expect((await config.json()).data.ordem[0]).toBe("pedidos");
  expect(
    (
      await atendente.request.patch("/api/v1/settings/painel-cliente", {
        data: { ordem: BLOCOS_DO_PAINEL },
      })
    ).status(),
  ).toBe(403);
  await context.close();
  const { data } = await db
    .from("contacts")
    .select("custom_fields, display_name")
    .eq("id", contato)
    .single();
  expect(data?.custom_fields.endereco).toBe("Endereço de teste");
  expect(data?.display_name).toBe("Nome do Canal");
  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", org).single();
  expect(orgRow?.settings.teste_preservado).toBe(true);
});

test("somente leitura, isolamento entre organizações e restauração do padrão", async ({
  page,
  browser,
}) => {
  await login(page, "viewer");
  await page.goto(`/app/contacts/${contato}`);
  await expect(
    page.getByRole("button", { name: "Editar nome do contato", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Editar Sobre o Cliente", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.patch(`/api/v1/contacts/${contato}`, { data: { name: "Não autorizado" } })
    ).status(),
  ).toBe(403);
  const context = await browser.newContext();
  const outro = await context.newPage();
  await login(outro, "outro");
  const config = await outro.request.get("/api/v1/settings/painel-cliente");
  expect((await config.json()).data.ordem).toEqual(BLOCOS_DO_PAINEL);
  expect((await outro.request.get(`/api/v1/contacts/${contato}`)).status()).toBe(404);
  await context.close();

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await login(admin, "admin");
  await admin.goto(`/app/inbox?id=${conversa}&filter=all`);
  const painel = admin.getByTestId("painel-cliente");
  await painel.getByRole("button", { name: "Configurar painel", exact: true }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByRole("button", { name: "Restaurar ordem original", exact: true }).click();
  await dialog.getByRole("button", { name: "Salvar padrão da equipe", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(painel.locator("[data-painel-bloco]").first()).toHaveAttribute(
    "data-painel-bloco",
    "contato",
  );
  await adminContext.close();
});
