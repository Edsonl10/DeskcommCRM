"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useTransferConversation } from "@/hooks/inbox/useTransferConversation";
import { useDepartments } from "@/hooks/team/useDepartments";

interface Props { conversationId: string; open: boolean; onOpenChange: (v: boolean) => void; }
const ROLE_LABEL: Record<string, string> = { agent: "Atendente", manager: "Gestor", admin: "Admin" };

export function ReassignDialog({ conversationId, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const members = useAssignableMembers(open);
  const transfer = useTransferConversation();
  const departments = useDepartments();
  const [toUserId, setToUserId] = useState("");
  const [departmentId, setDepartmentId] = useState("direct");
  const [reason, setReason] = useState("");
  const selectedDepartment = (departments.data?.data ?? []).find((d) => d.id === departmentId);
  const options = (members.data ?? []).filter((m) =>
    m.user_id !== user.id && (!selectedDepartment || selectedDepartment.department_members.some((dm) => dm.user_id === m.user_id)),
  );
  function close(value: boolean) {
    if (!value) { setToUserId(""); setDepartmentId("direct"); setReason(""); }
    onOpenChange(value);
  }
  return <Dialog open={open} onOpenChange={close}><DialogContent className="sm:max-w-md">
    <DialogHeader><DialogTitle>Transferir conversa</DialogTitle><DialogDescription>Escolha uma pessoa, ou encaminhe para a fila de um departamento.</DialogDescription></DialogHeader>
    <div className="space-y-4">
      <div className="space-y-1.5"><Label htmlFor="reassign-department">Departamento</Label><Select value={departmentId} onValueChange={(value) => { setDepartmentId(value); setToUserId(""); }}><SelectTrigger id="reassign-department"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="direct">Sem departamento (atribuição direta)</SelectItem>{(departments.data?.data ?? []).filter((d) => d.is_active).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="reassign-target">Transferir para</Label><Select value={toUserId} onValueChange={setToUserId}><SelectTrigger id="reassign-target"><SelectValue placeholder={members.isLoading ? "Carregando atendentes…" : "Escolha o destino"} /></SelectTrigger><SelectContent>{selectedDepartment ? <SelectItem value="department">Distribuir para o setor</SelectItem> : null}{options.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.full_name ?? "Atendente " + m.user_id.slice(0, 8)} <span className="ml-1 text-muted-foreground">· {ROLE_LABEL[m.role] ?? m.role}</span></SelectItem>)}</SelectContent></Select>{!members.isLoading && !selectedDepartment && !options.length ? <p className="text-xs text-muted-foreground">Nenhum outro atendente disponível nesta organização.</p> : null}</div>
      <div className="space-y-1.5"><Label htmlFor="reassign-reason">Motivo (opcional)</Label><Textarea id="reassign-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: cliente pediu falar com o financeiro" maxLength={500} rows={2} /></div>
    </div>
    <DialogFooter><Button variant="ghost" onClick={() => close(false)}>Cancelar</Button><Button disabled={((!toUserId || toUserId === "department") && !selectedDepartment) || transfer.isPending} onClick={() => transfer.mutate({ conversation_id: conversationId, ...(toUserId && toUserId !== "department" ? { to_user_id: toUserId } : {}), ...(selectedDepartment ? { department_id: selectedDepartment.id } : {}), reason: reason.trim() || undefined }, { onSuccess: () => close(false) })}>{transfer.isPending ? "Transferindo…" : "Transferir"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
