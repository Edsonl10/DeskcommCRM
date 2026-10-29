"use client";
import { useT } from "@/hooks/i18n/useT";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaretLeft, CaretRight, MagnifyingGlass, Funnel } from "@/lib/ui/icons";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { channelLabel, useChannelSessions } from "@/hooks/channels/useChannelSessions";
import { type ModoDeEtiqueta, marcadoresEscolhidos } from "@/lib/inbox/marcador-da-conversa";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useContactTagVocabulary } from "@/hooks/contacts/useContactTagVocabulary";
import { useConversationTagVocabulary } from "@/hooks/inbox/useConversationTags";
import { useConversationCounts } from "@/hooks/inbox/useConversationCounts";
import type { Role } from "@/lib/auth/types";
import type { FiltrosAvancados } from "@/lib/inbox/filtros-avancados";
import { InboxAdvancedFilters, quantidadeDeFiltros } from "./InboxAdvancedFilters";

import { INBOX_VIEWS, permissaoGlobalInbox, type InboxView } from "@/lib/inbox/visoes";
export type InboxTab = InboxView | "mine" | "unassigned" | "archived";
const INBOX_TABS = INBOX_VIEWS;
export function visibleInboxTabs(role: Role, permissions: unknown): InboxTab[] {
  return INBOX_TABS.filter(
    (tab) => tab.value !== "all" || permissaoGlobalInbox(role, permissions, "all"),
  ).map((tab) => tab.value);
}

export interface InboxFiltersValue extends FiltrosAvancados {
  kanban_tag?: string;
  tab: InboxTab;
  search: string;
  onlyUnread: boolean;
  channel_session_id?: string;
  /**
   * A etiqueta escolhida, ou VÁRIAS (#1274).
   *
   * `string` continua aceito e continua significando a MESMA coisa: é o que o
   * `InboxLayout`, o deep-link e qualquer chamada antiga produzem. Uma etiqueta
   * só nunca tem dois sentidos, porque o caminho singular da régua
   * (`aplicarMarcador`) é o mesmo de antes — byte a byte.
   */
  tag?: string | readonly string[];
  /** E ou OU entre as etiquetas escolhidas (#1274). `e` é o padrão. */
  tagMode?: ModoDeEtiqueta;
  /** Apenas grupos no painel de filtros: manda `is_group=true` na listagem. */
  onlyGroups?: boolean;
}

interface Props {
  value: InboxFiltersValue;
  onChange: (next: InboxFiltersValue) => void;
}

export function InboxFilters({ value, onChange }: Props) {
  const t = useT();
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const quantidade = quantidadeDeFiltros(value);
  const [searchInput, setSearchInput] = useState(value.search);
  const tabsListRef = useRef<HTMLDivElement>(null);
  const [moreTabs, setMoreTabs] = useState({ left: false, right: false });
  const updateMoreTabs = useCallback(() => {
    const list = tabsListRef.current;
    if (!list) return;
    const maxScroll = Math.max(0, list.scrollWidth - list.clientWidth);
    const next = { left: list.scrollLeft > 1, right: list.scrollLeft < maxScroll - 1 };
    setMoreTabs((previous) =>
      previous.left === next.left && previous.right === next.right ? previous : next,
    );
  }, []);
  useEffect(() => {
    const list = tabsListRef.current;
    if (!list) return;
    const centerSelectedTab = () => {
      // Deixar a aba só na borda esconde as vizinhas. Centralizar mostra o
      // contexto dos dois lados, salvo nas extremidades naturais da faixa.
      const selected = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (selected) {
        const selectedCenter =
          selected.getBoundingClientRect().left -
          list.getBoundingClientRect().left +
          list.scrollLeft +
          selected.offsetWidth / 2;
        const maxScroll = Math.max(0, list.scrollWidth - list.clientWidth);
        list.scrollLeft = Math.max(0, Math.min(maxScroll, selectedCenter - list.clientWidth / 2));
      }
      updateMoreTabs();
    };
    centerSelectedTab();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(centerSelectedTab);
    observer.observe(list);
    list.querySelectorAll<HTMLElement>('[role="tab"]').forEach((tab) => observer.observe(tab));
    return () => observer.disconnect();
  }, [value.tab, updateMoreTabs]);
  /**
   * O campo escuta o valor de FORA — e só ele.
   *
   * O estado do campo é próprio porque o debounce mora nele. O preço era não
   * saber quando o filtro morria por outro caminho: "Limpar filtros" zerava a
   * busca aplicada e deixava o termo escrito na tela, mostrando uma busca que
   * não valia mais — a mesma mentira de tela que esta entrega existe para matar.
   *
   * A ref guarda o que ESTE campo propagou. Valor de fora diferente dela = a
   * mudança veio de outro lugar, e o campo adota. Igual = foi o próprio campo, e
   * adotar atropelaria quem continuou digitando.
   *
   * ⚠️ O QUE O TESTE ALCANÇA, E O QUE NÃO. Tirar este efeito reprova o primeiro
   * caso de `tests/unit/limpar-filtros-limpa-o-campo.test.tsx` — medido. Já a
   * marca lá embaixo, no timer, NÃO é alcançada por teste determinístico: ela
   * defende a corrida entre o timer disparar e este efeito rodar, e nessa fresta
   * o teste nunca consegue digitar. Medido também: sabotá-la deixa os dois casos
   * verdes. Está escrito aqui em vez de fingir cobertura que não existe.
   */
  const propagado = useRef(value.search);
  useEffect(() => {
    if (value.search !== propagado.current) {
      propagado.current = value.search;
      setSearchInput(value.search);
    }
  }, [value.search]);
  const { data: channels } = useChannelSessions({ refetchInterval: 30_000 });
  const { activeOrg } = useAuth();
  /**
   * As opções são a UNIÃO das duas caixas — as mesmas que o filtro consulta
   * (`conversations.tags` ou `contacts.tags`, no handler da lista).
   *
   * Vinham só do vocabulário de CONVERSA: o marcador escrito no contato nem
   * aparecia para ser escolhido. Quem oferece e quem filtra lendo fontes
   * diferentes é o defeito espelhado — ou a opção existe e devolve vazio, ou o
   * marcador que funciona nunca é oferecido.
   */
  const orgId = activeOrg?.orgId ?? null;
  const { data: tagsDeConversa } = useConversationTagVocabulary(orgId);
  const { data: tagsDeContato } = useContactTagVocabulary(orgId);
  const tagVocabulary = useMemo(
    () =>
      tagsDeConversa == null && tagsDeContato == null
        ? undefined
        : [...new Set([...(tagsDeConversa ?? []), ...(tagsDeContato ?? [])])].sort((a, b) =>
            a.localeCompare(b),
          ),
    [tagsDeConversa, tagsDeContato],
  );
  // A lista de etiquetas escolhida, normalizada pelo MESMO caminho do servidor
  // (`marcadoresEscolhidos`): sem vazio, sem repetido, com a ordem da primeira
  // aparição. Duas fontes de verdade para "quantas etiquetas estão escolhidas"
  // fariam a tela mostrar um filtro e a lista aplicar outro.
  const etiquetas = useMemo(
    () => marcadoresEscolhidos(typeof value.tag === "string" ? [value.tag] : (value.tag ?? [])),
    [value.tag],
  );
  // Os MESMOS filtros que a lista aplicou. Badge que conta o que a aba não mostra
  // manda o atendente procurar trabalho que não existe — a regra já estava escrita
  // na rota; faltava alcançar os filtros ao lado da aba.
  const { data: counts } = useConversationCounts(activeOrg?.orgId ?? null, {
    kanban_tag: value.kanban_tag,
    search: value.search,
    unread: value.onlyUnread,
    is_group: value.onlyGroups,
    tag: etiquetas,
    tagMode: value.tagMode,
    channel_session_id: value.channel_session_id,
    department_ids: value.department_ids,
    assigned_user_ids: value.assigned_user_ids,
    last_message_from: value.last_message_from,
    last_message_before: value.last_message_before,
  });

  const tabs = activeOrg
    ? visibleInboxTabs(activeOrg.role, activeOrg.inbox_permissions)
    : INBOX_TABS.map((t) => t.value);
  const moveTab = (direction: -1 | 1) => {
    const next = tabs[tabs.indexOf(value.tab) + direction];
    if (next) onChange({ ...value, tab: next });
  };
  const countFor: Partial<Record<InboxTab, number>> = {
    active: counts?.active,
    waiting: counts?.waiting,
    ai: counts?.ai,
    all: counts?.all,
    closed: counts?.closed,
  };
  // Filtrar por um número que saiu da lista (o operador acabou de excluir o
  // canal) deixa o inbox mostrando um subconjunto — às vezes vazio — sem nada na
  // tela dizendo que há filtro. O número some do dropdown junto com o canal, e o
  // alternador inteiro sumiria com ele se sobrasse menos de dois.
  const filtroForaDaLista =
    value.channel_session_id != null &&
    channels != null &&
    !channels.some((c) => c.id === value.channel_session_id);
  // Alternador só aparece com 2+ números — com um só não há o que alternar.
  const showChannelSwitch = (channels?.length ?? 0) >= 2 || filtroForaDaLista;
  // O painel conserva as opções durante o refetch do vocabulário; a troca
  // real de organização é isolada pela chave de montagem do componente.
  const [ultimoVocabulario, setUltimoVocabulario] = useState<string[]>([]);
  if (tagVocabulary != null && tagVocabulary.length > 0 && tagVocabulary !== ultimoVocabulario) {
    // Ajuste de estado DURANTE a renderização (o padrão que a documentação do
    // React chama de "adjusting state when props change"): o React reinicia o
    // render deste componente com o valor novo antes de pintar, então o seletor
    // nunca chega à tela com o vocabulário velho. Efeito aqui não serviria —
    // ele roda DEPOIS da pintura, e a janela de um frame é exatamente a que
    // desmonta o Select.
    setUltimoVocabulario(tagVocabulary);
  }
  const vocabularioDoSeletor =
    tagVocabulary != null && tagVocabulary.length > 0 ? tagVocabulary : ultimoVocabulario;
  // O MESMO tratamento, agora para a etiqueta. Sem ele, o seletor inteiro some
  // com o filtro AINDA APLICADO — a lista fica num subconjunto, às vezes vazio,
  // e nada na tela diz que há filtro nem oferece como tirá-lo.
  // "Conhecido" e "não-vazio" são coisas diferentes, e é o primeiro que vale
  // aqui: a organização cuja ÚLTIMA etiqueta acabou de ser apagada responde
  // vocabulário vazio, e é justamente ela que precisa do seletor de volta para
  // desfazer o filtro que continua valendo.
  const vocabularioConhecido = tagVocabulary != null || ultimoVocabulario.length > 0;
  // ⚠️ A VALIDAÇÃO DO FILTRO ÓRFÃO PASSOU A SER SOBRE A LISTA (#1274). Com uma
  // etiqueta só, "está no vocabulário" é uma pergunta; com VÁRIAS, é outra: basta
  // uma das escolhidas ter sumido do vocabulário para o operador precisar da
  // válvula. O sintoma sem isto seria o pior dos dois: um filtro de duas
  // etiquetas, uma delas apagada, e a tela sem dizer que há filtro nenhum.
  // ⚠️ `&&` AQUI DEVOLVERIA `false | string[]`, e `false.length` não existe. A
  // forma é um ternário que devolve SEMPRE lista: o resto do componente só
  // precisa do comprimento, e um `false` no meio obrigaria cada uso a checar.
  const etiquetasForaDoVocabulario =
    etiquetas.length > 0 && vocabularioConhecido
      ? etiquetas.filter((tag) => !vocabularioDoSeletor.includes(tag))
      : [];
  const opcoesDoSeletor = [...vocabularioDoSeletor, ...etiquetasForaDoVocabulario];
  // O timer lê o valor MAIS RECENTE, não o do render em que foi agendado.
  //
  // Antes, o efeito dependia só de `[searchInput]` e a closure capturava `value`
  // inteiro — `tab` incluso. Digitar e trocar de aba em menos de 250 ms fazia o
  // timer disparar com a aba VELHA e devolver o operador à aba anterior, sem ele
  // ter pedido. Some em teste manual: quem sabe do defeito digita devagar.
  //
  // As refs são o que permite manter `[searchInput]` como única dependência (pôr
  // `value`/`onChange` ali reagendaria o timer a cada render e a busca nunca
  // fecharia) SEM pagar o preço da closure velha.
  const valorRef = useRef(value);
  const onChangeRef = useRef(onChange);
  // A atualização vai num efeito, e não no corpo do render: escrever em ref
  // durante a renderização é proibido pela regra `react-hooks/refs` — o React
  // pode renderizar sem efetivar, e aí a ref passa a apontar para um estado que
  // nunca chegou à tela. O efeito roda depois do commit, quando `value` é real.
  useEffect(() => {
    valorRef.current = value;
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const t = setTimeout(() => {
      const atual = valorRef.current;
      if (searchInput !== atual.search) {
        // Marca ANTES de propagar: se o efeito de sincronização rodar depois de
        // a pessoa ter digitado mais uma tecla, ele veria o valor que ESTE campo
        // acabou de mandar e o adotaria por cima do que já está na tela. Sem
        // teste que alcance — ver o aviso no efeito lá em cima.
        propagado.current = searchInput;
        onChangeRef.current({ ...atual, search: searchInput });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  return (
    <div className="border-b border-border bg-background">
      {value.tab === "all" && (counts?.needs_assignment ?? 0) > 0 && (
        <p role="status" className="px-3 pt-2 text-sm text-warning-fg">
          {counts?.needs_assignment}{" "}
          {t(
            "atendimento(s) aguardando direcionamento. Confira a disponibilidade da equipe ou transfira para um atendente.",
          )}
        </p>
      )}
      <div className="space-y-2 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlass
              size={15}
              weight="regular"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle"
              aria-hidden
            />
            {/* "última mensagem", e não "mensagem": a busca alcança apenas
                `conversations.last_message_preview` — a ÚLTIMA mensagem, truncada em 200
                caracteres já na ingestão (`grep -rn 'slice(0, 200)' lib/channels/` mostra onde).
                Medido numa conversa real de 32 mensagens: buscar o que o cliente pediu na
                3ª devolve ZERO. Alcançar o histórico é projeto próprio (índice trigram +
                retenção + LGPD); até lá, a tela não promete o que o backend não faz. */}
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("Buscar por nome, telefone ou última mensagem…")}
              className="h-9 rounded-full border-transparent bg-surface-elevated pl-9 text-sm shadow-none focus-visible:border-border focus-visible:bg-background"
              aria-label={t("Buscar conversas")}
            />
          </div>
          {/* Botão pressionável em vez de Switch: o filtro vive na mesma linha
              da busca, e o Switch com rótulo pedia uma linha inteira só para
              si numa coluna de 280px. */}
          <button
            type="button"
            aria-pressed={value.onlyUnread}
            onClick={() => onChange({ ...value, onlyUnread: !value.onlyUnread })}
            className={cn(
              "h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden",
              value.onlyUnread
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-transparent text-text-muted hover:bg-surface-elevated",
            )}
          >
            {t("Não lidos")}
          </button>
          <button
            type="button"
            aria-label={t("Filtros de conversas")}
            title={t("Filtros")}
            aria-haspopup="dialog"
            aria-expanded={filtrosAbertos}
            onClick={() => setFiltrosAbertos(true)}
            className={cn(
              "relative flex size-9 shrink-0 items-center justify-center rounded-full border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
              quantidade
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-surface-elevated text-text-muted hover:text-text",
            )}
          >
            <Funnel size={16} weight="fill" aria-hidden />
            {quantidade > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-accent px-1 text-[10px] text-accent-foreground">
                {quantidade}
              </span>
            )}
          </button>
        </div>

        {showChannelSwitch && (
          <div className="flex gap-2">
            <Select
              value={value.channel_session_id ?? "all"}
              onValueChange={(v) =>
                onChange({ ...value, channel_session_id: v === "all" ? undefined : v })
              }
            >
              <SelectTrigger
                className={cn(
                  "h-8 min-w-0 flex-1 rounded-full border-transparent bg-surface-elevated px-3 text-xs shadow-none",
                  value.channel_session_id != null && "border-accent bg-accent-soft text-accent",
                )}
                aria-label={t("Filtrar por número de WhatsApp")}
              >
                <SelectValue placeholder={t("Todos os números")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("Todos os números")}</SelectItem>
                {filtroForaDaLista && value.channel_session_id != null && (
                  <SelectItem value={value.channel_session_id}>{t("Número removido")}</SelectItem>
                )}
                {channels?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {channelLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {filtrosAbertos && (
        <InboxAdvancedFilters
          value={value}
          onChange={onChange}
          onClose={() => setFiltrosAbertos(false)}
          channels={channels ?? []}
          tags={opcoesDoSeletor}
        />
      )}

      {/* As setas aparecem só quando há abas fora da área visível; a faixa e o
          sublinhado continuam com a altura compacta do Inbox. */}
      <Tabs
        value={value.tab}
        onValueChange={(v) => onChange({ ...value, tab: v as InboxTab })}
        className="px-3"
      >
        <div className="flex items-center gap-1">
          {moreTabs.left ? (
            <button
              type="button"
              onClick={() => moveTab(-1)}
              aria-label={t("Aba anterior")}
              className="flex w-4 shrink-0 items-center justify-center text-text-muted hover:text-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
            >
              <CaretLeft size={13} aria-hidden />
            </button>
          ) : (
            <span className="w-4 shrink-0" aria-hidden />
          )}
          <TabsList
            ref={tabsListRef}
            onScroll={updateMoreTabs}
            className="h-auto min-w-0 flex-1 [scrollbar-width:none] justify-between gap-2 rounded-none bg-transparent p-0"
          >
            {tabs.map((tab) => {
              const meta = INBOX_TABS.find((t) => t.value === tab)!;
              const count = countFor[tab];
              return (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="shrink-0 gap-1 rounded-none border-b-2 border-transparent px-0 pt-1 pb-2 text-xs font-medium text-text-muted data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-text data-[state=active]:shadow-none"
                >
                  {t(meta.label)}
                  {typeof count === "number" && count > 0 && (
                    <span className="text-[11px] text-text-subtle tabular-nums">{count}</span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {moreTabs.right ? (
            <button
              type="button"
              onClick={() => moveTab(1)}
              aria-label={t("Próxima aba")}
              className="flex w-4 shrink-0 items-center justify-center text-text-muted hover:text-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
            >
              <CaretRight size={13} aria-hidden />
            </button>
          ) : (
            <span className="w-4 shrink-0" aria-hidden />
          )}
        </div>
      </Tabs>
    </div>
  );
}
