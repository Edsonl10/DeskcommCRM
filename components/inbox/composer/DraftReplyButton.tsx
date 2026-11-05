"use client";
import { useEffect, useRef } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Sparkle } from "@/lib/ui/icons";
import { useDraftReply } from "@/hooks/inbox/useDraftReply";

interface Props {
  conversationId: string;
  onDraft: (text: string) => void;
  disabled?: boolean;
}

/** Onda 5.1: botão "Sugerir resposta" — gera rascunho via agente publicado, sem enviar. */
export function DraftReplyButton({ conversationId, onDraft, disabled }: Props) {
  const t = useT();
  const mutation = useDraftReply();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-auto shrink-0 gap-1 rounded-full px-2.5 py-1 text-xs font-medium lg:h-auto"
      aria-label={t("Sugerir resposta")}
      aria-busy={mutation.isPending}
      title={t("Revise antes de enviar.")}
      disabled={disabled || mutation.isPending}
      onClick={() => {
        mutation.mutate(conversationId, {
          // O compositor desmonta o botão quando muda a conversa ou o modo.
          // Assim, uma geração antiga não preenche outro contexto.
          onSuccess: (res) => {
            if (mounted.current) onDraft(res.data.draft);
          },
        });
      }}
    >
      <Sparkle size={14} weight={mutation.isPending ? "duotone" : "regular"} aria-hidden />
      {t(mutation.isPending ? "Preparando…" : "Assistente")}
    </Button>
  );
}
