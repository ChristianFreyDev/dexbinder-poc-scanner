/**
 * Recorte da foto capturada: a carta inteira, e sub-recortes do cabeçalho
 * (nome) e da região do número de colecionador, para dar ao OCR regiões
 * menores e mais legíveis quando a foto permitir.
 *
 * Usa a API nova (contextual) do expo-image-manipulator, confirmada como
 * a recomendada atualmente pela documentação oficial em 22/10/2026
 * (a antiga `manipulateAsync` está marcada como deprecated).
 *
 * NÃO EXECUTADO em dispositivo nesta sessão — ver reports/decision.md.
 */

const { ImageManipulator } = require("expo-image-manipulator");

/**
 * @param {string} photoUri
 * @param {{ originX: number, originY: number, width: number, height: number }} cropRect
 */
async function cropRegion(photoUri, cropRect) {
  const context = ImageManipulator.manipulate(photoUri);
  const result = await context.crop(cropRect).renderAsync();
  const image = await result.saveAsync();
  return image.uri;
}

/**
 * Gera os três recortes usados pelo pipeline: carta inteira (já ajustada
 * pelo enquadramento da UI), cabeçalho (provável nome) e rodapé/numeração
 * (provável número de colecionador). As proporções são heurísticas de PoC
 * — a carta padrão Pokémon TCG tem proporção ~2.5:3.5; o nome fica na faixa
 * superior e o número de colecionador na faixa inferior central/direita.
 *
 * @param {string} photoUri
 * @param {{ width: number, height: number }} photoSize
 */
async function generateCardCrops(photoUri, photoSize) {
  const { width, height } = photoSize;

  const fullCard = { originX: 0, originY: 0, width, height };
  const headerRegion = {
    originX: Math.round(width * 0.05),
    originY: Math.round(height * 0.03),
    width: Math.round(width * 0.7),
    height: Math.round(height * 0.12),
  };
  const footerNumberRegion = {
    originX: Math.round(width * 0.55),
    originY: Math.round(height * 0.88),
    width: Math.round(width * 0.4),
    height: Math.round(height * 0.1),
  };

  const [fullUri, headerUri, footerUri] = await Promise.all([
    cropRegion(photoUri, fullCard),
    cropRegion(photoUri, headerRegion),
    cropRegion(photoUri, footerNumberRegion),
  ]);

  return { fullUri, headerUri, footerUri };
}

module.exports = { cropRegion, generateCardCrops };
