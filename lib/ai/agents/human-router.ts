import { z } from "zod";

/** Optional destination policy on the existing router. No agent is needed. */
export const humanRouterSchema = z
  .object({
    fallback_department_id: z.string().uuid(),
    routes: z
      .array(
        z
          .object({
            intent_name: z.string().trim().min(1).max(120),
            intent_description: z.string().trim().min(1).max(2000),
            examples: z
              .array(z.string().trim().max(1000))
              .max(20)
              .transform((items) => items.filter(Boolean)),
            department_id: z.string().uuid(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .refine(
    (c) => new Set(c.routes.map((r) => r.intent_name.toLowerCase())).size === c.routes.length,
    {
      message: "Nomes de intenção repetidos.",
    },
  );
export type HumanRouterConfig = z.infer<typeof humanRouterSchema>;

export function humanRouterFromConfig(config: Record<string, unknown> | null | undefined) {
  return humanRouterSchema.safeParse(config?.human_routing);
}

export function humanRouterDepartments(config: HumanRouterConfig): string[] {
  return [
    ...new Set([config.fallback_department_id, ...config.routes.map((r) => r.department_id)]),
  ];
}
