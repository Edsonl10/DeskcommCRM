"use client";
import { lerPermissoesInbox, type InboxPermissions } from "@/lib/inbox/visoes";
import { useT } from "@/hooks/i18n/useT";
import { useId } from "react";
import type { Role } from "@/lib/auth/types";
import { NAV_GROUPS, type NavDestinationId } from "@/lib/navigation/catalogo";
import {
  destinosDaInterface,
  essencial,
  interfaceTemDestino,
  lerInterface,
  permitidos,
  type InterfaceSettings,
} from "@/lib/navigation/interface";

export function InterfaceEditor({
  value,
  onChange,
  role,
  inboxPermissions,
  onInboxPermissionsChange,
  disabled = false,
}: {
  value: InterfaceSettings;
  onChange: (value: InterfaceSettings) => void;
  role: Role;
  disabled?: boolean;
  inboxPermissions?: InboxPermissions;
  onInboxPermissionsChange?: (value: InboxPermissions) => void;
}) {
  const t = useT();
  const id = useId();
  const selected = new Set<string>(
    value.destinos ?? destinosDaInterface(value, false, role).map((d) => d.href),
  );
  const options = permitidos(false, role).filter((d) => !essencial(d, role));
  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-md border p-4">
      <legend className="px-1 text-sm font-medium">{t("Interface")}</legend>
      <p className="text-xs text-muted-foreground">{t("Define quais áreas aparecem na navegação. As permissões continuam sendo determinadas pelo papel. Links de conversas e avisos podem abrir áreas autorizadas que estejam ocultas.")}</p>
      <label htmlFor={id} className="block text-sm">{t("Perfil de interface")}</label>
      <select
        id={id}
        value={value.preset}
        onChange={(e) => onChange({ preset: e.target.value as InterfaceSettings["preset"] })}
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
      >
        <option value="completa">{t("Completa")}</option>
        <option value="simplificada">{t("Simplificada")}</option>
      </select>
      <p className="text-xs text-muted-foreground">{t("Trocar o perfil restaura sua seleção padrão. Perfil, segurança e acesso à equipe de quem administra continuam disponíveis.")}</p>
      {lerInterface(value).needsAdjustment && (
        <p role="status" className="text-sm">{t("A seleção contém áreas antigas. Confira e salve novamente.")}</p>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          {t("Personalizar áreas visíveis")}{value.destinos ? t(" (personalizada)") : ""}
        </summary>
        <div className="mt-3 max-h-64 space-y-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => {
            const items = options.filter((d) => d.group === group.id);
            if (!items.length) return null;
            return (
              <fieldset key={group.id} className="space-y-2">
                <legend className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                  {t(group.label)}
                </legend>
                {items.map((d) => (
                  <label key={d.href} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(d.href)}
                      onChange={(e) => {
                        const next = new Set(
                          options
                            .filter((option) => selected.has(option.href))
                            .map((option) => option.href),
                        );
                        if (e.target.checked) next.add(d.href);
                        else next.delete(d.href);
                        onChange({
                          preset: value.preset,
                          destinos: [...next] as NavDestinationId[],
                        });
                      }}
                      className="mt-1"
                    />
                    {t(d.label)}
                  </label>
                ))}
              </fieldset>
            );
          })}
          {onInboxPermissionsChange && (
            <fieldset className="space-y-2 border-t pt-3">
              <legend className="text-sm font-medium">{t("Permissões do Inbox")}</legend>
              <p className="text-xs text-muted-foreground">{t("Estas opções autorizam consultar conversas da equipe. Ativos e Aguardando continuam pessoais. Gestores e administradores têm visão global.")}</p>
              {([
                ["all", t("Ver Todos — atendimentos em andamento de toda a equipe.")],
                ["ai", t("Ver IA de toda a equipe.")],
                ["closed", t("Ver Fechadas de toda a equipe.")],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name={`inbox-permission-${key}`} disabled={role === "manager" || role === "admin"}
                    checked={role === "manager" || role === "admin" || lerPermissoesInbox(inboxPermissions)[key]}
                    onChange={(e) => onInboxPermissionsChange({ ...lerPermissoesInbox(inboxPermissions), [key]: e.target.checked })} />
                  {label}
                </label>
              ))}
              <p className="text-xs text-muted-foreground">{t("Todos inclui as conversas da IA. Alterar o perfil visual não altera estas permissões.")}</p>
            </fieldset>
          )}
        </div>
      </details>
      {!interfaceTemDestino(value, role) || value.destinos?.length === 0 ? (
        <p role="alert" className="text-sm text-destructive">{t("Selecione ao menos uma área de trabalho permitida ao papel.")}</p>
      ) : null}
    </fieldset>
  );
}
