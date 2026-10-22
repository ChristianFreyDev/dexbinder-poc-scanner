/**
 * Adaptador que isola a biblioteca de OCR escolhida. A tela/pipeline nunca
 * importa `rn-mlkit-ocr` ou `@react-native-ml-kit/text-recognition`
 * diretamente — sempre passa por `recognizeCardText()`.
 *
 * STATUS DESTA PoC (honestidade de execução):
 * - As chamadas abaixo seguem a API real e documentada da biblioteca
 *   (README oficial, consultado em 22/10/2026).
 * - `rn-mlkit-ocr` já foi instalado e compilado com sucesso (EAS Build
 *   real, seção 3.8 do relatório). Os crashes ao abrir o app NÃO eram
 *   causados por este módulo: a causa real era `package.json.main`
 *   apontando para `App.js` em vez de `expo/AppEntry` (ver
 *   reports/decision.md, seção 3.9/3.10), corrigida depois de reproduzir
 *   o crash em um emulador local e ler o stack trace real.
 * - Ainda NÃO confirmado: se `MlkitOcr.recognizeText()` de fato retorna
 *   texto reconhecido processando uma foto real de carta física — esse é
 *   o próximo teste, não um resultado já obtido.
 *
 * Candidato primário recomendado por esta PoC: `rn-mlkit-ocr` (ver
 * reports/decision.md, seção de biblioteca nativa) — construído como
 * Expo Module com plugin de config, com suporte à New Architecture
 * autodeclarado, que hoje é obrigatória em SDKs Expo recentes.
 *
 * Candidato alternativo (fallback documentado, NÃO instalado neste
 * projeto): `@react-native-ml-kit/text-recognition`. Importante: o Metro
 * (empacotador do React Native) resolve estaticamente TODO `require()`
 * presente no código-fonte, mesmo em um branch que nunca executa em
 * runtime — por isso um `require("@react-native-ml-kit/text-recognition")`
 * aqui QUEBRA o build (`Unable to resolve module`) assim que o pacote não
 * estiver em `node_modules`, mesmo que o app nunca selecione esse provedor.
 * Confirmado na prática: build real do EAS falhou exatamente por isso
 * (ver reports/decision.md). Por isso o fallback só é reativado quando
 * alguém de fato rodar `npm install @react-native-ml-kit/text-recognition`
 * — nesse momento, reintroduza o provider abaixo com seu próprio
 * `require()`, para que o Metro só precise resolvê-lo quando ele existir.
 */

const PROVIDERS = {
  /** rn-mlkit-ocr — ver https://github.com/ahmeterenodaci/rn-mlkit-ocr */
  "rn-mlkit-ocr": {
    async recognize(imageUri) {
      // eslint-disable-next-line import/no-unresolved, global-require
      const MlkitOcr = require("rn-mlkit-ocr").default;
      const result = await MlkitOcr.recognizeText(imageUri);
      return flattenBlocks(result.blocks, (b) => b.text);
    },
  },
};

function flattenBlocks(blocks, getText) {
  return (blocks || []).map(getText).filter(Boolean);
}

/**
 * @param {string} imageUri
 * @param {{ provider?: keyof typeof PROVIDERS }} [options]
 * @returns {Promise<string[]>} blocos de texto reconhecidos (uma entrada por bloco)
 */
async function recognizeCardText(imageUri, { provider = "rn-mlkit-ocr" } = {}) {
  const impl = PROVIDERS[provider];
  if (!impl) {
    throw new Error(`ocrAdapter: provedor desconhecido "${provider}"`);
  }
  try {
    return await impl.recognize(imageUri);
  } catch (err) {
    // Nunca inventar texto reconhecido: um erro do OCR deve resultar em
    // "não identificado", nunca em um candidato fabricado.
    throw new Error(`ocrAdapter: falha ao reconhecer texto (${provider}): ${err.message}`);
  }
}

module.exports = { recognizeCardText, PROVIDERS };
