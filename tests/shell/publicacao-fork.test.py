"""Exercita a operação inteira com Docker/Git/API dublados, sem tocar a VPS."""
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

RAIZ = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("publicar", RAIZ / "hostgator-setup-kit/publicar-fork.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
SHA = "a" * 40
REF = "ghcr.io/edsonl10/deskcommcrm@sha256:" + "b" * 64


class Publicacao(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.temp.name)
        self.cwd = Path.cwd()
        os.chdir(self.raiz)
        Path(".env").write_bytes(b"SEGREDO=preservar\nAPP_IMAGE=pin-invalido\nOUTRO=igual\n")
        Path("Caddyfile").write_text("proxy local personalizado\n")
        self.env = Path(".env").read_bytes()
        self.atual = "old"
        self.falha = False
        self.retorno_falha = False
        self.recusado = False
        self.comandos = []

    def tearDown(self):
        os.chdir(self.cwd)
        self.temp.cleanup()

    def executar(self, *args, **kwargs):
        self.comandos.append(args)
        if args[:4] == ("git", "remote", "get-url", "origin"):
            return "https://github.com/Edsonl10/DeskcommCRM.git"
        if args[:3] == ("git", "diff", "--name-only"):
            return "app/app/inbox/page.tsx"
        return ""

    def dc(self, *args):
        self.comandos.append(args)
        if args[:2] == ("ps", "-q"):
            return "container-app" if len(args) == 3 else "container-app\ncontainer-waha"
        if args[0] == "up":
            alvo = "old" if b"deskcomm-retorno:" in Path(".env").read_bytes() else "new"
            if alvo == "old" and self.retorno_falha:
                raise RuntimeError("Docker recusou o retorno")
            self.atual = alvo
        return ""

    def inspect(self, ref, imagem=False):
        if ref == "container-waha":
            return {"Id": ref, "Image": "waha-preservado"}
        if not imagem:
            return {"Id": "container-app", "Image": self.atual}
        image_id = "new" if ref == REF else "old"
        return {"Id": image_id, "Config": {"Labels": {"org.opencontainers.image.revision": SHA if image_id == "new" else "c" * 40}, "Env": ["APP_VERSION=" + (SHA[:7] if image_id == "new" else "anterior")]}}

    def backup(self, args, env):
        pasta = Path(env["BACKUP_DIR"])
        (pasta / "db-1.sql.gz").write_text("dump conferido pelo comando gzip")
        (pasta / "waha-1.tgz").write_text("sessões conferidas pelo comando tar")

    def conferir(self, image_id, versao):
        if image_id == "new" and self.falha:
            raise RuntimeError("imagem nova não ficou saudável")
        if image_id == "old" and self.retorno_falha:
            raise RuntimeError("retorno não ficou saudável")
        self.assertEqual(self.atual, image_id)
        return {"version": versao, "status": "healthy"}

    def gates(self, *args):
        if self.recusado:
            raise RuntimeError("gate e2e ainda pendente")

    def rodar(self, *opcoes):
        with patch.object(sys, "argv", ["publicar", "--commit", SHA, "--image", REF, *opcoes]), \
             patch.object(mod, "executar", self.executar), patch.object(mod, "dc", self.dc), \
             patch.object(mod, "inspecionar", self.inspect), patch.object(mod, "saude", return_value={"version": "anterior", "status": "healthy"}), \
             patch.object(mod, "conferir_gates", self.gates), patch.object(mod, "conferir_app", self.conferir), \
             patch.object(mod, "BACKUP_ROOT", self.raiz / "backups"), patch.object(subprocess, "check_call", self.backup):
            mod.main()

    def recibo(self):
        return json.loads(next((self.raiz / "backups").glob("*/recibo.json")).read_text())

    def test_instala_digest_sem_tocar_sessoes_ou_outras_configuracoes(self):
        self.rodar()
        self.assertEqual(self.recibo()["status"], "instalado")
        self.assertEqual(mod.sem_pin(self.env), mod.sem_pin(Path(".env").read_bytes()))
        ups = [c for c in self.comandos if c[0] == "up"]
        self.assertEqual(ups, [("up", "-d", "--no-deps", "--no-build", "--pull", "never", "app")])

    def test_gate_pendente_recusa_antes_de_backup_ou_troca(self):
        self.recusado = True
        with self.assertRaisesRegex(RuntimeError, "pendente"):
            self.rodar()
        self.assertEqual(Path(".env").read_bytes(), self.env)
        self.assertFalse((self.raiz / "backups").exists())

    def test_check_nao_altera_a_instalacao(self):
        self.rodar("--check")
        self.assertEqual(Path(".env").read_bytes(), self.env)
        self.assertFalse(any(c[0] in ("up", "docker") for c in self.comandos))

    def test_erro_retorna_imagem_real_mesmo_com_pin_antigo_invalido(self):
        self.falha = True
        with self.assertRaisesRegex(RuntimeError, "nova não"):
            self.rodar()
        self.assertEqual(self.recibo()["status"], "retorno_confirmado")
        self.assertIn(b"APP_IMAGE=deskcomm-retorno:", Path(".env").read_bytes())
        self.assertEqual(self.atual, "old")

    def test_retorno_falho_nunca_gera_recibo_de_sucesso(self):
        self.falha = self.retorno_falha = True
        with self.assertRaises(RuntimeError):
            self.rodar()
        self.assertEqual(self.recibo()["status"], "retorno_falhou")
        self.assertEqual(self.recibo()["image_apos_falha"], "new")
        self.assertIn(f"APP_IMAGE={REF}".encode(), Path(".env").read_bytes())

    def test_dependencias_compartilhadas_exigem_atualizacao_coordenada(self):
        for caminho in ("lib/agent-engine/agent.ts", "supabase/baseline.sql", "workers/drain.ts", "package.json", "Dockerfile.worker"):
            with self.subTest(caminho=caminho), self.assertRaisesRegex(RuntimeError, "coordenada"):
                mod.conferir_escopo([caminho])
        mod.conferir_escopo(["app/app/inbox/page.tsx", "components/inbox/composer.tsx"])


class Gates(unittest.TestCase):
    def dados(self):
        return {"total_count": 5, "check_runs": [
            {"id": i, "name": nome, "head_sha": SHA, "conclusion": "success", "app": {"slug": "github-actions"}}
            for i, nome in enumerate(("verify", "invariants", "build-and-size", "e2e", "imagens-ok"))
        ]}

    def conferir(self, dados):
        with patch.object(mod.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(dados).encode())):
            mod.conferir_gates("Edsonl10/DeskcommCRM", SHA)

    def test_cinco_checks_da_fonte_exata(self):
        self.conferir(self.dados())

    def test_pendente_falho_cancelado_ou_pulado_nao_autorizam(self):
        for estado in (None, "failure", "cancelled", "skipped"):
            dados = self.dados()
            dados["check_runs"][0]["conclusion"] = estado
            with self.subTest(estado=estado), self.assertRaisesRegex(RuntimeError, "verify"):
                self.conferir(dados)

    def test_outra_fonte_ou_outro_app_nao_autorizam(self):
        for chave, valor in (("head_sha", "c" * 40), ("app", {"slug": "outro"})):
            dados = self.dados()
            dados["check_runs"][0][chave] = valor
            with self.subTest(chave=chave), self.assertRaisesRegex(RuntimeError, "verify"):
                self.conferir(dados)

    def test_lista_truncada_recusa(self):
        dados = self.dados()
        dados["total_count"] = 101
        with self.assertRaisesRegex(RuntimeError, "incompleta"):
            self.conferir(dados)


if __name__ == "__main__":
    unittest.main()
