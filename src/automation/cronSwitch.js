/**
 * Lógica pura (sem I/O) de "reduzir a frequência do cron do workflow de
 * sincronização quando o catálogo completo terminar o primeiro ciclo".
 *
 * Pedido real (23/10/2026, mesma sessão que ligou .github/workflows/sync-catalog.yml):
 * depois que `scripts/sync-full-catalog.js` sincronizar todos os pares
 * set×idioma pela primeira vez (`complete: true` no manifesto), trocar
 * sozinho o cron de hora em hora pra cada 3 dias — sem depender de alguém
 * lembrar de editar o YAML manualmente (ver scripts/maybe-slow-down-cron.js,
 * que usa isto dentro do próprio workflow, via `git commit`+`push`).
 *
 * Decisão deliberada: só troca uma vez (idempotente — se a linha já estiver
 * na cadência lenta, não mexe de novo) e só quando `complete` for
 * explicitamente true — nunca "parece completo"/suposição.
 */

const FAST_CRON_LINE = /^(\s*- cron: )"7 \* \* \* \*"(.*)$/m;

function slowCronComment(nowIso) {
  const date = nowIso.slice(0, 10);
  return (
    `"7 7 */3 * *" # catálogo completo: roda a cada 3 dias a partir de ${date} ` +
    `(reduzido automaticamente quando o manifesto marcou complete:true pela primeira vez — ver scripts/maybe-slow-down-cron.js)`
  );
}

/**
 * @param {object} params
 * @param {string} params.workflowYaml conteúdo atual de .github/workflows/sync-catalog.yml
 * @param {boolean} params.manifestComplete valor de `complete` no manifesto gerado nesta execução
 * @param {string} params.nowIso data/hora atual em ISO (injetada, não `new Date()` direto, pra ficar testável)
 * @returns {{ changed: boolean, updatedYaml: string }}
 */
function maybeSlowDownCron({ workflowYaml, manifestComplete, nowIso }) {
  if (!manifestComplete || !FAST_CRON_LINE.test(workflowYaml)) {
    return { changed: false, updatedYaml: workflowYaml };
  }
  const updatedYaml = workflowYaml.replace(FAST_CRON_LINE, (_match, prefix) => `${prefix}${slowCronComment(nowIso)}`);
  return { changed: true, updatedYaml };
}

module.exports = { maybeSlowDownCron, FAST_CRON_LINE };
