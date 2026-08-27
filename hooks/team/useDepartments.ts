"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import type { DepartmentInput } from "@/lib/schemas/departments";

export interface DepartmentMember { user_id: string; member_role: "normal" | "supervisor"; receives_auto_distribution: boolean; }
export interface Department {
  id: string; name: string; color: string; distribution_method: "manual" | "round_robin" | "least_loaded";
  only_online: boolean; contact_stickiness: boolean; is_default: boolean; is_active: boolean;
  created_at: string; updated_at: string; department_members: DepartmentMember[];
}
const KEY = ["team", "departments"] as const;
export function useDepartments() { return useQuery({ queryKey: KEY, queryFn: () => apiClient.get<{ data: Department[] }>("/api/v1/departments") }); }
export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: DepartmentInput) => apiClient.post("/api/v1/departments", input), onSuccess: () => { toast.success("Departamento criado."); qc.invalidateQueries({ queryKey: KEY }); }, onError: showApiError });
}
export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: Partial<DepartmentInput> }) => apiClient.patch("/api/v1/departments/" + id, input), onSuccess: () => { toast.success("Departamento atualizado."); qc.invalidateQueries({ queryKey: KEY }); }, onError: showApiError });
}
