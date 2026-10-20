import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporarios: string[] = [];
function temporario() {
  const dir = mkdtempSync(join(tmpdir(), "impacto-ci-"));
  temporarios.push(dir);
  return dir;
}
afterEach(() => temporarios.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const coletor = resolve("scripts/arquivos-alterados-ci.sh");
const yml = readFileSync(".github/workflows/publish-image.yml", "utf8");

describe("diff completo antes de poupar CI", () => {
  it.each([
    ["docs/runbooks/operacao.md\nPROJECT_STATE.md\nevidence/teste/recibo.txt", "sim"],
    ["docs/nota.md\napp/app/inbox/page.tsx", "nao"],
    ["tests/unit/seguranca.test.ts", "nao"],
    ["__IMPACTO_DESCONHECIDO__", "nao"],
    ["", "nao"],
  ])("perfil documental para %s → %s", (caminhos, esperado) => {
    expect(execFileSync("bash", ["scripts/ci-so-documentacao.sh"], { input: caminhos, encoding: "utf8" }).trim()).toBe(esperado);
  });
  it.each(["", "workflow_dispatch", "evento-desconhecido"])("%s sem prova de diff roda tudo", (evento) => {
    const saida = execFileSync("bash", [coletor], { env: { ...process.env, GITHUB_EVENT_NAME: evento }, encoding: "utf8" });
    for (const seletor of ["pr-mexe-na-imagem.sh", "pr-alcanca-o-e2e.sh"]) {
      expect(execFileSync("bash", [`scripts/${seletor}`], { input: saida, encoding: "utf8" }).trim()).toBe("sim");
    }
  });
  it("push com base ausente não se declara só documentação", () => {
    expect(execFileSync("bash", [coletor], { env: { ...process.env, GITHUB_EVENT_NAME: "push", BASE_SHA: "0".repeat(40), GITHUB_SHA: "a".repeat(40) }, encoding: "utf8" }).trim()).toBe("__IMPACTO_DESCONHECIDO__");
  });
  it("push considera todos os commits e ambos os lados de um renome", () => {
    const dir = temporario();
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "Teste", GIT_AUTHOR_EMAIL: "teste@example.invalid", GIT_COMMITTER_NAME: "Teste", GIT_COMMITTER_EMAIL: "teste@example.invalid" } }).trim();
    git("init", "-q");
    mkdirSync(join(dir, "lib"));
    writeFileSync(join(dir, "lib/negocio.ts"), "export const regra = true;\n");
    git("add", "."); git("commit", "-qm", "base"); const base = git("rev-parse", "HEAD");
    mkdirSync(join(dir, "docs")); git("mv", "lib/negocio.ts", "docs/nota.md"); git("commit", "-qm", "renome");
    writeFileSync(join(dir, "docs/mais.md"), "Mais documentação\n"); git("add", "."); git("commit", "-qm", "docs");
    const saida = execFileSync("bash", [coletor], { cwd: dir, env: { ...process.env, GITHUB_EVENT_NAME: "push", BASE_SHA: base, GITHUB_SHA: git("rev-parse", "HEAD") }, encoding: "utf8" });
    expect(saida).toContain("lib/negocio.ts"); expect(saida).toContain("docs/mais.md");
    expect(execFileSync("bash", ["scripts/pr-mexe-na-imagem.sh"], { input: saida, encoding: "utf8" }).trim()).toBe("sim");
  });
  it.each(["lib/inbox/iniciar-atendimento.ts", "lib/auth/require-role.ts", "supabase/baseline.sql", "components/inbox/Inbox.tsx"])("%s preserva a regressão completa", (caminho) => {
    expect(execFileSync("bash", ["scripts/pr-alcanca-o-e2e.sh"], { input: caminho, encoding: "utf8" }).trim()).toBe("sim");
  });
});

function sondaDoJob(job: string) {
  const bloco = yml.split(`  ${job}:\n`)[1]!.split(/^  [a-z][\w-]*:/m)[0]!;
  const depois = bloco.split("      - name: Carregar os artefatos publicados por digest\n")[1]!;
  return depois.split("        run: |\n")[1]!.split(/^      - /m)[0]!.split("\n").map((l) => l.slice(10)).join("\n");
}

describe("sonda executa o artefato publicado, sem outra construção", () => {
  function rodar(job: string, revisao = "a".repeat(40), arquitetura = "amd64", digest = "sha256:" + "b".repeat(64)) {
    const dir = temporario(); mkdirSync(join(dir, "bin")); mkdirSync(join(dir, "recibos"));
    for (const nome of ["deskcommcrm", "deskcomm-worker", "deskcomm-scheduler", "deskcomm-voice-agent"]) writeFileSync(join(dir, `recibos/${nome}-amd64.digest`), digest);
    writeFileSync(join(dir, "bin/docker"), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "$LOG"\nif [ "$1 $2" = "image inspect" ]; then\n if [[ "$*" == *Architecture* ]]; then echo "$ARQ_REAL"; else echo "$REV_REAL"; fi\nfi\n`, { mode: 0o755 });
    const resultado = spawnSync("bash", ["-c", sondaDoJob(job)], { cwd: dir, env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, GITHUB_REPOSITORY_OWNER: "Edsonl10", GITHUB_SHA: "a".repeat(40), REGISTRY: "ghcr.io", ARQUITETURA: "amd64", REV_REAL: revisao, ARQ_REAL: arquitetura, GITHUB_STEP_SUMMARY: "/dev/null", LOG: join(dir, "docker.log") }, encoding: "utf8" });
    return { ...resultado, dir };
  }
  it.each(["imagem-do-app-sobe", "imagens-de-fundo-sobem"])("%s puxa por digest e confere fonte/arquitetura", (job) => {
    const r = rodar(job); expect(r.status, r.stderr).toBe(0);
    const comandos = readFileSync(join(r.dir, "docker.log"), "utf8");
    expect(comandos).toContain("@sha256:"); expect(comandos).not.toContain("build ");
  });
  it("recusa digest que aponta para outra revisão", () => expect(rodar("imagem-do-app-sobe", "c".repeat(40)).status).not.toBe(0));
  it("recusa arquitetura divergente", () => expect(rodar("imagem-do-app-sobe", "a".repeat(40), "arm64").status).not.toBe(0));
  it("recusa recibo inválido antes do pull", () => expect(rodar("imagem-do-app-sobe", "a".repeat(40), "amd64", "tag-movel").status).not.toBe(0));
  it("manifesto só é unido após as duas sondas e usa os recibos por digest", () => {
    const job = yml.split("  juntar-manifestos:\n")[1]!.split(/^  [a-z][\w-]*:/m)[0]!;
    expect(job).toContain("needs: [a-tag-veio-da-main, build-and-push, imagem-do-app-sobe, imagens-de-fundo-sobem]");
    expect(job).toContain('"${repositorio}@${amd64}" "${repositorio}@${arm64}"');
    expect(job).not.toContain('"${tag}-amd64"');
  });
});
