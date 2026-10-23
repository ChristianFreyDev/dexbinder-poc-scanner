/**
 * Lógica pura (sem I/O) de decisão "existe uma versão nova do catálogo pra
 * instalar?", extraída de catalogSync.js pra poder ser testada com
 * `node --test` — catalogSync.js em si não roda em Node puro (depende de
 * expo-file-system/expo-sqlite, só existem no runtime React Native, ver
 * confirmação real em reports/decision.md, seção 11.3).
 *
 * Regra: compara pelo checksum do banco (`dbSha256`), não pela data
 * (`generatedAt`) — o workflow grava um `generatedAt` novo a cada execução
 * horária mesmo sem conteúdo novo relevante (ver scripts/sync-full-catalog.js).
 */

/**
 * @param {object|null} localManifest manifesto da última sincronização deste aparelho, ou null se nunca sincronizou
 * @param {object} remoteManifest manifesto publicado atualmente
 * @returns {boolean} true se há uma versão diferente da instalada localmente
 */
function shouldUpdate(localManifest, remoteManifest) {
  return !localManifest || localManifest.dbSha256 !== remoteManifest.dbSha256;
}

module.exports = { shouldUpdate };
