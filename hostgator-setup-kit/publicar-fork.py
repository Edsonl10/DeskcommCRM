#!/usr/bin/env python3
"""Instala só o app do fork, por digest, sem alterar banco ou demais serviços."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.request

BACKUP_ROOT = Path("/opt/backups")


def executar(*args, capturar=True):
    return subprocess.check_output(args, text=True).strip() if capturar else subprocess.check_call(args)


def dc(*args):
    # Argumentos em argv; nenhum segredo ou texto interpolado no shell.
    return executar("bash", "-c", 'source hostgator-setup-kit/_common.sh; enter_project; dc "$@"', "dc", *args)


def inspecionar(ref, imagem=False):
    return json.loads(executar("docker", "image" if imagem else "container", "inspect", ref))[0]


def hash_arquivo(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def sem_pin(conteudo):
    return b"\n".join(l for l in conteudo.split(b"\n") if not l.startswith(b"APP_IMAGE="))


def gravar_pin(ref):
    env = Path(".env")
    conteudo = env.read_bytes()
    linhas = conteudo.splitlines(keepends=True)
    nova = f"APP_IMAGE={ref}\n".encode()
    encontrou = False
    for i, linha in enumerate(linhas):
        if linha.startswith(b"APP_IMAGE="):
            if encontrou:
                raise RuntimeError("APP_IMAGE duplicado no .env; recusei alterar a configuração.")
            linhas[i] = nova
            encontrou = True
    if not encontrou:
        linhas = [conteudo + (b"" if conteudo.endswith(b"\n") else b"\n"), nova]
    temporario = env.with_suffix(".publicacao.tmp")
    temporario.write_bytes(b"".join(linhas))
    os.chmod(temporario, env.stat().st_mode & 0o777)
    temporario.replace(env)


def saude():
    codigo = "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>r.json()).then(j=>process.stdout.write(JSON.stringify(j.data))).catch(()=>process.exit(1))"
    return json.loads(dc("exec", "-T", "app", "node", "-e", codigo))


def conferir_app(image_id, versao):
    ultimo = "sem resposta"
    for _ in range(30):
        try:
            atual = inspecionar(dc("ps", "-q", "app"))
            resultado = saude()
            if atual["Image"] == image_id and resultado.get("version") == versao and resultado.get("status") == "healthy":
                return resultado
            ultimo = f"versão/saúde divergente: {resultado.get('version')} / {resultado.get('status')}"
        except (subprocess.CalledProcessError, ValueError, KeyError):
            ultimo = "app ainda não respondeu"
        time.sleep(2)
    raise RuntimeError(ultimo)


def conferir_gates(repo, commit):
    url = f"https://api.github.com/repos/{repo}/commits/{commit}/check-runs?per_page=100"
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "publicar-fork"})
    with urllib.request.urlopen(req, timeout=30) as resposta:
        dados = json.load(resposta)
    if dados["total_count"] > 100:
        raise RuntimeError("Lista de checks incompleta; nenhuma instalação foi feita.")
    for nome in ("verify", "invariants", "build-and-size", "e2e", "imagens-ok"):
        checks = [c for c in dados["check_runs"] if c["name"] == nome and c["head_sha"] == commit and c.get("app", {}).get("slug") == "github-actions"]
        checks.sort(key=lambda c: c["id"], reverse=True)
        if not checks or checks[0]["conclusion"] != "success":
            raise RuntimeError(f"O check {nome} desta fonte ainda não está aprovado.")


def conferir_escopo(alterados):
    for f in alterados:
        if f.startswith(("supabase/", "workers/", "lib/", "docker/", "Dockerfile", "docker-compose")) or f in ("package.json", "pnpm-lock.yaml", "tsconfig.json"):
            raise RuntimeError(f"{f} exige atualização coordenada; este comando só troca o app.")


def publicar():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--commit", required=True)
    p.add_argument("--image", required=True)
    p.add_argument("--check", action="store_true", help="só preflight, sem pull, backup ou troca")
    args = p.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.commit):
        p.error("--commit precisa ser o SHA completo")
    if not re.fullmatch(r"ghcr\.io/[a-z0-9_.-]+/deskcommcrm@sha256:[0-9a-f]{64}", args.image):
        p.error("--image precisa ser a imagem do app no GHCR por digest")
    repo = executar("git", "remote", "get-url", "origin")
    m = re.fullmatch(r"https://github\.com/([\w.-]+/[\w.-]+?)(?:\.git)?", repo)
    if not m:
        raise RuntimeError("Origin precisa identificar o fork público no GitHub.")
    repo = m[1]
    if args.image.split("/")[1] != repo.split("/")[0].lower():
        raise RuntimeError("A imagem não pertence ao dono deste fork.")
    executar("git", "fetch", "origin", "main")
    executar("git", "merge-base", "--is-ancestor", args.commit, "origin/main")
    conferir_gates(repo, args.commit)
    sujos = executar("git", "status", "--porcelain", "--untracked-files=no").splitlines()
    if any(l[3:] != "Caddyfile" for l in sujos):
        raise RuntimeError("Há alterações locais além do Caddyfile; preserve-as antes de publicar.")
    executar("git", "merge-base", "--is-ancestor", "HEAD", args.commit)
    anterior = inspecionar(dc("ps", "-q", "app"))
    anterior_img = inspecionar(anterior["Image"], imagem=True)
    anterior_saude = saude()
    if anterior_saude.get("status") != "healthy":
        raise RuntimeError("O app atual precisa estar saudável antes da instalação.")
    origem = anterior_img["Config"].get("Labels", {}).get("org.opencontainers.image.revision", "")
    if not re.fullmatch(r"[0-9a-f]{40}", origem):
        raise RuntimeError("A imagem atual não identifica sua fonte; preflight recusado.")
    alterados = executar("git", "diff", "--name-only", origem, args.commit, "--").splitlines()
    conferir_escopo(alterados)
    print("PREFLIGHT_OK: fonte e cinco gates conferidos; atualização somente do app.", flush=True)
    if args.check:
        return
    executar("docker", "pull", args.image, capturar=False)
    nova_img = inspecionar(args.image, imagem=True)
    if nova_img["Config"].get("Labels", {}).get("org.opencontainers.image.revision") != args.commit:
        raise RuntimeError("Digest e fonte não correspondem.")
    versoes = [s.split("=", 1)[1] for s in nova_img["Config"].get("Env", []) if s.startswith("APP_VERSION=")]
    if len(versoes) != 1:
        raise RuntimeError("Imagem sem versão verificável.")
    agora = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")
    pasta = BACKUP_ROOT / f"crm-publicacao-{agora}"
    pasta.mkdir(mode=0o700, parents=True, exist_ok=False)
    os.chmod(pasta, 0o700)
    env_antes = Path(".env").read_bytes()
    caddy_antes = hash_arquivo("Caddyfile")
    shutil.copy2(".env", pasta / "env-anterior")
    os.chmod(pasta / "env-anterior", 0o600)
    shutil.copy2("Caddyfile", pasta / "Caddyfile")
    env_backup = dict(os.environ, BACKUP_DIR=str(pasta))
    subprocess.check_call(["bash", "hostgator-setup-kit/backup.sh"], env=env_backup)
    bancos = list(pasta.glob("db-*.sql.gz"))
    sessoes = list(pasta.glob("waha-*.tgz"))
    if len(bancos) != 1 or len(sessoes) != 1:
        raise RuntimeError("Backup de banco e sessões é obrigatório; o app continua na versão anterior.")
    executar("gzip", "-t", str(bancos[0]))
    executar("tar", "tzf", str(sessoes[0]))
    retorno = f"deskcomm-retorno:{agora}"
    executar("docker", "tag", anterior["Image"], retorno)
    if inspecionar(retorno, imagem=True)["Id"] != anterior["Image"]:
        raise RuntimeError("Não consegui preservar a imagem realmente em execução.")
    # Snapshot imediatamente antes da troca; não compara contagens com um backup antigo.
    outros = {c: inspecionar(c)["Image"] for c in dc("ps", "-q").splitlines() if c != anterior["Id"]}
    recibo = {"commit": args.commit, "image": args.image, "retorno": retorno, "anterior": anterior["Image"], "backup": str(pasta), "status": "preparado"}
    def registrar():
        (pasta / "recibo.json").write_text(json.dumps(recibo, indent=2) + "\n")
    registrar()
    trocou = False
    try:
        executar("git", "merge", "--ff-only", args.commit)
        if hash_arquivo("Caddyfile") != caddy_antes:
            raise RuntimeError("Caddyfile mudou; instalação recusada.")
        trocou = True
        gravar_pin(args.image)
        dc("up", "-d", "--no-deps", "--no-build", "--pull", "never", "app")
        recibo["health"] = conferir_app(nova_img["Id"], versoes[0])
        if sem_pin(Path(".env").read_bytes()) != sem_pin(env_antes):
            raise RuntimeError("Configuração além de APP_IMAGE mudou.")
        for c, image_id in outros.items():
            if inspecionar(c)["Image"] != image_id:
                raise RuntimeError("Um serviço que não era o app mudou.")
        recibo["status"] = "instalado"
        registrar()
        print(f"PUBLICACAO_CONFIRMADA: {args.commit}; recibo: {pasta / 'recibo.json'}")
    except Exception:
        if trocou:
            try:
                gravar_pin(retorno)
                dc("up", "-d", "--no-deps", "--no-build", "--pull", "never", "app")
                conferir_app(anterior["Image"], anterior_saude["version"])
                recibo["status"] = "retorno_confirmado"
                print("RETORNO_CONFIRMADO: imagem e saúde da versão anterior conferidas.", file=sys.stderr)
            except Exception:
                recibo["status"] = "retorno_falhou"
                print("RETORNO_FALHOU: exige intervenção; não declarei recuperação.", file=sys.stderr)
        else:
            recibo["status"] = "recusado_antes_da_troca"
        registrar()
        raise


def main():
    with open(".deskcomm-publicacao.lock", "w") as trava:
        fcntl.flock(trava, fcntl.LOCK_EX | fcntl.LOCK_NB)
        publicar()


if __name__ == "__main__":
    try:
        main()
    except Exception as erro:
        # Exceções de subprocess não incluem ambiente nem stdout com segredos.
        print(f"PUBLICACAO_RECUSADA: {erro}", file=sys.stderr)
        sys.exit(1)
