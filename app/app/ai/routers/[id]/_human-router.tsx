"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useUpdateRouter, useTestRouter, type RouterDetail } from "@/hooks/ai/useRouters";
import {
  humanRouterFromConfig,
  humanRouterSchema,
  type HumanRouterConfig,
} from "@/lib/ai/agents/human-router";
import type { ClassifierModelOption } from "@/lib/ai/classifier-models";

type Department = { id: string; name: string };

export function HumanRouterPanel({
  router,
  departments,
  classifierModels,
  channelName,
}: {
  router: RouterDetail;
  departments: Department[];
  classifierModels: ClassifierModelOption[];
  channelName: string;
}) {
  const t = useT();
  const canManage = usePermission("ai.routers.manage");
  const canTest = usePermission("ai.routers.view");
  const stored = humanRouterFromConfig(router.config);
  const initial: HumanRouterConfig = stored.success
    ? stored.data
    : {
        fallback_department_id: "",
        routes: [{ intent_name: "", intent_description: "", examples: [], department_id: "" }],
      };
  const [policy, setPolicy] = React.useState(initial);
  const [name, setName] = React.useState(router.name);
  // Changing the destination mode starts inactive so it can be tested first.
  const [active, setActive] = React.useState(stored.success && router.is_active);
  const initialClassifier =
    typeof router.config.classifier_provider === "string" &&
    typeof router.config.classifier_model === "string"
      ? `${router.config.classifier_provider}::${router.config.classifier_model}`
      : "auto";
  const [classifier, setClassifier] = React.useState(initialClassifier);
  const [message, setMessage] = React.useState("");
  const update = useUpdateRouter(router.id);
  const test = useTestRouter(router.id);
  const dirty =
    !stored.success ||
    JSON.stringify(policy) !== JSON.stringify(initial) ||
    name !== router.name ||
    active !== router.is_active ||
    classifier !== initialClassifier;
  const parsed = humanRouterSchema.safeParse(policy);
  const available = new Set(departments.map((d) => d.id));
  const valid =
    name.trim().length > 0 &&
    parsed.success &&
    available.has(policy.fallback_department_id) &&
    policy.routes.every((r) => available.has(r.department_id));

  function selectDepartment(value: string, onChange: (id: string) => void, label: string) {
    return (
      <Select value={value || undefined} onValueChange={onChange} disabled={!canManage}>
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder={t("Escolha um setor")} />
        </SelectTrigger>
        <SelectContent>
          {departments.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  function patchRoute(index: number, patch: Partial<HumanRouterConfig["routes"][number]>) {
    setPolicy((p) => ({
      ...p,
      routes: p.routes.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
    test.reset();
  }
  async function save() {
    if (!parsed.success || !valid) return;
    const [provider, model] = classifier.split("::");
    try {
      await update.mutateAsync({
        name: name.trim(),
        is_active: active,
        fallback_agent_id: null,
        config: {
          human_routing: parsed.data,
          classifier_provider: classifier === "auto" ? null : provider,
          classifier_model: classifier === "auto" ? null : model,
        },
      });
      toast.success(t("Roteador salvo."));
      test.reset();
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/app/ai/routers" className="text-sm text-muted-foreground">
        ← {t("Roteadores")}
      </Link>
      <div>
        <h2 className="text-lg font-semibold">{t("Encaminhar para setores humanos")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Identifica o assunto e transfere para a fila do setor, usando a distribuição de atendentes já configurada. O roteador encerra a participação da IA após a transferência.",
          )}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <Label htmlFor="human-router-name">{t("Nome")}</Label>
            <Input
              id="human-router-name"
              value={name}
              maxLength={120}
              disabled={!canManage}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-sm">
              {t("Número de WhatsApp")}: {channelName}
            </p>
            <div className="flex items-center gap-2">
              <Switch
                id="human-router-active"
                checked={active}
                disabled={!canManage}
                onCheckedChange={setActive}
              />
              <Label htmlFor="human-router-active">{t("Ativo")}</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Salve inativo para testar antes de ativar no WhatsApp.")}
            </p>
            <Label>{t("Modelo classificador")}</Label>
            <Select value={classifier} onValueChange={setClassifier} disabled={!canManage}>
              <SelectTrigger aria-label={t("Modelo classificador")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("Automático (padrão da organização)")}</SelectItem>
                {classifierModels.map((m) => (
                  <SelectItem
                    key={`${m.provider}::${m.model_id}`}
                    value={`${m.provider}::${m.model_id}`}
                  >
                    {m.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label>{t("Setor de reserva")}</Label>
            {selectDepartment(
              policy.fallback_department_id,
              (id) => {
                setPolicy((p) => ({ ...p, fallback_department_id: id }));
                test.reset();
              },
              t("Setor de reserva"),
            )}
            <p className="text-xs text-muted-foreground">
              {t(
                "Recebe os assuntos sem intenção correspondente, com pouca confiança ou quando o classificador falhar.",
              )}
            </p>
            {departments.length === 0 && (
              <p role="alert">{t("Cadastre ao menos um setor ativo para continuar.")}</p>
            )}
          </Card>
          {policy.routes.map((r, i) => (
            <Card className="space-y-3 p-4" key={i}>
              <Label htmlFor={`human-intent-${i}`}>
                {t("Intenção")} {i + 1}
              </Label>
              <Input
                id={`human-intent-${i}`}
                value={r.intent_name}
                maxLength={120}
                disabled={!canManage}
                onChange={(e) => patchRoute(i, { intent_name: e.target.value })}
              />
              <Label htmlFor={`human-description-${i}`}>{t("Quando escolher esta intenção")}</Label>
              <Textarea
                id={`human-description-${i}`}
                value={r.intent_description}
                maxLength={2000}
                disabled={!canManage}
                onChange={(e) => patchRoute(i, { intent_description: e.target.value })}
              />
              <Label htmlFor={`human-examples-${i}`}>{t("Exemplos (um por linha)")}</Label>
              <Textarea
                id={`human-examples-${i}`}
                value={r.examples.join("\n")}
                disabled={!canManage}
                onChange={(e) => patchRoute(i, { examples: e.target.value.split("\n") })}
              />
              <Label>{t("Setor de destino")}</Label>
              {selectDepartment(
                r.department_id,
                (id) => patchRoute(i, { department_id: id }),
                `${t("Setor de destino")} ${i + 1}`,
              )}
              <Button
                variant="ghost"
                disabled={!canManage || policy.routes.length <= 1}
                onClick={() => {
                  setPolicy((p) => ({ ...p, routes: p.routes.filter((_, index) => index !== i) }));
                  test.reset();
                }}
              >
                {t("Remover intenção")}
              </Button>
            </Card>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!canManage || policy.routes.length >= 30}
              onClick={() =>
                setPolicy((p) => ({
                  ...p,
                  routes: [
                    ...p.routes,
                    { intent_name: "", intent_description: "", department_id: "", examples: [] },
                  ],
                }))
              }
            >
              {t("Adicionar intenção")}
            </Button>
            <Button
              disabled={!canManage || !valid || !dirty || update.isPending}
              onClick={() => void save()}
            >
              {update.isPending ? t("Salvando…") : t("Salvar roteador")}
            </Button>
          </div>
        </div>
        <Card className="h-fit space-y-3 p-4">
          <h3 className="font-medium">{t("Testar encaminhamento")}</h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "Mostra o setor que receberia a mensagem, sem transferir conversas nem enviar mensagens ao WhatsApp.",
            )}
          </p>
          <Label htmlFor="human-router-test">{t("Mensagem de teste")}</Label>
          <Textarea
            id="human-router-test"
            value={message}
            maxLength={4000}
            onChange={(e) => {
              setMessage(e.target.value);
              test.reset();
            }}
          />
          {dirty && (
            <p className="text-xs text-muted-foreground">
              {t("Salve as alterações antes de testar.")}
            </p>
          )}
          <Button
            disabled={!canTest || dirty || !message.trim() || test.isPending}
            onClick={() => test.mutate(message, { onError: showApiError })}
          >
            {test.isPending ? t("Testando…") : t("Testar encaminhamento")}
          </Button>
          {test.data && (
            <div role="status" className="rounded-md border p-3">
              <p>
                {t("Setor de destino")}:{" "}
                <strong>{test.data.department_name ?? t("Setor indisponível")}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                {test.data.destination_intent_name ?? t("Destino de reserva")}
              </p>
              {!test.data.destination_available && (
                <p role="alert">
                  {t("Confira se o setor ainda está ativo antes de ativar o roteador.")}
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
