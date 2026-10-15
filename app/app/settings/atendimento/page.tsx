import { permanentRedirect } from "next/navigation";

/** Compatibilidade com favoritos e links antigos; os ajustes vivem em Equipe. */
export default function AtendimentoSettingsPage() {
  permanentRedirect("/app/team?aba=atendimento");
}
