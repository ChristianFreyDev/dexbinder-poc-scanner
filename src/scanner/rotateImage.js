/**
 * Gira uma imagem já capturada por um ângulo dado (graus, sentido horário).
 *
 * Achado real em dispositivo físico (22/10/2026): a tag EXIF Orientation
 * devolvida pela câmera NÃO é confiável para decidir automaticamente a
 * rotação certa neste app — o mesmo valor de Orientation apareceu em fotos
 * que precisavam de correções diferentes. Causa provável: ao fotografar um
 * álbum sobre a mesa, o celular fica quase na horizontal (apontado de cima
 * para baixo), e é justamente nessa posição que a detecção de orientação
 * por acelerômetro do Android fica ambígua/instável. Por isso a correção
 * automática por EXIF foi abandonada em favor de um botão "Girar" manual
 * na prévia (app/index.jsx), que usa esta função.
 */

const { ImageManipulator } = require("expo-image-manipulator");

/**
 * @param {string} photoUri
 * @param {number} degrees Sentido horário quando positivo.
 * @returns {Promise<{ uri: string, width: number, height: number }>}
 */
async function rotateImage(photoUri, degrees) {
  const context = ImageManipulator.manipulate(photoUri).rotate(degrees);
  const result = await context.renderAsync();
  const saved = await result.saveAsync();
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

module.exports = { rotateImage };
