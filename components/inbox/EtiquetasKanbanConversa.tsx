"use client";
import { useState } from "react";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { roleAtLeast } from "@/lib/auth/types";
import { useT } from "@/hooks/i18n/useT";
import { useInboxKanban } from "@/hooks/inbox/useInboxKanban";
import { CORES_KANBAN_PADRAO, etiquetasDaBarra } from "@/lib/inbox/kanban";
import {
  useConversationTagVocabulary,
  useUpdateConversationTags,
} from "@/hooks/inbox/useConversationTags";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCoresDasEtiquetas } from "@/components/tags/CoresDasEtiquetas";
import { ChipDeEtiqueta } from "@/components/tags/ChipDeEtiqueta";
import { Button } from "@/components/ui/button";

/** Um botão irmão do seletor da conversa: abrir etiquetas não seleciona nem marca como lida. */
export function EtiquetasKanbanConversa({ conversa }: { conversa: ConversationWithContact }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t("Etiquetas Kanban")} — ${conversa.contacts?.display_name ?? conversa.contacts?.name ?? t("Conversa")}`}
          onClick={(event) => { event.preventDefault(); setOpen(!open); }}
          title={t("Etiquetas da conversa")}
          className="flex size-7 items-center justify-center rounded-md border border-transparent hover:border-border hover:bg-surface-elevated focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span aria-hidden className="flex h-4 items-start gap-0.5">
            <span className="h-4 w-1 rounded-xs bg-orange-500" />
            <span className="h-2.5 w-1 rounded-xs bg-sky-500" />
            <span className="h-3.5 w-1 rounded-xs bg-lime-500" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)]"
        aria-label={t("Etiquetas da conversa")}
      >
        {open && (
          <Editor
            key={`${conversa.id}:${conversa.assigned_to_user_id}`}
            conversa={conversa}
            concluir={() => setOpen(false)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function Editor({
  conversa,
  concluir,
}: {
  conversa: ConversationWithContact;
  concluir: () => void;
}) {
  const t = useT();
  const { user, activeOrg } = useAuth();
  const orgId = activeOrg?.orgId ?? null;
  const configuracao = useInboxKanban(orgId);
  const vocabulary = useConversationTagVocabulary(orgId);
  const mutation = useUpdateConversationTags();
  const [original] = useState(conversa.tags ?? []);
  const [draft, setDraft] = useState(original);
  const podeEditar =
    !!conversa.assigned_to_user_id &&
    !user.support?.access_mode?.includes("readonly") &&
    roleAtLeast(activeOrg?.role, "agent") &&
    (conversa.assigned_to_user_id === user.id || roleAtLeast(activeOrg?.role, "manager"));
  const cores = useCoresDasEtiquetas();
  const etapas = etiquetasDaBarra(
    configuracao.data?.barras ?? {},
    conversa.assigned_department_id ?? null,
  );
  const opcoes = [...new Set([...etapas, ...(vocabulary.data ?? []), ...original])];
  const nome = conversa.assigned_to_user_name ?? t("Atendente");
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{t("Etiquetas da conversa")}</h3>
        <p className="mt-1 text-xs text-text-muted">{nome}</p>
      </div>
      {(vocabulary.isError || configuracao.isError) && (
        <p role="alert" className="text-xs text-destructive">
          {t("Não foi possível carregar todas as etiquetas.")}
        </p>
      )}
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {opcoes.map((tag) => (
          <label
            key={tag}
            className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 hover:bg-muted"
          >
            <input
              type="checkbox"
              aria-label={tag}
              checked={draft.includes(tag)}
              disabled={
                !podeEditar || mutation.isPending || (!draft.includes(tag) && draft.length >= 20)
              }
              onChange={(e) =>
                setDraft(e.target.checked ? [...draft, tag] : draft.filter((v) => v !== tag))
              }
            />
            <ChipDeEtiqueta
              tag={tag}
              cor={cores[tag] ?? CORES_KANBAN_PADRAO[tag]}
              className="max-w-full truncate text-xs"
            />
          </label>
        ))}
      </div>
      <div className="flex items-end justify-between gap-3 border-t pt-3">
        <p className="text-xs text-text-muted">
          {conversa.assigned_to_user_id ? (
            <>
              {t("Somente nesta conversa")}
              <br />
              {t("com")} {nome}
            </>
          ) : (
            t("Assuma a conversa para aplicar etiquetas.")
          )}
        </p>
        <Button
          size="sm"
          disabled={mutation.isPending}
          onClick={() => {
            if (!podeEditar || JSON.stringify(original) === JSON.stringify(draft)) {
              concluir();
              return;
            }
            mutation.mutate(
              {
                conversation_id: conversa.id,
                tags: draft,
                expected_assignee: conversa.assigned_to_user_id,
                expected_tags: original,
              },
              { onSuccess: concluir },
            );
          }}
        >
          {mutation.isPending ? t("Salvando…") : t("Concluir")}
        </Button>
      </div>
    </div>
  );
}
