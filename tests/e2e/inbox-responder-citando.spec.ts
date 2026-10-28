import { randomInt, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "./helpers/test";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";

/**
 * RESPONDER "EM CIMA" DE UMA MENSAGEM — pela tela, como o atendente faz.
 *
 * O canal intermediado aceita citação (`replyTo`, recebendo o `wamid`), e o
 * WhatsApp mostra a resposta pendurada na original. Todo o caminho novo é
 * VISUAL — escolher a mensagem, ver a faixa, cancelar, enviar — e nada disso é
 * alcançável por teste de unidade: eles provam que a função existe, não que dá
 * para clicá-la.
 *
 * ─── O que este arquivo cobre, e por que cada caso ──────────────────────────
 *
 * 1. o botão APARECE (é `opacity-0` até o hover; um `hidden` teria feito o
 *    layout pular, e um seletor que só olha o DOM passaria mesmo invisível);
 * 2. escolher mostra a faixa com o trecho citado;
 * 3. o `×` desfaz — sem saída, quem clica por engano fica preso citando;
 * 4. trocar de conversa LIMPA a citação. Este é o caso que mais importa: sem
 *    ele, a resposta sairia citando a mensagem de OUTRO cliente.
 *
 * Não cobre o que sai na rede: se o `replyTo` chegou ao provider é assunto do
 * adapter, e o teste de tela não deve fingir que mede isso.
 */

interface E2ECreds {
  password: string;
  users: Record<string, { id: string; email: string; role: string }>;
}

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as E2ECreds;
const EVIDENCE = path.join(process.cwd(), "evidence");

/**
 * Login simples — e por isso o usuário é o `agent`, nunca o `admin`.
 *
 * `admin` tem MFA obrigatório (doutrina de Auth), então o login dele para em
 * `/login/mfa` e este `waitForURL` nunca resolve. O repo tem um helper próprio
 * para esse caso (`helpers/login-admin.ts`), e ele existe justamente porque a
 * armadilha já pegou gente antes. As demais specs de inbox usam `agent`, que
 * tem o acesso que estes casos precisam.
 */
async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app\//);
}

/**
 * ─── POR QUE ESTE ARQUIVO SEMEIA O PRÓPRIO DADO (issue #1318) ───────────────
 *
 * Os dois casos abaixo saíam como **skip** no CI, e verde por skip é o pior
 * estado que existe: a lista de checks fica toda em ordem e a cobertura é
 * zero. O helper antigo perguntava ao ambiente "existe alguma conversa com
 * mensagens?" e pulava quando não existia — e o ambiente do CI nunca semeou
 * nenhuma, então a feature de responder citando não era medida por ninguém.
 *
 * Pior: a pergunta era feita por APARÊNCIA (`[class*='rounded-2xl']`), então o
 * painel flutuante, que fica no DOM mesmo fechado, respondia "sim" por meses —
 * o caso não pulava, morria em 30s no hover de um elemento escondido. Tirar o
 * painel (#963) não consertou o vermelho: trocou o disfarce dele por silêncio.
 *
 * Agora o dado é DESTE arquivo: duas conversas com mensagens de entrada, na
 * organização do próprio usuário de teste, criadas no `beforeAll` e apagadas no
 * `afterAll`. Se a semeadura falhar, os casos FALHAM — trocar "skip" por "verde
 * que não mediu nada" seria a mesma doença com outro nome.
 *
 * E a bolha passa a ser achada por `data-testid="message-bubble"`: identidade,
 * não aparência. Enquanto o seletor fosse uma classe utilitária, qualquer
 * componente novo com ela voltava a mentir.
 */

const credenciais = credenciaisSupabaseDeTeste();
const db = createClient(credenciais.url, credenciais.serviceRole, {
  auth: { persistSession: false },
});

const SUFIXO = randomUUID().slice(0, 8);
/** As duas conversas semeadas: a primeira é onde se cita, a segunda é a troca. */
const conversas: string[] = [];
const contatos: string[] = [];
let canal = "";
let orgId = "";
let autoraId = "";
let originalAtendente = "";
let originalCliente = "";

async function insere(tabela: string, valores: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.from(tabela).insert(valores).select("id").single();
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return (data as { id: string }).id;
}

/** Uma conversa com uma mensagem de entrada — o que a citação precisa existir. */
async function conversaComMensagem(nome: string, texto: string): Promise<string> {
  const contato = await insere("contacts", {
    organization_id: orgId,
    name: nome,
    phone_number: `+5511${randomInt(100000000, 1000000000)}`,
  });
  const conversa = await insere("conversations", {
    organization_id: orgId,
    contact_id: contato,
    channel_session_id: canal,
    status: "open",
    last_message_at: new Date().toISOString(),
  });
  await insere("messages", {
    organization_id: orgId,
    contact_id: contato,
    conversation_id: conversa,
    channel_session_id: canal,
    direction: "inbound",
    type: "text",
    status: "received",
    body: texto,
    sent_at: new Date().toISOString(),
    external_id: `citacao-${SUFIXO}-${randomUUID()}`,
  });
  const { error: acceptedError } = await db.rpc("fn_conversation_assign", {
    p_organization_id: orgId, p_conversation_id: conversa, p_to_user_id: creds.users.agent!.id, p_reason: "claim",
  });
  if (acceptedError) throw acceptedError;
  contatos.push(contato);
  conversas.push(conversa);
  return conversa;
}

/**
 * Abre UMA conversa pelo id — não "a primeira da lista".
 *
 * `/app/inbox/<id>` redireciona para `/app/inbox?id=<id>`; esperar a URL final
 * é o que torna determinístico. Depender da ordem da lista faria este arquivo
 * medir a conversa que outra spec semeou primeiro.
 */
async function abrirConversa(page: Page, conversaId: string): Promise<void> {
  await page.goto(`/app/inbox/${conversaId}`);
  await page.waitForURL(new RegExp(`/app/inbox\\?id=${conversaId}`), { timeout: 60_000 });
  await expect(
    bolhas(page).first(),
    "a conversa semeada abriu sem nenhuma bolha de mensagem — a semeadura falhou",
  ).toBeVisible({ timeout: 30_000 });
}

/** A bolha por IDENTIDADE (`data-testid`), nunca por classe de aparência. */
const bolhas = (page: Page) => page.getByTestId("message-bubble");

test.beforeAll(async () => {
  // A organização é a do próprio usuário de teste: conversa semeada noutra org
  // não apareceria para ele, e o caso falharia por RLS parecendo defeito de tela.
  const { data, error } = await db
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", creds.users.agent!.id)
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error(`organização do agente: ${error?.message ?? "não achei"}`);
  orgId = (data as { organization_id: string }).organization_id;

  canal = await insere("channel_sessions", {
    organization_id: orgId,
    waha_session_name: `citacao-${SUFIXO}`,
    display_name: `Canal citação ${SUFIXO}`,
    status: "WORKING",
    webhook_secret_encrypted: "\\x00",
  });
  await conversaComMensagem(`Cliente citação A ${SUFIXO}`, `Bom dia, queria saber do orçamento ${SUFIXO}`);
  await conversaComMensagem(`Cliente citação B ${SUFIXO}`, `Olá, é sobre outro assunto ${SUFIXO}`);

  const { data: autora, error: erroAutora } = await db.auth.admin.createUser({
    email: `citacao-${SUFIXO}@example.test`, password: creds.password, email_confirm: true,
    user_metadata: { full_name: "Maria Teste" },
  });
  if (erroAutora || !autora.user) throw erroAutora ?? new Error("sem autora");
  autoraId = autora.user.id;
  const { error: erroVinculo } = await db.from("user_organizations").insert({
    organization_id: orgId, user_id: autoraId, role: "agent",
  });
  if (erroVinculo) throw erroVinculo;
  const c = await conversaComMensagem(`Cliente histórico ${SUFIXO}`, "Início do histórico");
  const contato = contatos.at(-1)!;
  const base = { organization_id: orgId, contact_id: contato, conversation_id: c,
    channel_session_id: canal, type: "text", status: "sent", sent_via: "user" };
  const inicio = Date.now() - 120_000;
  originalAtendente = await insere("messages", { ...base, direction: "outbound",
    body: "Proposta original da Maria", sent_by_user_id: autoraId,
    sent_at: new Date(inicio).toISOString() });
  originalCliente = await insere("messages", { ...base, direction: "inbound",
    body: "Pedido original do cliente", sent_at: new Date(inicio + 1000).toISOString() });
  const { error: erroMiolo } = await db.from("messages").insert(Array.from({ length: 65 }, (_, i) => ({
    ...base, direction: "inbound", body: `Histórico ${i + 1}`,
    sent_at: new Date(inicio + (i + 2) * 1000).toISOString(),
  })));
  if (erroMiolo) throw erroMiolo;
  await insere("messages", { ...base, direction: "inbound", body: "Cliente citou a proposta",
    reply_to_message_id: originalAtendente, sent_at: new Date(inicio + 70_000).toISOString() });
  await insere("messages", { ...base, direction: "outbound", body: "Atendente citou o pedido",
    sent_by_user_id: creds.users.agent!.id,
    reply_to_message_id: originalCliente, sent_at: new Date(inicio + 71_000).toISOString() });
  for (const userId of [autoraId, creds.users.agent!.id]) {
    const { error: erroTransferencia } = await db.rpc("fn_conversation_assign", {
      p_organization_id: orgId, p_conversation_id: c, p_to_user_id: userId, p_reason: "transfer",
    });
    if (erroTransferencia) throw erroTransferencia;
  }

});

test.afterAll(async () => {
  if (conversas.length) await db.from("conversations").delete().in("id", conversas);
  if (contatos.length) await db.from("contacts").delete().in("id", contatos);
  if (canal) await db.from("channel_sessions").delete().eq("id", canal);
  if (autoraId) {
    await db.from("user_organizations").delete().eq("user_id", autoraId).eq("organization_id", orgId);
    await db.auth.admin.deleteUser(autoraId);
  }
});

test.describe("responder citando", () => {
  test("abre o histórico extenso nas últimas mensagens e respeita quem sobe", async ({ page }) => {
    await login(page, creds.users.agent!.email);
    await abrirConversa(page, conversas[2]!);
    const fio = page.getByTestId("chat-thread-scroller");
    await expect(fio.getByText("Atendente citou o pedido", { exact: true })).toBeVisible();
    const distanciaDoFim = () => fio.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
    await expect.poll(distanciaDoFim).toBeLessThanOrEqual(2);

    await fio.evaluate((el) => { el.scrollTop = 0; });
    await fio.getByRole("button", { name: "Carregar mais antigas" }).click();
    await expect(fio.getByText("Proposta original da Maria", { exact: true })).toBeVisible();
    expect(await distanciaDoFim()).toBeGreaterThan(120);

    await abrirConversa(page, conversas[0]!);
    await abrirConversa(page, conversas[2]!);
    await expect.poll(distanciaDoFim).toBeLessThanOrEqual(2);
  });

  test("citações do cliente e atendente abrem o histórico antigo e preservam autoria após transferência", async ({ page }) => {
    await login(page, creds.users.agent!.email);
    await abrirConversa(page, conversas[2]!);
    const respostaCliente = bolhas(page).filter({ hasText: "Cliente citou a proposta" });
    await respostaCliente.getByRole("button", { name: "Ir para a mensagem citada" }).click();
    const original = page.locator(`[data-message-id="${originalAtendente}"]`);
    await expect(original).toHaveAttribute("data-message-highlighted", "true");
    await expect(original).toBeInViewport();
    await expect(original.getByText("Maria Teste", { exact: true })).toBeVisible();
    await expect(respostaCliente.getByRole("button", { name: "Ir para a mensagem citada" }))
      .toContainText("Maria Teste");
    const pasta = path.join(EVIDENCE, "autoria-e-citacoes");
    fs.mkdirSync(pasta, { recursive: true });
    await page.screenshot({ path: path.join(pasta, "autora-apos-transferencia.png"), fullPage: false });

    const respostaAtendente = bolhas(page).filter({ hasText: "Atendente citou o pedido" });
    await respostaAtendente.getByRole("button", { name: "Ir para a mensagem citada" }).click();
    const pedido = page.locator(`[data-message-id="${originalCliente}"]`);
    await expect(pedido).toHaveAttribute("data-message-highlighted", "true");
    await expect(pedido).toBeInViewport();
    await expect(pedido).toContainText("Pedido original do cliente");
    await page.screenshot({ path: path.join(pasta, "citacao-do-atendente.png"), fullPage: false });
  });

  test("o botão de responder revela a faixa, e o × a desfaz", async ({ page }) => {
    await login(page, creds.users.agent!.email);
    await abrirConversa(page, conversas[0]!);

    // Desde o #1626 responder é um item do menu da mensagem. O gatilho vive em
    // `opacity-0` até o hover. `toBeVisible` do Playwright considera opacidade 0
    // como visível, então o hover é o que prova de verdade que ele é alcançável
    // — e o clique, que é clicável.
    const opcoes = bolhas(page).first().getByRole("button", { name: /Opções da mensagem/i });
    await bolhas(page).first().hover();
    await expect(opcoes).toBeVisible();
    await opcoes.click();
    const responder = page.getByRole("menuitem", { name: /Responder a esta mensagem/i });
    await expect(responder).toBeVisible();
    await responder.click();

    // A faixa aparece acima do campo, com o botão de cancelar.
    const cancelar = page.getByRole("button", { name: /Cancelar resposta/i });
    await expect(cancelar).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE, "responder-citando-faixa.png"),
      fullPage: false,
    });

    await cancelar.click();
    await expect(cancelar).toHaveCount(0);
  });

  test("trocar de conversa LIMPA a citação", async ({ page }) => {
    // Sem isto a resposta sairia citando a mensagem de outro cliente — o pior
    // desfecho possível desta feature, e invisível até acontecer com alguém.
    await login(page, creds.users.agent!.email);
    await abrirConversa(page, conversas[0]!);

    await bolhas(page).first().hover();
    await bolhas(page).first().getByRole("button", { name: /Opções da mensagem/i }).click();
    await page.getByRole("menuitem", { name: /Responder a esta mensagem/i }).click();
    await expect(page.getByRole("button", { name: /Cancelar resposta/i })).toBeVisible();

    // Entra em OUTRA conversa semeada — pelo id, não pela lista: "a segunda da
    // lista" depende de quem semeou por último e faria este caso medir outra
    // coisa em cada rodada.
    await abrirConversa(page, conversas[1]!);

    await expect(
      page.getByRole("button", { name: /Cancelar resposta/i }),
      "a citação sobreviveu à troca de conversa",
    ).toHaveCount(0);
  });
});
