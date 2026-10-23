/**
 * CLI usado pelo workflow .github/workflows/sync-catalog.yml logo após gerar
 * dist/catalog/catalog-version.json: lê o manifesto desta execução e, se
 * `complete: true` (catálogo inteiro sincronizado pela primeira vez), reduz
 * a frequência do próprio cron de hora em hora pra cada 3 dias — editando o
 * YAML do workflow no disco. O passo seguinte do workflow faz `git diff` e só
 * commita/envia se este script realmente tiver mudado algo (idempotente).
 *
 * Roda a partir da raiz do repositório (como todo o resto dos scripts/*.js).
 */

const fs = require("fs");
const path = require("path");
const { maybeSlowDownCron } = require("../src/automation/cronSwitch");

const MANIFEST_PATH = path.join(__dirname, "..", "dist", "catalog", "catalog-version.json");
const WORKFLOW_PATH = path.join(__dirname, "..", ".github", "workflows", "sync-catalog.yml");

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.log(`maybe-slow-down-cron: ${MANIFEST_PATH} não existe ainda — nada a fazer.`);
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const workflowYaml = fs.readFileSync(WORKFLOW_PATH, "utf8");

  const { changed, updatedYaml } = maybeSlowDownCron({
    workflowYaml,
    manifestComplete: Boolean(manifest.complete),
    nowIso: new Date().toISOString(),
  });

  if (!changed) {
    console.log(
      manifest.complete
        ? "maybe-slow-down-cron: catálogo completo, mas o cron já está na cadência lenta — nada a fazer."
        : "maybe-slow-down-cron: catálogo ainda não completo — mantendo cron de hora em hora."
    );
    return;
  }

  fs.writeFileSync(WORKFLOW_PATH, updatedYaml);
  console.log(
    "maybe-slow-down-cron: catálogo completo pela primeira vez — cron reduzido para cada 3 dias em " + WORKFLOW_PATH
  );
}

main();
