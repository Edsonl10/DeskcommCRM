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
    await insert("user_organizations", { organization_id: org, user_id: data.user.id, role: "agent", accepted_at: new Date().toISOString(), inbox_permissions: { all: false, ai: false, closed: true } });
  }
  const channel = await insert("channel_sessions", { organization_id: org, waha_session_name: `reabre-${suffix}`, status: "WORKING", webhook_secret_encrypted: "\\x00" });
  for (const [name, phone, status] of [["Reabertura Sintética", "+5511999990901", "closed"], ["Contato Ocupado Sintético", "+5511999990902", "claimed"]]) {
    const contact = await insert("contacts", { organization_id: org, display_name: name, phone_number: phone, force_human: true });
    const id = await insert("conversations", { organization_id: org, contact_id: contact, channel_session_id: channel, assigned_to_user_id: other, assigned_to_user_name: "Maria Teste", assignee_kind: "user", status, last_message_at: new Date().toISOString() });
    if (status === "closed") conversation = id; else busy = id;
  }
});
test.afterAll(async () => {
  if (org) await db.from("organizations").delete().eq("id", org);
  if (user) await db.auth.admin.deleteUser(user);
  if (other) await db.auth.admin.deleteUser(other);
});

test("criar contato oferece iniciar conversa mesmo fora dos filtros da pesquisa", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app/);
  await page.goto("/app/contacts");
  await page.getByRole("searchbox").fill("busca-sem-resultado");
  await page.getByRole("button", { name: "Novo contato", exact: true }).click();
  await page.getByRole("textbox", { name: "Nome", exact: true }).fill("Contato Novo Sintético");
  await page.getByRole("textbox", { name: "Telefone (E.164)", exact: true }).fill("+5511999990903");
  await page.getByRole("button", { name: "Criar contato", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Contato criado", exact: true });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("Contato Novo Sintético");
  const { data: contacts, error } = await db.from("contacts").select("id").eq("organization_id", org).eq("phone_number", "+5511999990903");
  if (error) throw error;
  expect(contacts).toHaveLength(1);
  const contactId = contacts![0]!.id;
  const { count } = await db.from("conversations").select("id", { count: "exact", head: true }).eq("contact_id", contactId);
  expect(count).toBe(0);
  fs.mkdirSync("evidence/conversa-apos-cadastro", { recursive: true });
  await page.screenshot({ path: "evidence/conversa-apos-cadastro/opcao-apos-salvar.png", fullPage: true });
  await confirmation.getByRole("button", { name: "Iniciar conversa", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/inbox\?id=/);
  await expect(page.getByRole("heading", { name: "Contato Novo Sintético", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toBeVisible();
  const conversationId = new URL(page.url()).searchParams.get("id");
  const { data: saved } = await db.from("conversations").select("contact_id,assigned_to_user_id,human_accepted_at").eq("id", conversationId).single();
  expect(saved?.contact_id).toBe(contactId);
  expect(saved?.assigned_to_user_id).toBe(user);
  expect(saved?.human_accepted_at).toBeTruthy();
  const { count: messages } = await db.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId);
  expect(messages).toBe(0);
  await page.screenshot({ path: "evidence/conversa-apos-cadastro/conversa-aberta.png", fullPage: true });
});
test("atendente reabre e assume; contato ocupado avisa sem trocar dono", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app/);
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
