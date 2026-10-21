"use client";
import { Children, isValidElement, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import {
  BLOCOS_DO_PAINEL,
  ROTULOS_DO_PAINEL,
  ordemDoPainel,
  type BlocoDoPainel,
} from "@/lib/inbox/painel-do-cliente";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Gear } from "@/lib/ui/icons";
import { toast } from "sonner";

export function BlocoPainel({ id, children }: { id: BlocoDoPainel; children: ReactNode }) {
  return (
    <div data-painel-bloco={id} className="min-w-0 border-b border-border pb-4 empty:hidden last:border-0">
      {children}
    </div>
  );
}

export function PainelDoCliente({ children }: { children: ReactNode }) {
  const { user, activeOrg } = useAuth();
  const t = useT();
  const qc = useQueryClient();
  const key = ["painel-cliente", activeOrg?.orgId];
  const config = useQuery({
    queryKey: key,
    enabled: !!activeOrg,
    queryFn: () =>
      apiClient.get<{ data: { ordem: BlocoDoPainel[] } }>("/api/v1/settings/painel-cliente"),
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
  const ordem = ordemDoPainel(config.data?.data.ordem);
  const admin =
    !!activeOrg &&
    user.support?.access_mode !== "support_readonly" &&
    (activeOrg.role === "admin" || (user.is_platform_admin && !user.support));
  const [draft, setDraft] = useState<BlocoDoPainel[] | null>(null);
  const [drag, setDrag] = useState<BlocoDoPainel | null>(null);
  const [salvando, setSalvando] = useState(false);
  function mover(id: BlocoDoPainel, destino: number) {
    setDraft((atual) => {
      if (!atual || destino < 0 || destino >= atual.length) return atual;
      const next = atual.filter((v) => v !== id);
      next.splice(destino, 0, id);
      return next;
    });
  }
  async function salvar() {
    if (!draft || salvando) return;
    setSalvando(true);
    try {
      const response = await apiClient.patch<{ data: { ordem: BlocoDoPainel[] } }>(
        "/api/v1/settings/painel-cliente",
        { ordem: draft },
      );
      qc.setQueryData(key, response);
      setDraft(null);
      toast.success(t("Padrão da equipe atualizado."));
    } catch (error) {
      showApiError(error);
      void config.refetch();
    } finally {
      setSalvando(false);
    }
  }
  const blocos = Children.toArray(children).sort((a, b) => {
    const index = (child: ReactNode) =>
      isValidElement<{ id?: BlocoDoPainel }>(child) && child.props.id
        ? ordem.indexOf(child.props.id)
        : BLOCOS_DO_PAINEL.length;
    return index(a) - index(b);
  });
  return (
    <aside
      className="flex h-full flex-col gap-4 overflow-y-auto border-l border-border bg-background p-4"
      data-testid="painel-cliente"
    >
      {admin && (
        <Button
          size="sm"
          variant="outline"
          className="self-end"
          disabled={config.isLoading || config.isError}
          onClick={() => setDraft([...ordem])}
        >
          <Gear size={14} className="mr-1" aria-hidden />
          {t("Configurar painel")}
        </Button>
      )}
      {config.isError && (
        <div role="status" className="text-xs">
          <p>{t("Não foi possível carregar a configuração do painel.")}</p>
          <Button size="sm" variant="ghost" onClick={() => void config.refetch()}>
            {t("Tentar novamente")}
          </Button>
        </div>
      )}
      {blocos}
      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open && !salvando) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Configurar painel")}</DialogTitle>
            <DialogDescription>
              {t("Arraste os blocos ou use as setas. A ordem será aplicada a toda a equipe.")}
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-1" aria-label={t("Ordem dos blocos")}>
            {draft?.map((id, i) => (
              <li
                key={id}
                draggable={!salvando}
                data-bloco-ordem={id}
                onDragStart={() => setDrag(id)}
                onDragEnd={() => setDrag(null)}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag) mover(drag, i);
                  setDrag(null);
                }}
                className="flex items-center gap-2 rounded-md border bg-background p-2 text-sm"
              >
                <span aria-hidden className="cursor-grab text-muted-foreground select-none">
                  ⠿
                </span>
                <span className="min-w-0 flex-1">{t(ROTULOS_DO_PAINEL[id])}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={salvando || i === 0}
                  aria-label={`${t("Mover para cima")}: ${t(ROTULOS_DO_PAINEL[id])}`}
                  onClick={() => mover(id, i - 1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={salvando || i === draft.length - 1}
                  aria-label={`${t("Mover para baixo")}: ${t(ROTULOS_DO_PAINEL[id])}`}
                  onClick={() => mover(id, i + 1)}
                >
                  ↓
                </Button>
              </li>
            ))}
          </ol>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={salvando}
              onClick={() => setDraft([...BLOCOS_DO_PAINEL])}
            >
              {t("Restaurar ordem original")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={salvando}
              onClick={() => setDraft(null)}
            >
              {t("Cancelar")}
            </Button>
            <Button type="button" disabled={salvando} onClick={() => void salvar()}>
              {salvando ? t("Salvando…") : t("Salvar padrão da equipe")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
