/**
 * Decisão pura "instalar o banco baixado ou não" — exigida pela
 * especificação da Entrega 1 (seção 4.2, itens 5-7): baixar em arquivo
 * temporário, validar checksum E integridade SQLite, e só então instalar
 * atomicamente; nunca substituir um banco válido por um arquivo parcial,
 * corrompido ou sem verificação.
 *
 * As checagens reais (calcular checksum de um arquivo de verdade, abrir
 * como SQLite) dependem de expo-file-system/expo-sqlite — não rodam em
 * Node puro (confirmado em catalogSyncDecision.js, mesma limitação). Esta
 * função recebe os RESULTADOS dessas checagens já computados pela camada de
 * I/O (catalogSync.js) e só decide o que fazer — por isso é testável aqui.
 */

const REASON = {
  OK: "ok",
  CHECKSUM_MISMATCH: "checksum_mismatch",
  SQLITE_INVALID: "sqlite_invalid",
};

/**
 * @param {object} params
 * @param {string} params.downloadedChecksum sha256 hex calculado sobre o arquivo temporário baixado
 * @param {string} params.expectedChecksum `dbSha256` do manifesto remoto
 * @param {boolean} params.sqliteIntegrityOk resultado de abrir o arquivo temporário como SQLite e rodar uma query simples
 * @returns {{ install: boolean, reason: string }}
 */
function decideInstall({ downloadedChecksum, expectedChecksum, sqliteIntegrityOk }) {
  // Checksum errado cobre tanto corrupção quanto download incompleto/
  // interrompido (um arquivo truncado nunca bate com o checksum esperado).
  if (!downloadedChecksum || downloadedChecksum.toLowerCase() !== String(expectedChecksum).toLowerCase()) {
    return { install: false, reason: REASON.CHECKSUM_MISMATCH };
  }
  if (!sqliteIntegrityOk) {
    return { install: false, reason: REASON.SQLITE_INVALID };
  }
  return { install: true, reason: REASON.OK };
}

module.exports = { decideInstall, REASON };
