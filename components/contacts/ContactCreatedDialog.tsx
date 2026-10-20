"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/hooks/i18n/useT";
import { useConversaNovaComEscolhaDeCanal } from "@/components/channels/SeletorDeCanalParaConversa";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import type { Contact } from "@/lib/types/contacts";

/** Mantém o contato salvo disponível ao cancelar o canal ou falhar a abertura. */
export function ContactCreatedDialog({
  contact,
  onClose,
}: {
  contact: Contact;
  onClose: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const { iniciarConversa, abrindo, seletor } = useConversaNovaComEscolhaDeCanal({
    aoAbrir: (conversationId) => {
      // O seletor só entrega a conversa depois do aceite seguro.
      onClose();
      router.push(`/app/inbox?id=${conversationId}&filter=active`);
    },
  });

  // Um diálogo por vez. Cancelar a escolha devolve a confirmação do cadastro,
  // sem perder o id retornado pela criação nem depender dos filtros da lista.
  if (seletor) return seletor;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !abrindo) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Contato criado")}</DialogTitle>
          <DialogDescription>{rotuloDoContato(contact, t)}</DialogDescription>
        </DialogHeader>
        {!contact.phone_number && (
          <p className="text-sm text-muted-foreground">
            {t("Adicione um telefone ao contato para iniciar uma conversa.")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={abrindo}>
            {t("Concluir")}
          </Button>
          {contact.phone_number && (
            <Button
              disabled={abrindo}
              aria-busy={abrindo}
              onClick={() => void iniciarConversa({ contact_id: contact.id })}
            >
              {abrindo ? t("Abrindo…") : t("Iniciar conversa")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
