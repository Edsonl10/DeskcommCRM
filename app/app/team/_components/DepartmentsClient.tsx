"use client";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAttendants } from "@/hooks/team/useAttendants";
import { type Department, useCreateDepartment, useDepartments, useUpdateDepartment } from "@/hooks/team/useDepartments";
import { Buildings, PencilSimple, Plus, Sparkle } from "@/lib/ui/icons";

function useMethodLabels() {
  const t = useT();
  return { manual: t("Livre — entra na fila do setor"), round_robin: t("Sequencial — rodízio equilibrado"), least_loaded: t("Disponibilidade — menor carga") } as const;
}
type Draft = Pick<Department, "name" | "color" | "distribution_method" | "only_online" | "contact_stickiness" | "is_default" | "is_active"> & { members: Department["department_members"] };
const emptyDraft = (): Draft => ({ name: "", color: "#16a34a", distribution_method: "manual", only_online: true, contact_stickiness: false, is_default: false, is_active: true, members: [] });

function DepartmentDialog({ item, open, onOpenChange }: { item: Department | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const methods = useMethodLabels();
  const create = useCreateDepartment(); const update = useUpdateDepartment(); const roster = useAttendants();
  const [draft, setDraft] = useState<Draft>(() => item ? { ...item, members: item.department_members } : emptyDraft());
  const pending = create.isPending || update.isPending;
  const toggleMember = (userId: string) => setDraft((current) => ({ ...current, members: current.members.some((m) => m.user_id === userId) ? current.members.filter((m) => m.user_id !== userId) : [...current.members, { user_id: userId, member_role: "normal", receives_auto_distribution: true }] }));
  const setMember = (userId: string, patch: Partial<Draft["members"][number]>) => setDraft((current) => ({ ...current, members: current.members.map((m) => m.user_id === userId ? { ...m, ...patch } : m) }));
  const save = () => { if (item) update.mutate({ id: item.id, input: draft }, { onSuccess: () => onOpenChange(false) }); else create.mutate(draft, { onSuccess: () => onOpenChange(false) }); };
  const attendants = roster.data?.data ?? [];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>{item ? t("Editar departamento") : t("Criar departamento")}</DialogTitle><DialogDescription>{t("Defina a fila e quem recebe atendimentos deste setor.")}</DialogDescription></DialogHeader>
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_100px]"><div className="space-y-1.5"><Label htmlFor="department-name">{t("Nome")}</Label><Input id="department-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("Ex.: Financeiro")} /></div><div className="space-y-1.5"><Label htmlFor="department-color">{t("Cor")}</Label><Input id="department-color" type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></div></div>
      <div className="space-y-1.5"><Label>{t("Método de distribuição")}</Label><Select value={draft.distribution_method} onValueChange={(value) => setDraft({ ...draft, distribution_method: value as Draft["distribution_method"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(methods).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid gap-3 sm:grid-cols-3"><label className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">{t("Ativo")}<Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} /></label><label className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">{t("Padrão")}<Switch checked={draft.is_default} onCheckedChange={(v) => setDraft({ ...draft, is_default: v })} /></label><label className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">{t("Só online")}<Switch checked={draft.only_online} onCheckedChange={(v) => setDraft({ ...draft, only_online: v })} /></label></div>
      <div className="space-y-2"><div><Label>{t("Atendentes vinculados")}</Label><p className="text-xs text-muted-foreground">{t("Supervisor vê todos os atendimentos deste departamento. A chave de fila define quem recebe distribuição automática.")}</p></div>
        <div className="space-y-2 rounded-md border p-3">{attendants.map((attendant) => { const membership = draft.members.find((m) => m.user_id === attendant.user_id); return <div key={attendant.user_id} className="grid items-center gap-2 sm:grid-cols-[1fr_150px_130px]"><label className="flex items-center gap-2 text-sm"><Switch checked={!!membership} onCheckedChange={() => toggleMember(attendant.user_id)} /><span>{attendant.name ?? attendant.email ?? attendant.user_id.slice(0, 8)}</span></label>{membership ? <Select value={membership.member_role} onValueChange={(value) => setMember(attendant.user_id, { member_role: value as "normal" | "supervisor" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">{t("Normal")}</SelectItem><SelectItem value="supervisor">{t("Supervisor")}</SelectItem></SelectContent></Select> : <span />}{membership ? <label className="flex items-center gap-2 text-xs">{t("Na fila")}<Switch checked={membership.receives_auto_distribution} onCheckedChange={(value) => setMember(attendant.user_id, { receives_auto_distribution: value })} /></label> : <span />}</div>; })}{!attendants.length ? <p className="text-sm text-muted-foreground">{t("Ainda não há atendentes disponíveis para vincular.")}</p> : null}</div>
      </div>
    </div>
    <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancelar")}</Button><Button disabled={!draft.name.trim() || pending} onClick={save}>{pending ? t("Salvando…") : t("Salvar departamento")}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

export function DepartmentsClient({ canManage }: { canManage: boolean }) {
  const t = useT();
  const methods = useMethodLabels();
  const departments = useDepartments(); const [editing, setEditing] = useState<Department | null>(null); const [creating, setCreating] = useState(false);
  const list = departments.data?.data ?? [];
  return <div className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">{t("Departamentos")} ({list.length})</h2><p className="text-sm text-muted-foreground">{t("Setores, supervisores e distribuição de atendimentos.")}</p></div>{canManage ? <Button onClick={() => setCreating(true)}><Plus size={16} className="mr-1" />{t("Criar departamento")}</Button> : null}</div>
    {departments.isLoading ? <p className="text-sm text-muted-foreground">{t("Carregando departamentos…")}</p> : null}
    <div className="grid gap-3 lg:grid-cols-2">{list.map((department) => <Card key={department.id}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className="rounded-md p-2" style={{ backgroundColor: department.color }}><Buildings size={18} className="text-white" /></span><div><CardTitle className="text-base">{department.name}</CardTitle><CardDescription>{methods[department.distribution_method]}</CardDescription></div></div>{department.is_default ? <Badge><Sparkle size={13} className="mr-1" />{t("Padrão")}</Badge> : null}</div></CardHeader><CardContent className="flex items-center justify-between gap-2 text-sm"><span>{department.department_members.length} {t("atendente(s) vinculado(s)")}</span><div className="flex items-center gap-2"><Badge variant={department.is_active ? "default" : "outline"}>{department.is_active ? t("Ativo") : t("Inativo")}</Badge>{canManage ? <Button size="icon" variant="outline" aria-label={t("Editar") + " " + department.name} onClick={() => setEditing(department)}><PencilSimple size={16} /></Button> : null}</div></CardContent></Card>)}</div>
    {!departments.isLoading && !list.length ? <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{t("Crie o primeiro departamento para organizar a distribuição de atendimentos.")}</CardContent></Card> : null}
    <DepartmentDialog key={editing?.id ?? "edit-closed"} item={editing} open={!!editing} onOpenChange={(open) => !open && setEditing(null)} /><DepartmentDialog key={creating ? "create-open" : "create-closed"} item={null} open={creating} onOpenChange={setCreating} />
  </div>;
}
