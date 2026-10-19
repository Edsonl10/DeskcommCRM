"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";

import type { Locale } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { format, isToday, isYesterday } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageBubble } from "./MessageBubble";
import { NoteCard } from "./NoteCard";
import { PassagemCard } from "./PassagemCard";
import { useMessagesRealtime } from "@/hooks/inbox/useMessagesRealtime";
import { useConversationNotes } from "@/hooks/inbox/useConversationNotes";
import { usePassagensDaConversa } from "@/hooks/inbox/usePassagensDaConversa";
import { useClaimConversation } from "@/hooks/inbox/useClaimConversation";
import { useDeleteNote } from "@/hooks/inbox/useDeleteNote";
import { useAlterarMensagem } from "@/hooks/inbox/useAlterarMensagem";
import { useDebugToggle } from "@/hooks/ai/useDebugToggle";
import { useActiveOrg, useUser } from "@/hooks/auth/AuthProvider";
import { ROLE_RANK } from "@/lib/auth/types";
import { capabilitiesOf, transportaMensagem, type ChannelProvider } from "@/lib/channels/capabilities";
import { montarCartoesDaPassagem, type CartaoDaPassagem } from "@/lib/escalacao/cartao-da-passagem";
import type { Message, Note } from "@/lib/types/messaging";

interface Props {
  conversationId: string | null;
  searchTerm?: string;
  provider?: string | null;
  /** Escolher uma mensagem para responder. Sobe até o composer. */
  onResponder?: (m: Message) => void;
  /**
   * Quem é o dono da conversa HOJE, e quem é o contato.
   *
   * O cartão da passagem precisa dos dois para escolher o gesto: sem dono ele
   * convida a assumir; com outro dono ele diz quem atende (oferecer "assumir"
   * ali seria oferecer um gesto que a rota recusa); e o caminho de opt-out leva
   * à ficha do contato, que é onde mora o bloqueio.
   *
   * Opcional para o fio continuar renderizável sem a conversa em mãos — o
   * cartão então cai no estado mais conservador (nenhum convite).
   */
  dono?: { userId: string | null; nome: string | null; aceito?: boolean } | null;
  contatoId?: string | null;
}

/**
 * Onda 5.2: union de item do thread — mensagem real ou nota interna (nunca vai
 * ao cliente). A passagem é o TERCEIRO tipo: também não é mensagem, também não
 * vai ao cliente, e entra no fio pelo mesmo mecanismo.
 */
export type ThreadItem =
  | { kind: "message"; ts: string; data: Message }
  | { kind: "note"; ts: string; data: Note }
  | { kind: "passagem"; ts: string; data: CartaoDaPassagem };

/** Intercala mensagens, notas e passagens por timestamp asc (puro, sem I/O — testado em thread-merge.test.ts). */
export function mergeThreadItems(
  messages: Message[],
  notes: Note[],
  // Opcional porque o fio existe desde antes da passagem, e uma conversa que
  // nunca saiu do automático não tem nenhuma.
  passagens: CartaoDaPassagem[] = [],
): ThreadItem[] {
  const items: ThreadItem[] = [
    ...messages.map((data): ThreadItem => ({ kind: "message", ts: data.sent_at, data })),
    ...notes.map((data): ThreadItem => ({ kind: "note", ts: data.created_at, data })),
    ...passagens.map((data): ThreadItem => ({ kind: "passagem", ts: data.criadoEm, data })),
  ];
  // Sort estável (Array#sort é estável no V8/Node): empate mantém a ordem de
  // inserção acima — mensagens antes de notas no mesmo instante, e a passagem
  // DEPOIS das duas, que é o que aconteceu: ela é consequência da última fala.
  items.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return items;
}

function dayLabel(d: Date, t: (texto: string) => string = (texto) => texto, locale: Locale): string {
  if (isToday(d)) return t("Hoje");
  if (isYesterday(d)) return t("Ontem");
  return format(d, "dd/MM/yyyy", { locale: locale });
}

export function ChatThread(props: Props) {
  // O estado da navegação pertence a uma única conversa, inclusive ao voltar
  // a uma conversa anterior depois de cancelar uma carga ainda em andamento.
  return <ChatThreadDaConversa key={props.conversationId ?? "sem-conversa"} {...props} />;
}

function ChatThreadDaConversa({
  conversationId,
  provider,
  onResponder,
  dono,
  contatoId,
  searchTerm = "",
}: Props) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const q = useMessagesRealtime(conversationId);
  const notes = useConversationNotes(conversationId);
  const passagens = usePassagensDaConversa(conversationId);
  const claim = useClaimConversation();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const paginasVistas = useRef(0);
  const pedidoDeCitacao = useRef(0);
  const navegacaoEmCurso = useRef(false);
  const [navegacao, setNavegacao] = useState<{
    conversa: string; mensagem: string; carregando: boolean;
  } | null>(null);
  const [avisoCitacao, setAvisoCitacao] = useState<{ conversa: string; texto: string } | null>(null);
  const [destaque, setDestaque] = useState<{ conversa: string; mensagem: string } | null>(null);
  const navegacaoAtual = navegacao?.conversa === conversationId ? navegacao : null;

  /**
   * Esta conversa já ancorou no fim ALGUMA vez, com conteúdo na tela?
   *
   * Enquanto for `false`, a abertura ainda não terminou — e a guarda de
   * distância (que existe para não arrancar quem está lendo o histórico) não
   * pode valer, porque ninguém rolou nada ainda. Ver o efeito abaixo.
   */
  const jaAncorou = useRef(false);
  const activeOrg = useActiveOrg();
  const currentUser = useUser();
  const deleteNote = useDeleteNote(conversationId ?? "");
  const { editar, apagar, ocultar, restaurar } = useAlterarMensagem(conversationId);
  const canManage = activeOrg != null && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  const canalAlteraEnviada = transportaMensagem(provider)
    && capabilitiesOf(provider as ChannelProvider).alteraMensagemEnviada;
  const { enabled: debugCitations } = useDebugToggle(activeOrg?.role ?? null);

  const messages: Message[] = useMemo(
    () => q.data?.pages.flatMap((p) => p.data) ?? [],
    [q.data],
  );

  /**
   * BUSCA NO QUE JÁ ESTÁ NA TELA (#1793). Não vai ao servidor: filtra as
   * páginas carregadas, e o rótulo diz isso para ninguém ler "zero" como "não
   * existe na conversa". Apagada e oculta ficam de fora — o texto delas não
   * aparece na bolha, e marcar uma bolha sem o termo visível seria mentir.
   */
  const termo = searchTerm.trim().toLocaleLowerCase();
  const resultados = useMemo(
    () =>
      new Set(
        messages
          .filter(
            (m) =>
              termo &&
              !m.revoked_at &&
              !m.metadata?.crm_hidden_at &&
              m.body?.toLocaleLowerCase().includes(termo),
          )
          .map((m) => m.id),
      ),
    [messages, termo],
  );
  // Só o TERMO leva à ocorrência. Depender do conjunto de resultados faria cada
  // mensagem nova do tempo real arrancar quem lê de volta à primeira ocorrência.
  useEffect(() => {
    if (termo)
      scrollerRef.current
        ?.querySelector('[data-search-match="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [termo]);
  const porId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  // O cursor continua sendo o do histórico normal: não cria lacunas e não
  // substitui as últimas mensagens por uma janela isolada do passado.
  async function irParaMensagem(id: string) {
    if (!conversationId) return;
    const pedido = ++pedidoDeCitacao.current;
    navegacaoEmCurso.current = true;
    const conversa = conversationId;
    setAvisoCitacao(null);
    setDestaque(null);
    setNavegacao({ conversa, mensagem: id, carregando: true });
    let pagina = { data: q.data, hasNextPage: q.hasNextPage };
    try {
      while (!pagina.data?.pages.some((p) => p.data.some((m) => m.id === id))) {
        if (!pagina.hasNextPage) throw new Error("ausente");
        const cursorAnterior = pagina.data?.pages.at(-1)?.meta?.cursor;
        const proxima = await q.fetchNextPage({ cancelRefetch: false });
        if (pedido !== pedidoDeCitacao.current) return;
        if (proxima.isError) throw new Error("carga");
        pagina = proxima;
        if (pagina.hasNextPage && pagina.data?.pages.at(-1)?.meta?.cursor === cursorAnterior)
          throw new Error("carga");
      }
      if (pedido === pedidoDeCitacao.current)
        setNavegacao({ conversa, mensagem: id, carregando: false });
    } catch (erro) {
      if (pedido !== pedidoDeCitacao.current) return;
      navegacaoEmCurso.current = false;
      setNavegacao(null);
      setAvisoCitacao({ conversa, texto: erro instanceof Error && erro.message === "ausente"
        ? t("A mensagem citada não está disponível neste histórico.")
        : t("Não foi possível carregar a mensagem citada. Clique na citação para tentar novamente.") });
    }
  }

  // Espera a pintura da página que contém a original antes de rolar. A troca
  // de conversa cancela o pedido anterior; uma resposta atrasada não move outra conversa.
  useEffect(() => {
    return () => { pedidoDeCitacao.current += 1; navegacaoEmCurso.current = false; };
  }, [conversationId]);
  useEffect(() => {
    if (!navegacaoAtual || navegacaoAtual.carregando || !porId.has(navegacaoAtual.mensagem)) return;
    const elemento = Array.from(scrollerRef.current?.querySelectorAll<HTMLElement>("[data-message-id]") ?? [])
      .find((el) => el.dataset.messageId === navegacaoAtual.mensagem);
    if (!elemento) return;
    elemento.scrollIntoView({ behavior: "auto", block: "center" });
    navegacaoEmCurso.current = false;
    setDestaque({ conversa: navegacaoAtual.conversa, mensagem: navegacaoAtual.mensagem });
    setNavegacao(null);
  }, [navegacaoAtual, porId]);
  useEffect(() => {
    if (!destaque) return;
    const timer = setTimeout(() => setDestaque(null), 3000);
    return () => clearTimeout(timer);
  }, [destaque]);

  const cartoes: CartaoDaPassagem[] = useMemo(
    () =>
      montarCartoesDaPassagem(passagens, {
        usuarioId: currentUser.id,
        donoId: dono?.userId ?? null,
        donoNome: dono?.nome ?? null,
        aceito: dono?.aceito,
      }),
    [passagens, currentUser.id, dono?.userId, dono?.nome, dono?.aceito],
  );

  const items: ThreadItem[] = useMemo(
    () => mergeThreadItems(messages, notes, cartoes),
    [messages, notes, cartoes],
  );

  const paginas = q.data?.pages.length ?? 0;

  // Conversa nova: a contagem de páginas recomeça, senão a primeira carga da
  // próxima conversa seria confundida com um "carregar mais antigas".
  useEffect(() => {
    paginasVistas.current = 0;
    jaAncorou.current = false;
  }, [conversationId]);

  // Rola ao fim na primeira carga e quando chega mensagem/nota nova — mas NÃO
  // quando o crescimento veio do "Carregar mais antigas".
  //
  // A thread pagina para o PASSADO: cada `fetchNextPage` traz mensagens mais
  // antigas, que entram ACIMA das que já estão na tela. Rolar ao fim aqui
  // devolveria o usuário ao rodapé no instante em que ele pediu para subir —
  // o clique parece não ter efeito, embora tenha carregado (medido: thread vai
  // de msg#15..#64 para msg#1..#64 e a viewport volta a 7px do fim).
  //
  // A segunda guarda cobre o outro caso: se o usuário rolou para ler o
  // histórico, mensagem nova não deve arrancá-lo de onde estava.
  useEffect(() => {
    const carregouAntigas = paginasVistas.current !== 0 && paginas > paginasVistas.current;
    paginasVistas.current = paginas;
    if (carregouAntigas || navegacaoEmCurso.current) return;

    /**
     * A guarda de distância NÃO vale ENQUANTO A ABERTURA NÃO TERMINOU.
     *
     * A versão anterior chamava isso de "primeira carga" e media pelo contador
     * de PÁGINAS da consulta de mensagens — e isso é um proxy, não a coisa. O
     * fio não é só mensagens: ele intercala notas e **cartões de passagem**, que
     * chegam de consultas próprias e podem resolver DEPOIS da primeira pintura.
     *
     * Medido em 2026-09-18, na prova em tela do cartão "Por que a IA passou para
     * você", numa conversa SEM mensagens (que é o normal logo depois de uma
     * passagem): a primeira pintura vem vazia e já consome a "primeira carga";
     * quando o cartão chega, o efeito roda de novo, a guarda passa a valer, e o
     * scroller está no topo com o conteúdo recém-nascido embaixo — distância
     * bem maior que 120px. A guarda concluía "o usuário está lendo o histórico"
     * de um usuário que não tinha rolado nada, e devolvia sem rolar.
     *
     * O efeito visível é o pior possível para esta tela: quem assume vê o
     * cabeçalho do cartão e o motivo, e o convite **"Assumir e responder" fica
     * abaixo da dobra do fio** — o gesto existe, está montado, é clicável por
     * programa e ninguém o vê. Medido por ferramenta: botão em y=1008 numa
     * janela de 720px.
     *
     * `jaAncorou` pergunta o que a guarda precisa saber de verdade — "esta
     * conversa já chegou ao fim alguma vez, com conteúdo na tela?" —, em vez de
     * inferir isso da paginação de UMA das três fontes do fio.
     */
    const primeiraAncoragem = !jaAncorou.current;
    if (jaAncorou.current) {
      const sc = scrollerRef.current;
      if (sc && sc.scrollHeight - sc.scrollTop - sc.clientHeight > 120) return;
    }
    // Fio ainda vazio não ancora nada: marcar aqui faria a guarda valer a partir
    // da pintura em branco, que é exatamente o defeito acima.
    if (items.length > 0) jaAncorou.current = true;

    bottomRef.current?.scrollIntoView({
      behavior: primeiraAncoragem ? "auto" : "smooth",
      block: "end",
    });
  }, [items.length, conversationId, paginas]);

  /**
   * O ESTADO DO CANAL DESTE THREAD, PUBLICADO SEMPRE — inclusive quando não há
   * mensagem nenhuma.
   *
   * ⚠️ A primeira versão punha estes atributos só no caso de SUCESSO, junto com
   * o `data-testid`. Isso os tornava invisíveis exatamente no estado em que
   * mais importam: conversa sem mensagens, esperando a primeira chegar. O canal
   * existe desde que a conversa abre; o sinal dele não pode depender de já
   * haver o que mostrar.
   *
   * Custou uma rodada de CI para aparecer, e por um motivo que vale registrar:
   * na máquina de quem desenvolve a conversa tem histórico acumulado, então o
   * caminho de sucesso é o único que se exercita. No CI o banco é fresco e a
   * conversa nasce vazia — o estado que nunca se vê localmente é o normal lá.
   *
   * Os dois atributos dizem coisas diferentes e nenhum sozinho basta:
   * `-status-mensagens` distingue "assinou" de "nem chegou a assinar";
   * `-divergencias-mensagens` é o que denuncia canal ASSINADO E MUDO, porque só
   * incrementa quando o refetch traz o que o canal não trouxe.
   */
  const sinalDoCanal = {
    "data-testid": "chat-thread",
    "data-realtime-status-mensagens": q.realtimeStatus,
    "data-refetch-divergencias-mensagens": q.seguranca?.divergencias ?? 0,
  } as const;

  if (!conversationId) {
    return (
      <div
        {...sinalDoCanal}
        className="flex h-full items-center justify-center text-sm text-muted-foreground"
      >
        {t("Selecione uma conversa")}
      </div>
    );
  }

  if (q.isLoading) {
    return (
      <div {...sinalDoCanal} className="space-y-3 p-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-2/3" />
        ))}
      </div>
    );
  }

  if (q.isError && !q.data) {
    return (
      <div
        {...sinalDoCanal}
        className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
      >
        <p>{t("Erro ao carregar mensagens.")}</p>
        <Button size="sm" variant="outline" onClick={() => q.refetch()}>
          {t("Tentar novamente")}
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        {...sinalDoCanal}
        className="flex h-full items-center justify-center text-sm text-muted-foreground"
      >
        {t("Nenhuma mensagem nesta conversa.")}
      </div>
    );
  }

  // Group by day for separators (usa o timestamp do item — sent_at pra mensagem, created_at pra nota).
  const groups: { key: string; date: Date; items: ThreadItem[] }[] = [];
  for (const item of items) {
    const d = new Date(item.ts);
    const key = format(d, "yyyy-MM-dd");
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, date: d, items: [item] });
  }

  return (
    <div {...sinalDoCanal} className="flex h-full min-w-0 flex-col">
      {(navegacaoAtual?.carregando || avisoCitacao?.conversa === conversationId) && (
        <div className="px-4 py-1 text-xs text-muted-foreground" role="status">
          {navegacaoAtual?.carregando ? t("Carregando mensagem citada…") : avisoCitacao?.texto}
          {navegacaoAtual?.carregando && (
            <Button size="sm" variant="ghost" onClick={() => {
              pedidoDeCitacao.current += 1;
              navegacaoEmCurso.current = false;
              setNavegacao(null);
            }}>{t("Cancelar")}</Button>
          )}
        </div>
      )}
      {termo && (
        <div className="px-4 py-1 text-xs text-muted-foreground" role="status">
          {t("Resultados nas mensagens carregadas")}: {resultados.size}
        </div>
      )}
      <div ref={scrollerRef} className="min-w-0 flex-1 overflow-y-auto py-2">
        {q.hasNextPage && (
          <div className="flex justify-center py-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
            >
              {q.isFetchingNextPage ? t("Carregando…") : t("Carregar mais antigas")}
            </Button>
          </div>
        )}

        {groups.map((g) => (
          <div key={g.key} className="space-y-1">
            <div className="sticky top-0 z-10 flex justify-center py-1">
              <span className="rounded-full bg-background/80 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur">
                {dayLabel(g.date, t, localeDaData)}
              </span>
            </div>
            {g.items.map((item) =>
              item.kind === "passagem" ? (
                <PassagemCard
                  key={`passagem-${item.data.id}`}
                  cartao={item.data}
                  contatoId={contatoId ?? null}
                  assumindo={claim.isPending}
                  // O MESMO gesto do cabeçalho — uma rota, um efeito. Uma
                  // segunda maneira de assumir seria uma segunda chance de os
                  // dois caminhos divergirem sobre o que "assumir" faz.
                  onAssumir={() =>
                    conversationId &&
                    claim.mutate({
                      conversation_id: conversationId,
                      expected_assignee: dono?.userId ?? null,
                    })
                  }
                />
              ) : item.kind === "note" ? (
                <NoteCard
                  key={`note-${item.data.id}`}
                  note={item.data}
                  // Só o autor ou manager+ vê o excluir — o backend barra o resto (403),
                  // então não mostramos um botão que daria erro.
                  onDelete={
                    item.data.created_by_user_id === currentUser.id || canManage
                      ? () => deleteNote.mutate(item.data.id)
                      : undefined
                  }
                />
              ) : (
                <MessageBubble
                  key={`msg-${item.data.id}`}
                  message={item.data}
                  searchMatch={resultados.has(item.data.id)}
                  destacada={destaque?.conversa === conversationId && destaque.mensagem === item.data.id}
                  onIrParaMensagem={(id) => void irParaMensagem(id)}
                  debugCitations={debugCitations}
                  onResponder={onResponder}
                  // Uma citação fora das páginas carregadas mantém o botão;
                  // o clique pagina até alcançar a mensagem original.
                  citada={porId.get(item.data.reply_to_message_id ?? "") ?? null}
                  // Sem isto o balão diz "Você" em toda mensagem digitada no
                  // CRM — inclusive nas do colega, porque `sent_via='user'` só
                  // registra que um humano digitou, nunca qual.
                  viewerUserId={currentUser.id}
                  onEditar={canalAlteraEnviada && item.data.sent_by_user_id === currentUser.id
                    ? (text) => editar.mutateAsync({ id: item.data.id, text }).then(() => undefined)
                    : undefined}
                  onApagar={canalAlteraEnviada && item.data.sent_by_user_id === currentUser.id
                    ? () => apagar.mutateAsync(item.data.id).then(() => undefined)
                    : undefined}
                  onOcultar={canManage && item.data.direction === "inbound"
                    ? () => ocultar.mutateAsync(item.data.id).then(() => undefined)
                    : undefined}
                  onRestaurar={canManage && item.data.direction === "inbound"
                    ? () => restaurar.mutateAsync(item.data.id).then(() => undefined)
                    : undefined}
                />
              ),
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
