"use client";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { roleAtLeast } from "@/lib/auth/types";
import {
  useContagensKanban,
  useInboxKanban,
  useSalvarBarraKanban,
} from "@/hooks/inbox/useInboxKanban";
import { useConversationTagVocabulary } from "@/hooks/inbox/useConversationTags";
import { CORES_KANBAN_PADRAO, etiquetasDaBarra, type ContagemKanban } from "@/lib/inbox/kanban";
import { BotaoDeEtiqueta } from "@/components/tags/ChipDeEtiqueta";
import { useCorDaEtiqueta } from "@/components/tags/CoresDasEtiquetas";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CaretUp, CaretDown, Gear, X } from "@/lib/ui/icons";
import type { ConversationsFilters } from "@/hooks/inbox/useConversationsRealtime";
import type { InboxFiltersValue } from "./InboxFilters";

interface Props {
  value: InboxFiltersValue;
  filtros: ConversationsFilters;
  onChange: (value: InboxFiltersValue) => void;
}
export function BarraKanbanInbox({ value, filtros, onChange }: Props) {
  const t = useT();
  const { user, activeOrg } = useAuth();
  const config = useInboxKanban(activeOrg?.orgId ?? null);
  const [editar, setEditar] = useState(false);
  const departamento = value.department_ids?.length === 1 ? value.department_ids[0]! : null;
  const etiquetas = etiquetasDaBarra(config.data?.barras ?? {}, departamento);
  const contagens = useContagensKanban(activeOrg?.orgId ?? null, filtros, etiquetas);
  const nome =
    config.data?.departamentos.find((d) => d.id === departamento)?.name ??
    t("Todos os departamentos");
  return (
    <section
      aria-label={t("Funil de vendas")}
      className="shrink-0 space-y-1.5 rounded-lg border border-border bg-surface p-2.5"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 md:flex-nowrap md:gap-4">
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs font-medium">{t("Departamento")}</span>
          <Select
            value={
              (value.department_ids?.length ?? 0) > 1 ? "filtrados" : (departamento ?? "padrao")
            }
            onValueChange={(id) =>
              onChange({
                ...value,
                department_ids: id === "padrao" ? undefined : [id],
                kanban_tag: undefined,
              })
            }
          >
            <SelectTrigger
              aria-label={t("Departamento da barra Kanban")}
              className="h-8 w-44 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(value.department_ids?.length ?? 0) > 1 && (
                <SelectItem value="filtrados" disabled>
                  {t("Vários departamentos")}
                </SelectItem>
              )}
              <SelectItem value="padrao">{t("Todos os departamentos")}</SelectItem>
              {(config.data?.departamentos ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="shrink-0 text-xs font-semibold">{t("Funil de vendas")}</span>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto p-1">
          {etiquetas.map((tag) => (
            <Etapa
              key={tag}
              tag={tag}
              contagem={contagens.data?.find((c) => c.tag === tag)}
              selecionada={value.kanban_tag === tag}
              escolher={() =>
                onChange({ ...value, kanban_tag: value.kanban_tag === tag ? undefined : tag })
              }
            />
          ))}
          {!etiquetas.length && (
            <span className="text-xs text-text-muted">{t("Nenhuma etiqueta nesta barra.")}</span>
          )}
        </div>
        {roleAtLeast(activeOrg?.role, "admin") &&
          user.support?.access_mode !== "support_readonly" && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => setEditar(true)}
            >
              <Gear size={16} />
              {t("Personalizar")}
            </Button>
          )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
        <span>{t("Número à esquerda: cards · Vermelho: conversas novas")}</span>
        <span>
          {t("Configuração por departamento")} · {t("Acompanhe os filtros da lista")}
        </span>
      </div>
      {(config.isError || contagens.isError) && (
        <p role="alert" className="text-xs text-destructive">
          {t("Não foi possível carregar a barra de etiquetas.")}{" "}
          <button
            className="underline"
            onClick={() => {
              void config.refetch();
              void contagens.refetch();
            }}
          >
            {t("Tentar novamente")}
          </button>
        </p>
      )}
      {editar && (
        <Personalizar
          departamento={departamento}
          nome={nome}
          etiquetas={etiquetas}
          fechar={() => setEditar(false)}
        />
      )}
    </section>
  );
}

function Etapa({
  tag,
  contagem,
  selecionada,
  escolher,
}: {
  tag: string;
  contagem?: ContagemKanban;
  selecionada: boolean;
  escolher: () => void;
}) {
  const t = useT();
  const cor = useCorDaEtiqueta(tag) ?? CORES_KANBAN_PADRAO[tag] ?? null;
  return (
    <BotaoDeEtiqueta
      tag={tag}
      cor={cor}
      prefixo={<span className="text-base font-medium tabular-nums">{contagem?.total ?? "…"}</span>}
      aria-pressed={selecionada}
      onClick={escolher}
      data-kanban-tag={tag}
      aria-label={`${tag}: ${contagem?.total ?? "…"} ${t("cards")}, ${contagem?.novas ?? "…"} ${t("conversas novas")}`}
      className={`flex h-8 shrink-0 items-center gap-3 rounded-md border px-2 text-xs font-semibold ${selecionada ? "outline-2 outline-offset-2 outline-accent" : "hover:opacity-85"}`}
    >
      <span className="flex size-6 items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white tabular-nums">
        {contagem?.novas ?? "…"}
      </span>
    </BotaoDeEtiqueta>
  );
}

function Personalizar({
  departamento,
  nome,
  etiquetas,
  fechar,
}: {
  departamento: string | null;
  nome: string;
  etiquetas: string[];
  fechar: () => void;
}) {
  const t = useT();
  const { activeOrg } = useAuth();
  const vocabulary = useConversationTagVocabulary(activeOrg?.orgId ?? null);
  const mutation = useSalvarBarraKanban();
  const [draft, setDraft] = useState(etiquetas);
  const [nova, setNova] = useState("");
  const opcoes = [...new Set([...(vocabulary.data ?? []), ...etiquetas])].filter(
    (v) => !draft.includes(v),
  );
  function mover(i: number, delta: number) {
    const lista = [...draft];
    [lista[i], lista[i + delta]] = [lista[i + delta]!, lista[i]!];
    setDraft(lista);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) fechar();
      }}
    >
      <DialogContent className="flex max-h-[85dvh] flex-col">
        <DialogTitle>
          {t("Personalizar barra")} · {nome}
        </DialogTitle>
        <DialogDescription>
          {t("Escolha as etiquetas e a ordem para este departamento.")}
        </DialogDescription>
        <div className="min-h-0 space-y-2 overflow-y-auto">
          {draft.map((tag, i) => (
            <div key={tag} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{tag}</span>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={!i || mutation.isPending}
                aria-label={`${t("Mover para cima")} ${tag}`}
                onClick={() => mover(i, -1)}
              >
                <CaretUp size={14} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={i === draft.length - 1 || mutation.isPending}
                aria-label={`${t("Mover para baixo")} ${tag}`}
                onClick={() => mover(i, 1)}
              >
                <CaretDown size={14} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={mutation.isPending}
                aria-label={`${t("Remover etiqueta da barra")} ${tag}`}
                onClick={() => setDraft(draft.filter((v) => v !== tag))}
              >
                <X size={14} />
              </Button>
            </div>
          ))}
          {opcoes.map((tag) => (
            <button
              key={tag}
              type="button"
              className="m-1 rounded-full border border-dashed px-2 py-1 text-xs"
              disabled={draft.length >= 20 || mutation.isPending}
              onClick={() => setDraft([...draft, tag])}
            >
              + {tag}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            aria-label={t("Nova etiqueta na barra")}
            value={nova}
            maxLength={40}
            onChange={(e) => setNova(e.target.value)}
            disabled={mutation.isPending}
          />
          <Button
            variant="outline"
            onClick={() => {
              const tag = nova.trim().toLowerCase();
              if (!draft.includes(tag)) setDraft([...draft, tag]);
              setNova("");
            }}
            disabled={!nova.trim() || draft.length >= 20 || mutation.isPending}
          >
            {t("Adicionar")}
          </Button>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t pt-3">
          <Button variant="outline" disabled={mutation.isPending} onClick={fechar}>
            {t("Cancelar")}
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(
                { departamento_id: departamento, etiquetas: draft },
                { onSuccess: fechar },
              )
            }
          >
            {mutation.isPending ? t("Salvando…") : t("Salvar para este departamento")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
