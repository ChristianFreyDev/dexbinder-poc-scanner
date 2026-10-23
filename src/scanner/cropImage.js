/**
 * Recorte da foto capturada: a carta inteira, e sub-recortes do cabeçalho
 * (nome) e da região do número de colecionador, para dar ao OCR regiões
 * menores e mais legíveis quando a foto permitir.
 *
 * Usa a API nova (contextual) do expo-image-manipulator, confirmada como
 * a recomendada atualmente pela documentação oficial em 22/10/2026
 * (a antiga `manipulateAsync` está marcada como deprecated).
 *
 * Executado em dispositivo físico real (sessão de testes em casa,
 * 22-23/10/2026): os três recortes (carta inteira, cabeçalho, rodapé) são
 * gerados e passados ao OCR sem travar, e as proporções abaixo já foram
 * ajustadas a partir de achados reais (ver footerNumberRegion).
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
  // Achado real (testes em Android físico, 22/10/2026): a numeração não
  // foi lida em nenhuma das últimas fotos testadas — provável causa: o
  // recorte do rodapé era estreito (só os 40% da direita) e a posição
  // exata do número varia entre layouts de carta. Alargado para quase a
  // largura toda da faixa inferior, para não cortar o número fora do
  // recorte independente de estar mais à esquerda ou à direita.
  const footerNumberRegion = {
    originX: Math.round(width * 0.03),
    originY: Math.round(height * 0.85),
    width: Math.round(width * 0.94),
    height: Math.round(height * 0.13),
  };

  const [fullUri, headerUri, footerUri] = await Promise.all([
    cropRegion(photoUri, fullCard),
    cropRegion(photoUri, headerRegion),
    cropRegion(photoUri, footerNumberRegion),
  ]);

  return { fullUri, headerUri, footerUri };
}

module.exports = { cropRegion, generateCardCrops };
