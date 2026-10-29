"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { PALETA_DE_ETIQUETAS } from "@/lib/tags/cor-da-etiqueta";
import { CORES_KANBAN_PADRAO } from "@/lib/inbox/kanban";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChipDeEtiqueta } from "@/components/tags/ChipDeEtiqueta";
import { invalidarCoresDasEtiquetas, useCorDaEtiqueta } from "@/components/tags/CoresDasEtiquetas";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { cn } from "@/lib/utils";

const NOME_DO_TOM: Record<string, string> = {
  "#ffe629": "Amarelo",
  "#ffb224": "Âmbar",
  "#cf3716": "Vermelho",
  "#00655a": "Verde-água",
  "#0091ff": "Azul",
  "#3e63dd": "Índigo",
  "#ab4aba": "Roxo",
  "#6f6f6f": "Cinza",
};

/** Usa o vocabulário existente: a mesma etiqueta tem a mesma cor em todo o CRM. */
export function CorDaEtiquetaKanban({ tag, disabled }: { tag: string; disabled?: boolean }) {
  const t = useT();
  const queryClient = useQueryClient();
  const atual = useCorDaEtiqueta(tag);
  const [open, setOpen] = useState(false);
  const [cor, setCor] = useState<string | null>(atual);
  const mutation = useMutation({
    mutationFn: () => apiClient.post("/api/v1/tags/vocabulario", { acao: "definir_cor", tag, cor }),
    onSuccess: () => {
      invalidarCoresDasEtiquetas(queryClient);
      toast.success(t("Cor da etiqueta atualizada."));
      setOpen(false);
    },
    onError: showApiError,
  });
  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        if (next) setCor(atual);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          aria-label={`${t("Cor da etiqueta")} ${tag}`}
          className="h-7 gap-1.5 px-2"
        >
          <span
            aria-hidden="true"
            className="size-3 rounded-full border"
            style={{ backgroundColor: atual ?? CORES_KANBAN_PADRAO[tag] ?? undefined }}
          />
          {t("Cor")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="space-y-3"
        align="end"
        aria-label={`${t("Cor da etiqueta")} ${tag}`}
      >
        <p className="text-sm font-medium">
          {t("Cor da etiqueta")} · {tag}
        </p>
        <p className="text-xs text-text-muted">
          {t("Ao aplicar, a cor é salva nas listas e nos filtros de toda a organização.")}
        </p>
        <div className="flex flex-wrap gap-2">
          {PALETA_DE_ETIQUETAS.map((tom) => (
            <button
              key={tom}
              type="button"
              onClick={() => setCor(tom)}
              disabled={mutation.isPending}
              aria-label={t(NOME_DO_TOM[tom] ?? tom)}
              aria-pressed={cor === tom}
              title={tom}
              className={cn(
                "size-7 rounded-full border-2",
                cor === tom
                  ? "border-foreground ring-2 ring-ring ring-offset-1 ring-offset-background"
                  : "border-transparent",
              )}
              style={{ backgroundColor: tom }}
            />
          ))}
          <Button
            type="button"
            size="sm"
            variant={cor === null ? "default" : "outline"}
            disabled={mutation.isPending}
            aria-pressed={cor === null}
            onClick={() => setCor(null)}
          >
            {CORES_KANBAN_PADRAO[tag] ? t("Cor padrão") : t("Sem cor")}
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {t("Prévia:")}
          <ChipDeEtiqueta tag={tag} cor={cor ?? CORES_KANBAN_PADRAO[tag] ?? null} />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? t("Salvando…") : t("Aplicar cor")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
