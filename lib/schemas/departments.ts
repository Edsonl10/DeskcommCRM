import { z } from "zod";

const hexColor = /^#[0-9A-Fa-f]{6}$/;

export const departmentMemberSchema = z.object({
  user_id: z.string().uuid(),
  member_role: z.enum(["normal", "supervisor"]).default("normal"),
  receives_auto_distribution: z.boolean().default(true),
});

export const departmentSchema = z.object({
  name: z.string().trim().min(2).max(100),
  color: z.string().regex(hexColor).default("#16a34a"),
  distribution_method: z.enum(["manual", "round_robin", "least_loaded"]).default("manual"),
  only_online: z.boolean().default(true),
  contact_stickiness: z.boolean().default(false),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
  members: z.array(departmentMemberSchema).max(200).default([]),
});

export const updateDepartmentSchema = departmentSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Informe ao menos um campo para atualizar.",
);

export type DepartmentInput = z.infer<typeof departmentSchema>;
export type DepartmentMemberInput = z.infer<typeof departmentMemberSchema>;
