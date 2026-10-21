"use client";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";

export function EntradaAutomatica({
  ligada,
  podeEditar,
}: {
  ligada: boolean;
  podeEditar: boolean;
}) {
  const t = useT();
  const [valor, setValor] = useState(ligada);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function salvar(proximo: boolean) {
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await apiClient.patch<{ data: { entrada_automatica: boolean } }>(
        "/api/v1/settings/entrada-funil",
        { entrada_automatica: proximo },
      );
      setValor(resposta.data.entrada_automatica);
    } catch (e) {
      setErro(e instanceof Error ? e.message : t("Falha ao salvar."));
    } finally {
      setSalvando(false);
    }
  }
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="entrada-automatica-funil" className="block font-medium">
          {t("Adicionar contatos automaticamente ao funil")}
        </label>
        <Switch
          id="entrada-automatica-funil"
          checked={valor}
          onCheckedChange={salvar}
          disabled={!podeEditar || salvando}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {t(
          valor
            ? "Ligado: novas conversas criam uma oportunidade automaticamente no funil configurado."
            : "Desligado: novas conversas ficam no atendimento. A equipe pode adicionar oportunidades manualmente.",
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        {t(
          "Vale para toda a equipe. Não remove oportunidades existentes. Ao religar, vale para as próximas mensagens; não importa o histórico. Automações e importações mantêm suas próprias regras.",
        )}
      </p>
      {!valor && (
        <p className="text-xs text-muted-foreground">
          {t(
            "Contatos fora do funil não participam dos acompanhamentos vinculados a oportunidades.",
          )}
        </p>
      )}
      {!podeEditar && (
        <p className="text-xs text-muted-foreground">
          {t("Somente administradores podem alterar esta configuração.")}
        </p>
      )}
      {salvando && <p role="status">{t("Salvando…")}</p>}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </Card>
  );
}
