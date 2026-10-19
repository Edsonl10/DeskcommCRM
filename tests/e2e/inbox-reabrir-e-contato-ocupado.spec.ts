import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./helpers/test";
import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
const env = credenciaisSupabaseDeTeste();
const db = createClient(env.url, env.serviceRole, { auth: { persistSession: false } });
const suffix = randomUUID().slice(0, 8);
const email = `reabre-${suffix}@invariant.test`, password = `Teste-${randomUUID()}!`;
let org = "", user = "", other = "", conversation = "", busy = "";
async function insert(table: string, row: Record<string, unknown>) {
  const { data, error } = await db.from(table).insert(row).select("id").single();
  if (error) throw error;
  return data.id as string;
}
test.beforeAll(async () => {
  org = await insert("organizations", { slug: `reabre-${suffix}`, legal_name: "Teste Reabertura", display_name: "Teste Reabertura", onboarded_at: new Date().toISOString() });
  for (const [mail, name] of [[email, "Ana Teste"], [`outro-${suffix}@invariant.test`, "Maria Teste"]]) {
    const { data, error } = await db.auth.admin.createUser({ email: mail, password, email_confirm: true, user_metadata: { full_name: name } });
    if (error || !data.user) throw error ?? new Error("Usuário ausente");
    if (mail === email) user = data.user.id; else other = data.user.id;
    await insert("user_organizations", { organization_id: org, user_id: data.user.id, role: "agent", accepted_at: new Date().toISOString(), inbox_permissions: { all: true, ai: false, closed: true } });
  }
  const channel = await insert("channel_sessions", { organization_id: org, waha_session_name: `reabre-${suffix}`, status: "WORKING", webhook_secret_encrypted: "\\x00" });
  for (const [name, phone, status] of [["Reabertura Sintética", "+5511999990901", "closed"], ["Contato Ocupado Sintético", "+5511999990902", "claimed"], ["Direcionamento Sintético", "+5511999990903", "open"]]) {
    const contact = await insert("contacts", { organization_id: org, display_name: name, phone_number: phone, force_human: true });
    const id = await insert("conversations", { organization_id: org, contact_id: contact, channel_session_id: channel, assigned_to_user_id: status === "open" ? user : other, assigned_to_user_name: status === "open" ? "Ana Teste" : "Maria Teste", assignee_kind: "user", status, last_message_at: new Date().toISOString() });
    if (status === "closed") conversation = id; else if (status === "claimed") busy = id;
  }
});
test.afterAll(async () => {
  if (org) await db.from("organizations").delete().eq("id", org);
  if (user) await db.auth.admin.deleteUser(user);
  if (other) await db.auth.admin.deleteUser(other);
});
test("atendente reabre e assume; contato ocupado avisa sem trocar dono", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app/);
  await page.goto("/app/inbox?filter=all");
  const waitingRow = page.locator("[data-conversation-id]").filter({ hasText: "Direcionamento Sintético" });
  await expect(waitingRow.getByLabel("Responsável: Ana Teste", { exact: true })).toBeVisible();
  await expect(waitingRow.getByRole("img", { name: "Aguardando atendente", exact: true })).toBeVisible();
  await waitingRow.click();
  await expect(page.getByRole("button", { name: "Assumir", exact: true })).toBeVisible();
  fs.mkdirSync("evidence/reabertura-contato-ocupado", { recursive: true });
  await page.screenshot({ path: "evidence/reabertura-contato-ocupado/responsavel-aguardando-aceite.png", fullPage: true });
  await page.goto(`/app/inbox?id=${conversation}&filter=closed`);
  const reopen = page.getByRole("button", { name: "Reabrir", exact: true });
  await expect(reopen).toBeVisible();
  const response = page.waitForResponse(r => r.url().includes(`/${conversation}/reopen`) && r.request().method() === "POST");
  await reopen.click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole("button", { name: "Fechar", exact: true })).toBeVisible();
  const { data: reopened, error } = await db.from("conversations").select("assigned_to_user_id,human_accepted_at").eq("id", conversation).single();
  if (error) throw error;
  expect(reopened.assigned_to_user_id).toBe(user);
  expect(reopened.human_accepted_at).toBeTruthy();
  fs.mkdirSync("evidence/reabertura-contato-ocupado", { recursive: true });
  await page.screenshot({ path: "evidence/reabertura-contato-ocupado/reabriu-e-assumiu.png", fullPage: true });
  await page.goto("/app/contacts");
  const start = page.getByRole("button", { name: /(?:Iniciar|Abrir) conversa com Contato Ocupado Sintético no Inbox/ });
  await expect(start).toBeVisible();
  await start.click();
  await expect(page.getByText("Este contato já está em atendimento com Maria Teste.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/contacts/);
  const { data: unchanged } = await db.from("conversations").select("assigned_to_user_id").eq("id", busy).single();
  expect(unchanged?.assigned_to_user_id).toBe(other);
  await page.screenshot({ path: "evidence/reabertura-contato-ocupado/aviso-do-responsavel.png", fullPage: true });
});
