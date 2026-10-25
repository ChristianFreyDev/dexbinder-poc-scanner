/**
 * Conversão pura "path cru de sistema de arquivos -> URI file://" —
 * extraída do bug real encontrado em dispositivo físico Android (25/10/2026):
 * `defaultDatabaseDirectory` (expo-sqlite) é um path cru (ex.:
 * "/data/user/0/<pacote>/files/SQLite"), não uma URI. Passar esse path cru
 * direto pro construtor de `File`/`Directory` do expo-file-system (que
 * exige URI) quebrava com `java.lang.IllegalArgumentException: URI is not
 * absolute` ao checar `file.exists`. Ver src/storage/catalogSync.js.
 */

function toFileUri(rawPath) {
  return rawPath.startsWith("file://") ? rawPath : `file://${rawPath}`;
}

module.exports = { toFileUri };
