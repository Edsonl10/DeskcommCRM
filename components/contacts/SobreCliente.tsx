"use client";
import { useState } from "react";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useContact } from "@/hooks/contacts/useContact";
import { useUpdateContact } from "@/hooks/contacts/useUpdateContact";
import { useT } from "@/hooks/i18n/useT";
import { sobreCliente, MAX_SOBRE_CLIENTE } from "@/lib/contacts/sobre-cliente";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export function SobreCliente({ contactId }: { contactId: string }) {
  const t = useT();
  const { user, activeOrg } = useAuth();
  const q = useContact(contactId);
  const update = useUpdateContact(contactId);
  const [draft, setDraft] = useState<string | null>(null);
  const texto = sobreCliente(q.data?.data.custom_fields);
  const permitido =
    !!q.data &&
    !q.data.data.is_anonymized &&
    user.support?.access_mode !== "support_readonly" &&
    ((user.is_platform_admin && !user.support) || (activeOrg && activeOrg.role !== "viewer"));
  async function salvar() {
    if (draft === null || update.isPending) return;
    try {
      await update.mutateAsync({ sobre_cliente: draft.trim() });
      setDraft(null);
    } catch {
      /* rascunho permanece */
    }
  }
  if (q.isLoading) return <Skeleton className="mt-2 h-12 w-full" />;
  if (q.isError)
    return (
      <div className="mt-2 space-y-2">
        <p>{t("Erro ao carregar contato.")}</p>
        <Button size="sm" variant="outline" onClick={() => void q.refetch()}>
          {t("Tentar novamente")}
        </Button>
      </div>
    );
  return (
    <div className="mt-2 space-y-2" data-testid="sobre-cliente">
      {draft !== null && permitido ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
        >
          <Textarea
            autoFocus
            aria-label={t("Sobre o Cliente")}
            value={draft}
            maxLength={MAX_SOBRE_CLIENTE}
            rows={5}
            disabled={update.isPending}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex flex-wrap gap-1">
            <Button size="sm" type="submit" disabled={update.isPending}>
              {update.isPending ? t("Salvando…") : t("Salvar")}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              disabled={update.isPending}
              onClick={() => setDraft(null)}
            >
              {t("Cancelar")}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="text-sm wrap-anywhere whitespace-pre-wrap">
            {texto || t("Nenhuma informação sobre o cliente.")}
          </p>
          {permitido && (
            <Button size="sm" type="button" variant="outline" onClick={() => setDraft(texto)}>
              {t("Editar Sobre o Cliente")}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
