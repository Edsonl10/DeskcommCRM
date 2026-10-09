import { requireSupportWrite } from "@/lib/impersonate/support";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { departmentSchema, validateRequest, type DepartmentInput } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const FIELDS = "id, organization_id, name, color, distribution_method, only_online, contact_stickiness, is_default, is_active, created_at, updated_at, department_members(user_id, member_role, receives_auto_distribution)";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "departments" });
  if (!authz.ok) return authz.response;
  const { data, error } = await createAdminClient()
    .from("departments")
    .select(FIELDS)
    .eq("organization_id", authz.org.orgId)
    .order("name");
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "departments" });
  if (!authz.ok) return authz.response;
  let input: DepartmentInput;
  try {
    input = await validateRequest(departmentSchema, req);
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { requestId });
    throw err;
  }
  const admin = createAdminClient();
  if (input.is_default) {
    const { error } = await admin.from("departments").update({ is_default: false }).eq("organization_id", authz.org.orgId).eq("is_default", true);
    if (error) return fail("internal_error", error.message, 500, { requestId });
  }
  const { members, ...department } = input;
  const { data: created, error } = await admin.from("departments").insert({ ...department, organization_id: authz.org.orgId }).select(FIELDS).single();
  if (error || !created) return fail("unprocessable_entity", error?.message ?? "Não foi possível criar o departamento.", 422, { requestId });
  if (members.length) {
    const { error: membersError } = await admin.from("department_members").insert(members.map((m) => ({ ...m, organization_id: authz.org.orgId, department_id: created.id })));
    if (membersError) return fail("unprocessable_entity", membersError.message, 422, { requestId });
  }
  await audit({ action: "department.created", actorUserId: authz.user.id, organizationId: authz.org.orgId, resourceType: "department", resourceId: created.id, requestId });
  return ok(created, { requestId });
}
