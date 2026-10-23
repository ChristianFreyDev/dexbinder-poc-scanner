/**
 * Testes automatizados reais (node:test) da lógica pura de
 * src/automation/cronSwitch.js — a parte de I/O (ler/escrever o YAML do
 * workflow de verdade, git commit/push) fica em scripts/maybe-slow-down-cron.js
 * e no próprio workflow, não testável aqui.
 *
 * Executar: node --test scripts/run-cron-switch-tests.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { maybeSlowDownCron } = require("../src/automation/cronSwitch");

const FAST_YAML = `on:
  workflow_dispatch:
  schedule:
    - cron: "7 * * * *" # de hora em hora (minuto 7, não 0, por boa prática de agendamento)
`;

test("catálogo ainda não completo -> não mexe no cron", () => {
  const { changed, updatedYaml } = maybeSlowDownCron({
    workflowYaml: FAST_YAML,
    manifestComplete: false,
    nowIso: "2026-10-25T08:00:00.000Z",
  });
  assert.equal(changed, false);
  assert.equal(updatedYaml, FAST_YAML);
});

test("catálogo completo pela 1ª vez -> troca pra cadência de 3 em 3 dias", () => {
  const { changed, updatedYaml } = maybeSlowDownCron({
    workflowYaml: FAST_YAML,
    manifestComplete: true,
    nowIso: "2026-10-25T08:00:00.000Z",
  });
  assert.equal(changed, true);
  assert.match(updatedYaml, /cron: "7 7 \*\/3 \* \*"/);
  assert.match(updatedYaml, /2026-10-25/);
  // Não deve sobrar a linha antiga (hora em hora) no resultado.
  assert.doesNotMatch(updatedYaml, /cron: "7 \* \* \* \*"/);
});

test("já reduzido antes -> idempotente, não troca de novo", () => {
  const alreadySlowYaml = FAST_YAML.replace(
    '- cron: "7 * * * *" # de hora em hora (minuto 7, não 0, por boa prática de agendamento)',
    '- cron: "7 7 */3 * *" # catálogo completo: roda a cada 3 dias a partir de 2026-10-25'
  );
  const { changed, updatedYaml } = maybeSlowDownCron({
    workflowYaml: alreadySlowYaml,
    manifestComplete: true,
    nowIso: "2026-11-01T08:00:00.000Z",
  });
  assert.equal(changed, false);
  assert.equal(updatedYaml, alreadySlowYaml);
});

test("não mexe em nada fora da linha do cron (resto do YAML intacto)", () => {
  const { updatedYaml } = maybeSlowDownCron({
    workflowYaml: FAST_YAML,
    manifestComplete: true,
    nowIso: "2026-10-25T08:00:00.000Z",
  });
  assert.match(updatedYaml, /^on:\n {2}workflow_dispatch:\n {2}schedule:\n/);
});
