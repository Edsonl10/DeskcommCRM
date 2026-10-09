import { requireSupportWrite } from "@/lib/impersonate/support";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { updateDepartmentSchema, validateRequest, type DepartmentInput } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "departments" });
  if (!authz.ok) return authz.response;
  let input: Partial<DepartmentInput>;
  try { input = await validateRequest(updateDepartmentSchema, req); }
  catch (err) { if (err instanceof ApiError) return fail(err.code, err.message, err.status, { requestId }); throw err; }
  const admin = createAdminClient();
  if (input.is_default) {
    const { error } = await admin.from("departments").update({ is_default: false }).eq("organization_id", authz.org.orgId).eq("is_default", true).neq("id", id);
    if (error) return fail("internal_error", error.message, 500, { requestId });
  }
  const { members, ...department } = input;
  if (Object.keys(department).length) {
    const { error } = await admin.from("departments").update({ ...department, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", authz.org.orgId);
    if (error) return fail("unprocessable_entity", error.message, 422, { requestId });
  }
  if (members) {
    const { error: deleteError } = await admin.from("department_members").delete().eq("department_id", id).eq("organization_id", authz.org.orgId);
    if (deleteError) return fail("internal_error", deleteError.message, 500, { requestId });
    if (members.length) {
      const { error: insertError } = await admin.from("department_members").insert(members.map((m) => ({ ...m, organization_id: authz.org.orgId, department_id: id })));
      if (insertError) return fail("unprocessable_entity", insertError.message, 422, { requestId });
    }
  }
  const { data, error } = await admin.from("departments").select("id, name, color, distribution_method, only_online, contact_stickiness, is_default, is_active, created_at, updated_at, department_members(user_id, member_role, receives_auto_distribution)").eq("id", id).eq("organization_id", authz.org.orgId).maybeSingle();
  if (error || !data) return fail("not_found", "Departamento não encontrado.", 404, { requestId });
  await audit({ action: "department.updated", actorUserId: authz.user.id, organizationId: authz.org.orgId, resourceType: "department", resourceId: id, requestId });
  return ok(data, { requestId });
}
