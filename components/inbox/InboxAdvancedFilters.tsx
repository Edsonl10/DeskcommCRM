"use client";

import { useState } from "react";
import { Funnel, X } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useDepartments } from "@/hooks/team/useDepartments";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { channelLabel, type ChannelSession } from "@/hooks/channels/useChannelSessions";
import { roleAtLeast } from "@/lib/auth/types";
import { marcadoresEscolhidos } from "@/lib/inbox/marcador-da-conversa";
import { periodoDasDatas } from "@/lib/inbox/filtros-avancados";
import { cn } from "@/lib/utils";
import type { InboxFiltersValue } from "./InboxFilters";

export function quantidadeDeFiltros(value: InboxFiltersValue): number {
  return (
    Number(value.onlyUnread) +
    Number(!!value.onlyGroups) +
    Number(!!value.channel_session_id) +
    marcadoresEscolhidos(typeof value.tag === "string" ? [value.tag] : (value.tag ?? [])).length +
    (value.department_ids?.length ?? 0) +
    (value.assigned_user_ids?.length ?? 0) +
    Number(!!(value.last_message_from || value.last_message_before))
  );
}

function dataLocal(iso?: string, diaAnterior = false): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (diaAnterior) date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function EscolhaMultipla({
  titulo,
  opcoes,
  selecionados,
  onChange,
  carregando,
  erro,
  tentar,
}: {
  titulo: string;
  opcoes: { id: string; nome: string; cor?: string }[];
  selecionados: readonly string[];
  onChange: (ids: string[]) => void;
  carregando?: boolean;
  erro?: boolean;
  tentar?: () => void;
}) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const alternar = (id: string) =>
    onChange(
      selecionados.includes(id) ? selecionados.filter((v) => v !== id) : [...selecionados, id],
    );
  const todos: { id: string; nome: string; cor?: string }[] = [
    ...opcoes,
    ...selecionados
      .filter((id) => !opcoes.some((o) => o.id === id))
      .map((id) => ({ id, nome: t("Indisponível") })),
  ];
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
        {titulo}
        {selecionados.length > 0 && (
          <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-accent">
            {selecionados.length}
          </span>
        )}
      </legend>
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <Input
          aria-label={`${t("Pesquisar")}: ${titulo}`}
          placeholder={t("Pesquise por nome…")}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="rounded-none border-0 border-b border-border bg-transparent shadow-none"
        />
        {selecionados.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-border p-2">
            {todos
              .filter((o) => selecionados.includes(o.id))
              .map((o) => (
                <button
                  type="button"
                  key={o.id}
                  aria-label={`${t("Remover")}: ${o.nome}`}
                  onClick={() => alternar(o.id)}
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground"
                >
                  <span className="truncate">{o.nome}</span>
                  <X size={12} aria-hidden />
                </button>
              ))}
          </div>
        )}
        <div className="flex max-h-48 flex-wrap content-start gap-1.5 overflow-y-auto p-2">
          {carregando ? (
            <p role="status" className="p-2 text-sm text-text-muted">
              {t("Carregando…")}
            </p>
          ) : erro ? (
            <div role="alert" className="p-2 text-sm">
              <p>{t("Não foi possível carregar as opções.")}</p>
              <Button type="button" variant="outline" size="sm" onClick={tentar}>
                {t("Tentar novamente")}
              </Button>
            </div>
          ) : (
            todos
              .filter((o) => o.nome.toLocaleLowerCase().includes(busca.toLocaleLowerCase()))
              .map((o) => (
                <button
                  type="button"
                  key={o.id}
                  aria-pressed={selecionados.includes(o.id)}
                  onClick={() => alternar(o.id)}
                  className={cn(
                    "flex min-h-9 max-w-full min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
                    selecionados.includes(o.id)
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-transparent bg-surface-elevated hover:border-border",
                  )}
                >
                  {o.cor && (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: o.cor }}
                      aria-hidden
                    />
                  )}
                  <span className="truncate">{o.nome}</span>
                </button>
              ))
          )}
          {!carregando && !erro && todos.length === 0 && (
            <p className="p-2 text-sm text-text-muted">{t("Nenhuma opção disponível.")}</p>
          )}
        </div>
      </div>
    </fieldset>
  );
}

export function InboxAdvancedFilters({
  value,
  onChange,
  onClose,
  channels,
  tags,
}: {
  value: InboxFiltersValue;
  onChange: (next: InboxFiltersValue) => void;
  onClose: () => void;
  channels: ChannelSession[];
  tags: string[];
}) {
  const t = useT();
  const { activeOrg } = useAuth();
  const podeLerEquipe = !!activeOrg && roleAtLeast(activeOrg.role, "agent");
  const departamentos = useDepartments({ enabled: podeLerEquipe });
  const atendentes = useAssignableMembers(podeLerEquipe);
  const [draft, setDraft] = useState(value);
  const [inicio, setInicio] = useState(dataLocal(value.last_message_from));
  const [fim, setFim] = useState(dataLocal(value.last_message_before, true));
  const etiquetas = marcadoresEscolhidos(
    typeof draft.tag === "string" ? [draft.tag] : (draft.tag ?? []),
  );
  const periodoInvalido = !!inicio && !!fim && inicio > fim;
  const quantidade = quantidadeDeFiltros({ ...draft, ...periodoDasDatas(inicio, fim) });
  const limpar = () => {
    setDraft({ tab: value.tab, search: value.search, onlyUnread: false, onlyGroups: false });
    setInicio("");
    setFim("");
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <header className="shrink-0 border-b border-border px-5 py-4 pr-14">
          <DialogTitle className="flex items-center gap-2">
            <Funnel size={20} weight="fill" className="text-accent" aria-hidden />
            {t("Filtros")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("Combine filtros para localizar conversas.")}
          </DialogDescription>
        </header>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (periodoInvalido) return;
            // Preserva a aba e a busca atuais, inclusive alterações do debounce.
            const { tab: _tab, search: _search, ...auxiliares } = draft;
            onChange({
              ...value,
              ...auxiliares,
              channel_session_id: draft.channel_session_id,
              tag: draft.tag,
              tagMode: draft.tagMode,
              department_ids: draft.department_ids,
              assigned_user_ids: draft.assigned_user_ids,
              ...periodoDasDatas(inicio, fim),
            });
            onClose();
          }}
        >
          <div className="min-h-0 space-y-5 overflow-y-auto bg-surface-elevated p-5">
            <fieldset>
              <legend className="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
                {t("Conversas")}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["onlyUnread", t("Mensagens não lidas")],
                    ["onlyGroups", t("Apenas grupos")],
                  ] as const
                ).map(([campo, rotulo]) => (
                  <label
                    key={campo}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-background px-4 py-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={!!draft[campo]}
                      onChange={(e) => setDraft({ ...draft, [campo]: e.target.checked })}
                      className="size-4 accent-accent"
                    />
                    {rotulo}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="min-w-0 space-y-2">
                <span className="block text-xs font-semibold tracking-wide text-text-muted uppercase">
                  {t("Instância")}
                </span>
                <Select
                  value={draft.channel_session_id ?? "all"}
                  onValueChange={(v) =>
                    setDraft({ ...draft, channel_session_id: v === "all" ? undefined : v })
                  }
                >
                  <SelectTrigger aria-label={t("Instância")} className="w-full bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("Todas as instâncias")}</SelectItem>
                    {draft.channel_session_id &&
                      !channels.some((c) => c.id === draft.channel_session_id) && (
                        <SelectItem value={draft.channel_session_id}>
                          {t("Número removido")}
                        </SelectItem>
                      )}
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {channelLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <div className="min-w-0 md:col-span-2">
                <fieldset>
                  <legend className="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
                    {t("Data")}
                  </legend>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="min-w-0 space-y-1 text-xs text-text-muted">
                      {t("De")}
                      <Input
                        type="date"
                        aria-label={t("Data inicial")}
                        value={inicio}
                        onChange={(e) => setInicio(e.target.value)}
                        className="block min-w-0 bg-background"
                      />
                    </label>
                    <label className="min-w-0 space-y-1 text-xs text-text-muted">
                      {t("Até")}
                      <Input
                        type="date"
                        aria-label={t("Data final")}
                        min={inicio || undefined}
                        value={fim}
                        onChange={(e) => setFim(e.target.value)}
                        className="block min-w-0 bg-background"
                      />
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-text-muted">
                    {t("Período da última mensagem. Vazio: todo o período.")}
                  </p>
                  {periodoInvalido && (
                    <p role="alert" className="mt-1 text-xs text-destructive">
                      {t("A data final deve ser igual ou posterior à inicial.")}
                    </p>
                  )}
                </fieldset>
              </div>
            </div>
            <EscolhaMultipla
              titulo={t("Etiquetas")}
              opcoes={tags.map((tag) => ({ id: tag, nome: tag }))}
              selecionados={etiquetas}
              onChange={(tag) => setDraft({ ...draft, tag: tag.length ? tag : undefined })}
            />
            {etiquetas.length > 1 && (
              <label className="flex flex-wrap items-center gap-3 text-sm">
                {t("Combinar etiquetas")}
                <Select
                  value={draft.tagMode ?? "e"}
                  onValueChange={(v) =>
                    setDraft({ ...draft, tagMode: v === "ou" ? "ou" : undefined })
                  }
                >
                  <SelectTrigger
                    className="w-48 bg-background"
                    aria-label={t("Combinar etiquetas")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="e">{t("Todas (E)")}</SelectItem>
                    <SelectItem value="ou">{t("Qualquer uma (OU)")}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            )}
            <div className="grid items-start gap-4 md:grid-cols-2">
              <EscolhaMultipla
                titulo={t("Departamento")}
                opcoes={(departamentos.data?.data ?? []).map((d) => ({
                  id: d.id,
                  nome: d.name,
                  cor: d.color,
                }))}
                selecionados={draft.department_ids ?? []}
                onChange={(department_ids) => setDraft({ ...draft, department_ids })}
                carregando={departamentos.isLoading}
                erro={departamentos.isError}
                tentar={() => {
                  void departamentos.refetch();
                }}
              />
              <EscolhaMultipla
                titulo={t("Atendente")}
                opcoes={(atendentes.data ?? []).map((a) => ({
                  id: a.user_id,
                  nome: a.full_name ?? t("Sem nome"),
                }))}
                selecionados={draft.assigned_user_ids ?? []}
                onChange={(assigned_user_ids) => setDraft({ ...draft, assigned_user_ids })}
                carregando={atendentes.isLoading}
                erro={atendentes.isError}
                tentar={() => {
                  void atendentes.refetch();
                }}
              />
            </div>
          </div>
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-5 py-3">
            <p role="status" className="text-xs text-text-muted">
              {quantidade
                ? `${quantidade} ${t("filtro(s) selecionado(s)")}`
                : t("Nenhum filtro selecionado")}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={limpar}>
                {t("Limpar")}
              </Button>
              <Button type="submit" disabled={periodoInvalido}>
                {t("Salvar")}
              </Button>
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
