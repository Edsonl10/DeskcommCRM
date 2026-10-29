import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./helpers/test";
import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";

const env = credenciaisSupabaseDeTeste();
const db = createClient(env.url, env.serviceRole, { auth: { persistSession: false } });
const suffix = randomUUID().slice(0, 8);
const email = `filtros-${suffix}@invariant.test`,
  password = `Teste-${randomUUID()}!`;
let org = "";
const users: string[] = [],
  depts: string[] = [],
  channels: string[] = [];
async function insert(table: string, row: Record<string, unknown>) {
  const { data, error } = await db.from(table).insert(row).select("id").single();
  if (error) throw error;
  return data.id as string;
}
test.beforeAll(async () => {
  org = await insert("organizations", {
    slug: `filtros-${suffix}`,
    legal_name: "Teste Filtros",
    display_name: "Teste Filtros",
    onboarded_at: new Date().toISOString(),
  });
  for (let i = 0; i < 2; i++) {
    const { data, error } = await db.auth.admin.createUser({
      email: i ? `filtros-outro-${suffix}@invariant.test` : email,
      password,
      email_confirm: true,
      user_metadata: { full_name: i ? "Bia Filtros" : "Ana Filtros" },
    });
    if (error || !data.user) throw error ?? new Error("Usuário ausente");
    users.push(data.user.id);
    await insert("user_organizations", {
      organization_id: org,
      user_id: data.user.id,
      role: i ? "agent" : "admin",
      accepted_at: new Date().toISOString(),
    });
    depts.push(
      await insert("departments", {
        organization_id: org,
        name: i ? "Comercial Filtros" : "Financeiro Filtros",
        color: "#008800",
        distribution_method: "manual",
      }),
    );
    channels.push(
      await insert("channel_sessions", {
        organization_id: org,
        display_name: i ? "Canal secundário" : "Canal principal",
        waha_session_name: `filtros-${suffix}-${i}`,
        status: "WORKING",
        webhook_secret_encrypted: "\\x00",
      }),
    );
  }
  // Só as duas primeiras atendem ao conjunto; cada outra difere em um filtro.
  for (let i = 0; i < 5; i++) {
    const contact = await insert("contacts", {
      organization_id: org,
      display_name: `Conversa Filtros ${i}`,
      force_human: true,
      tags: i === 4 ? ["outro"] : ["vip"],
    });
    await insert("conversations", {
      organization_id: org,
      contact_id: contact,
      channel_session_id: channels[i === 2 ? 1 : 0],
      assigned_department_id: depts[i === 1 ? 1 : 0],
      assigned_to_user_id: users[i === 1 ? 1 : 0],
      status: "closed",
      last_message_at: i === 3 ? "2026-10-23T12:00:00Z" : "2026-10-22T12:00:00Z",
      unread_count_for_assignee: 1,
    });
  }
});
test.afterAll(async () => {
  if (org) await db.from("organizations").delete().eq("id", org);
  for (const user of users) await db.auth.admin.deleteUser(user);
});

test("funil combina filtros no banco e nas contagens, limpa e cabe no celular", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app/);
  await page.goto("/app/inbox?filter=closed");
  await expect(page.getByRole("tab", { name: /^Fechadas/ })).toHaveText(/5/);
  await expect(page.getByRole("button", { name: "Filtrar por tag", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Grupos", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Filtros de conversas", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Filtros", exact: true });
  for (const nome of [
    "Financeiro Filtros",
    "Comercial Filtros",
    "Ana Filtros",
    "Bia Filtros",
    "vip",
  ])
    await dialog.getByRole("button", { name: nome, exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Mensagens não lidas", exact: true }).check();
  await dialog.getByRole("combobox", { name: "Instância", exact: true }).click();
  await page.getByRole("option", { name: "Canal principal", exact: true }).click();
  await dialog.getByLabel("Data inicial", { exact: true }).fill("2026-10-22");
  await dialog.getByLabel("Data final", { exact: true }).fill("2026-10-22");
  await expect(page.locator('[role="tab"][data-state="active"]')).toHaveText(/5/);
  mkdirSync("evidence/inbox-filtros-avancados", { recursive: true });
  await page.screenshot({ path: "evidence/inbox-filtros-avancados/desktop.png", fullPage: true });
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/v1/conversations?") &&
      r.url().includes("department_ids=") &&
      r.status() === 200,
  );
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  const body = await (await response).json();
  expect(body.data).toHaveLength(2);
  await expect(page.getByRole("tab", { name: /^Fechadas/ })).toHaveText(/2/);
  for (let i = 0; i < 5; i++)
    await expect(
      page.locator("[data-conversation-id]").filter({ hasText: `Conversa Filtros ${i}` }),
    ).toHaveCount(i < 2 ? 1 : 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Filtros de conversas", exact: true }).click();
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await expect(dialog.getByRole("button", { name: "Salvar", exact: true })).toBeInViewport();
  await page.screenshot({ path: "evidence/inbox-filtros-avancados/mobile.png", fullPage: true });
  await dialog.getByRole("button", { name: "Limpar", exact: true }).click();
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("tab", { name: /^Fechadas/ })).toHaveText(/5/);
  await expect(page.getByRole("tab", { name: /^Fechadas/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Filtros de conversas", exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Apenas grupos", exact: true }).check();
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(page.getByRole("tab", { name: /^Fechadas/ })).toHaveText(/5/);
  // Entradas inválidas são recusadas nas duas portas; filtro não amplia permissões.
  for (const path of ["conversations", "conversations/counts"]) {
    const invalid = await page.request.get(`/api/v1/${path}?department_ids=incorreto`);
    expect(invalid.status()).toBe(422);
  }
});
