"use client";
import { useState } from "react";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useUpdateContact } from "@/hooks/contacts/useUpdateContact";
import {
  nomeDoContato,
  rotuloDoContato,
  type ContatoNomeavel,
} from "@/lib/contacts/rotulo-do-contato";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PencilSimple } from "@/lib/ui/icons";

interface Props {
  contact: ContatoNomeavel & { id: string; is_anonymized?: boolean };
  as?: "h1" | "h2" | "div";
  className?: string;
}

export function NomeDoContatoEditavel(props: Props) {
  const { user, activeOrg } = useAuth();
  const t = useT();
  const permitido =
    !props.contact.is_anonymized &&
    user.support?.access_mode !== "support_readonly" &&
    ((user.is_platform_admin && !user.support) || (activeOrg && activeOrg.role !== "viewer"));
  if (permitido) return <EditorNome key={props.contact.id} {...props} />;
  const Tag = props.as ?? "div";
  return (
    <Tag className={props.className} title={rotuloDoContato(props.contact, t)}>
      {rotuloDoContato(props.contact, t)}
    </Tag>
  );
}

function EditorNome({ contact, as: Tag = "div", className }: Props) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const update = useUpdateContact(contact.id);
  async function salvar() {
    const name = draft?.trim();
    if (!name || update.isPending) return;
    try {
      await update.mutateAsync({ name });
      setDraft(null);
    } catch {
      /* erro pelo hook; preserva o rascunho */
    }
  }
  if (draft !== null)
    return (
      <form
        className="min-w-0 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <Input
          autoFocus
          aria-label={t("Nome do contato")}
          value={draft}
          maxLength={200}
          disabled={update.isPending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !update.isPending) setDraft(null);
          }}
        />
        <div className="flex gap-1">
          <Button type="submit" size="sm" disabled={update.isPending || !draft.trim()}>
            {update.isPending ? t("Salvando…") : t("Salvar")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={update.isPending}
            onClick={() => setDraft(null)}
          >
            {t("Cancelar")}
          </Button>
        </div>
      </form>
    );
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Tag className={className} title={rotuloDoContato(contact, t)}>
        {rotuloDoContato(contact, t)}
      </Tag>
      {
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          aria-label={t("Editar nome do contato")}
          onClick={() => setDraft(nomeDoContato(contact) ?? "")}
        >
          <PencilSimple size={14} aria-hidden />
        </Button>
      }
    </div>
  );
}
