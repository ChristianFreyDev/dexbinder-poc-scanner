/**
 * Geração de UUID para identificadores de dados pessoais (especificação da
 * Entrega 2, seção 4.1, item 7: "IDs devem ser UUIDs ou equivalentes globais
 * adequados para uma futura sincronização na nuvem").
 *
 * O projeto não tinha nenhuma solução de UUID (confirmado: nada com "crypto"
 * em node_modules antes desta entrega). Verificado no runtime real: Hermes/
 * React Native (SDK 58) não expõe `crypto.randomUUID()` global, então foi
 * instalado `expo-crypto@58.0.7` (`npx expo install expo-crypto`, versão
 * compatível com o SDK confirmada pela própria Expo) — `Crypto.randomUUID()`
 * é a função real documentada na lib (ver node_modules/expo-crypto/build/
 * Crypto.d.ts).
 *
 * `require("expo-crypto")` lança no Node puro (mesma limitação documentada em
 * catalogSync.js para expo-file-system/expo-sqlite: o módulo nativo não
 * existe fora do runtime React Native). ACHADO REAL (`npx expo export`,
 * 26/10/2026): diferente de expo-file-system/expo-sqlite, um fallback para
 * `require("crypto")` (módulo nativo do Node) QUEBRA O BUNDLE DE VERDADE —
 * o Metro resolve `require()` estaticamente na montagem do grafo de
 * dependências, antes de qualquer execução, e falha com "Unable to resolve
 * module crypto" mesmo o require estando dentro de um try/catch nunca
 * alcançado em produção. Por isso o fallback aqui é 100% JavaScript puro
 * (v4 UUID via Math.random, sem nenhum módulo nativo) — usado só nos testes
 * automatizados em Node; o app no celular sempre usa o Crypto.randomUUID()
 * real do expo-crypto.
 */

function randomUuidV4Fallback() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateId() {
  try {
    const { randomUUID } = require("expo-crypto");
    return randomUUID();
  } catch {
    return randomUuidV4Fallback();
  }
}

module.exports = { generateId, randomUuidV4Fallback };
