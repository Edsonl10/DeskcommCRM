import type pg from "pg";
import type { Logger } from "../obs/logger";
import { applyRequestHumanHandoff } from "./human-handoff";

/** Same handoff and department distributor as the conversation UI. Never sends WhatsApp. */
export async function handoffRouterDepartment(
  db: pg.Pool,
  input: {
    tenantId: string;
    leadId: string;
    conversationId: string;
    departmentId: string;
    intentName: string | null;
  },
  log: Logger,
) {
  const { rows } = await db.query<{ name: string }>(
    "select name from departments where organization_id=$1 and id=$2 and is_active",
    [input.tenantId, input.departmentId],
  );
  if (!rows[0]) throw new Error("router_department_unavailable");
  const message = await db.query<{ body: string | null }>(
    "select coalesce(nullif(body,''),media_derived_text) body from messages where organization_id=$1 and conversation_id=$2 and direction='inbound' order by sent_at desc,created_at desc,id desc limit 1",
    [input.tenantId, input.conversationId],
  );
  const result = await applyRequestHumanHandoff(
    db,
    input,
    {
      origem: "runtime_nativo",
      conversationSummary: `Triagem por intenção: ${input.intentName ?? "destino de reserva"}.`,
      log,
    },
    {
      departamento: rows[0].name,
      por_que: `O roteador selecionou o setor ${rows[0].name}.`,
      cliente_quer: message.rows[0]?.body?.trim().slice(0, 300) || "Atendimento da equipe.",
      o_que_tentei: [
        {
          o_que: "Identificação da intenção",
          desfecho: input.intentName ?? "Destino de reserva configurado",
        },
      ],
    },
  );
  if (!result.ok) throw new Error("router_department_handoff_failed");
}
