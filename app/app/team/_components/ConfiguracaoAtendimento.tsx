/** Ajustes de atendimento com uma única superfície em Equipe → Atendimento. */
import { DEFAULT_VISIBILITY_MODE, type VisibilityMode } from "@/lib/auth/types";
import { routingConfigSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { loadChannelRoutingSettings } from "@/lib/routing/channel-policies";
import { configAssinatura } from "@/lib/messaging/assinatura";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";
import { AssinaturaForm } from "./AssinaturaForm";
import { ChannelRoutingForm } from "./ChannelRoutingForm";
import { AtendimentoForm } from "./AtendimentoForm";

export async function ConfiguracaoAtendimento({
  orgId,
  idioma,
}: {
  orgId: string;
  idioma: Idioma;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();

  const settings = ((data?.settings as Record<string, unknown> | null) ?? {}) as {
    routing?: unknown;
    visibility_mode?: VisibilityMode;
  };
  // `.catch(...)`: config antiga ou corrompida no jsonb não pode derrubar a
  // tela que serve justamente para consertá-la.
  const routing = routingConfigSchema
    .catch(routingConfigSchema.parse({}))
    .parse(settings.routing ?? {});
  const channels = await loadChannelRoutingSettings(supabase, orgId);
  const assinatura = configAssinatura(settings);
  const assinaturaInicial = {
    humanos: assinatura.humanos,
    ia: assinatura.ia,
    nome_ia: assinatura.nomeIa,
  };

  return (
    <section className="flex flex-col gap-6" aria-labelledby="atendimento-config-title">
      <header>
        <h2 id="atendimento-config-title" className="text-xl font-semibold tracking-tight">
          {traduzir("Distribuição de atendimento", idioma)}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {traduzir(
            "Quem recebe cada cliente novo, e o que cada atendente enxerga. As duas decisões andam juntas: distribuir sem restringir deixa todo mundo vendo a carteira do colega; restringir sem distribuir deixa o funil de cada um vazio.",
            idioma,
          )}
        </p>
      </header>

      <AtendimentoForm
        initial={{
          ...routing,
          visibility_mode: settings.visibility_mode ?? DEFAULT_VISIBILITY_MODE,
        }}
      />
      <ChannelRoutingForm initial={channels} />
      <AssinaturaForm initial={assinaturaInicial} />
    </section>
  );
}
