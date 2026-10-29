import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./helpers/test";
import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
const env = credenciaisSupabaseDeTeste();
const db = createClient(env.url, env.serviceRole, { auth: { persistSession: false } });
const suffix = randomUUID().slice(0, 8),
  email = `kanban-${suffix}@invariant.test`,
  password = `Teste-${randomUUID()}!`;
const users: string[] = [],
  depts: string[] = [],
  convs: string[] = [];
let org = "",
  outraOrg = "";
async function inserir(table: string, row: Record<string, unknown>) {
  const r = await db.from(table).insert(row).select("id").single();
  if (r.error) throw r.error;
  return r.data.id as string;
}
async function atualizar(table: string, id: string, row: Record<string, unknown>) {
  const r = await db.from(table).update(row).eq("id", id);
  if (r.error) throw r.error;
}
test.beforeAll(async () => {
  org = await inserir("organizations", {
    slug: `kanban-${suffix}`,
    legal_name: "Kanban Sintético",
    display_name: "Kanban Sintético",
    onboarded_at: new Date().toISOString(),
    settings: { preservar_kanban: true },
  });
  outraOrg = await inserir("organizations", {
    slug: `kanban-isolado-${suffix}`,
    legal_name: "Outro tenant",
    display_name: "Outro tenant",
  });
  for (let i = 0; i < 2; i++) {
    const r = await db.auth.admin.createUser({
      email: i ? `kanban-b-${suffix}@invariant.test` : email,
      password,
      email_confirm: true,
      user_metadata: { full_name: i ? "Bia Kanban" : "Ana Kanban" },
    });
    if (r.error || !r.data.user) throw r.error ?? new Error("Usuário ausente");
    users.push(r.data.user.id);
    await inserir("user_organizations", {
      organization_id: org,
      user_id: users[i],
      role: i ? "agent" : "admin",
      accepted_at: new Date().toISOString(),
    });
    depts.push(
      await inserir("departments", {
        organization_id: org,
        name: i ? "Financeiro Kanban" : "Comercial Kanban",
        distribution_method: "manual",
      }),
    );
  }
  const canal = await inserir("channel_sessions", {
    organization_id: org,
    waha_session_name: `kanban-${suffix}`,
    webhook_secret_encrypted: "\\x00",
    status: "WORKING",
  });
  for (let i = 0; i < 4; i++) {
    const contact = await inserir("contacts", {
      organization_id: org,
      display_name: `Cliente Kanban ${i}`,
      force_human: true,
      tags: ["proposta enviada"],
    });
    convs.push(
      await inserir("conversations", {
        organization_id: org,
        contact_id: contact,
        channel_session_id: canal,
        assigned_department_id: depts[i === 3 ? 1 : 0],
        assigned_to_user_id: users[0],
        status: "closed",
        tags: [i === 2 ? "proposta enviada" : "em andamento"],
        unread_count_for_assignee: i === 1 ? 0 : 3,
        last_message_at: new Date(Date.now() - i * 60000).toISOString(),
      }),
    );
  }
  const outroCanal = await inserir("channel_sessions", {
    organization_id: outraOrg,
    waha_session_name: `kanban-isolado-${suffix}`,
    webhook_secret_encrypted: "\\x00",
  });
  const outroContato = await inserir("contacts", {
    organization_id: outraOrg,
    display_name: "Cliente invisível",
  });
  await inserir("conversations", {
    organization_id: outraOrg,
    contact_id: outroContato,
    channel_session_id: outroCanal,
    status: "closed",
    tags: ["em andamento"],
    unread_count_for_assignee: 9,
  });
});
test.afterAll(async () => {
  for (const id of [org, outraOrg].filter(Boolean))
    await db.from("organizations").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id);
});
test("barra filtra no banco, conta conversas e permite etiquetas e configuração por departamento", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app/);
  await page.goto("/app/inbox?filter=closed");
  const barra = page.getByRole("region", { name: "Funil de vendas", exact: true });
  const etapa = barra.locator('[data-kanban-tag="em andamento"]');
  await expect(etapa).toHaveAccessibleName("em andamento: 3 cards, 2 conversas novas");
  await page.getByRole("combobox", { name: "Departamento da barra Kanban", exact: true }).click();
  await page.getByRole("option", { name: "Comercial Kanban", exact: true }).click();
  await expect(etapa).toHaveAccessibleName("em andamento: 2 cards, 1 conversas novas");
  await etapa.click();
  await expect(page.locator("[data-conversation-id]")).toHaveCount(2);
  await expect(
    page.locator("[data-conversation-id]").filter({ hasText: "Cliente Kanban 2" }),
  ).toHaveCount(0);
  // Abrir o ícone é independente de abrir a conversa/marcar como lida.
  const linha = page
    .locator("[data-conversation-id]")
    .filter({ hasText: "Cliente Kanban 0" })
    .locator("..");
  const icone = linha.getByRole("button", {
    name: "Etiquetas Kanban — Cliente Kanban 0",
    exact: true,
  });
  const novas = await linha.getByText("3", { exact: true }).boundingBox();
  const areaIcone = await icone.boundingBox();
  expect(novas!.x + novas!.width).toBeLessThanOrEqual(areaIcone!.x);
  await icone.click();
  const menu = page.getByRole("dialog", { name: "Etiquetas da conversa", exact: true });
  await expect(menu.getByRole("checkbox", { name: "em andamento", exact: true })).toBeChecked();
  await expect(etapa).toHaveAccessibleName("em andamento: 2 cards, 1 conversas novas");
  mkdirSync("evidence/inbox-kanban", { recursive: true });
  await page.screenshot({ path: "evidence/inbox-kanban/etiquetas-sinteticas.png" });
  await menu.getByRole("checkbox", { name: "em andamento", exact: true }).uncheck();
  await menu.getByRole("checkbox", { name: "proposta enviada", exact: true }).check();
  await menu.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(menu).toBeHidden();
  await expect(etapa).toHaveAccessibleName("em andamento: 1 cards, 0 conversas novas");
  await expect(page.locator("[data-conversation-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Limpar filtro Kanban", exact: true }).click();
  await atualizar("conversations", convs[0]!, { assigned_to_user_id: users[1] });
  expect(
    (await db.from("conversations").select("tags").eq("id", convs[0]!).single()).data?.tags,
  ).toEqual([]);
  await atualizar("conversations", convs[0]!, { assigned_to_user_id: users[0] });
  expect(
    (await db.from("conversations").select("tags").eq("id", convs[0]!).single()).data?.tags,
  ).toEqual(["proposta enviada"]);
  await barra.getByRole("button", { name: "Personalizar", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Personalizar barra · Comercial Kanban",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Remover etiqueta da barra fechado", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Mover para cima proposta enviada", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Salvar para este departamento", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(barra.locator("[data-kanban-tag]")).toHaveCount(3);
  await page.reload();
  await page.getByRole("combobox", { name: "Departamento da barra Kanban", exact: true }).click();
  await page.getByRole("option", { name: "Comercial Kanban", exact: true }).click();
  await expect(barra.locator("[data-kanban-tag]")).toHaveCount(3);
  expect(
    await barra
      .locator("[data-kanban-tag]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-kanban-tag"))),
  ).toEqual(["aguardando", "proposta enviada", "em andamento"]);
  const settings = (await db.from("organizations").select("settings").eq("id", org).single()).data
    ?.settings;
  expect(settings?.preservar_kanban).toBe(true);
  await page.getByRole("combobox", { name: "Departamento da barra Kanban", exact: true }).click();
  await page.getByRole("option", { name: "Financeiro Kanban", exact: true }).click();
  await expect(barra.locator("[data-kanban-tag]")).toHaveCount(4);
  await expect(etapa).toHaveAccessibleName("em andamento: 1 cards, 1 conversas novas");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await barra.getByRole("button", { name: "Personalizar", exact: true }).click();
  const mobile = page.getByRole("dialog", {
    name: "Personalizar barra · Financeiro Kanban",
    exact: true,
  });
  await expect(
    mobile.getByRole("button", { name: "Salvar para este departamento", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: "evidence/inbox-kanban/configuracao-celular.png" });
  await mobile.getByRole("button", { name: "Cancelar", exact: true }).click();
});
