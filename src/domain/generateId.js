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
 * existe fora do runtime React Native) — por isso o fallback para o
 * `crypto.randomUUID()` nativo do Node, que existe desde o Node 19 e é usado
 * só nos testes automatizados (nunca no app rodando no celular).
 */

function generateId() {
  try {
    const { randomUUID } = require("expo-crypto");
    return randomUUID();
  } catch {
    return require("crypto").randomUUID();
  }
}

module.exports = { generateId };
