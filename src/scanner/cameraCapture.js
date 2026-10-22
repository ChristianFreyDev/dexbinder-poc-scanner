/**
 * Captura de uma foto estática com expo-camera (câmera traseira).
 * API verificada na documentação oficial em 22/10/2026
 * (https://docs.expo.dev/versions/latest/sdk/camera/): `CameraView` +
 * `useCameraPermissions` + `takePictureAsync`.
 *
 * NÃO EXECUTADO em dispositivo nesta sessão (sem Android físico/emulador
 * disponível neste ambiente de desenvolvimento) — ver reports/decision.md.
 * Este módulo isola a chamada à câmera para que a tela (app/index.jsx)
 * não acople lógica de permissão/captura diretamente.
 */

/**
 * Captura uma foto estática a partir de uma ref de CameraView.
 * @param {import('expo-camera').CameraView} cameraRef
 * @param {{ torch?: boolean }} [options]
 */
async function captureStillPhoto(cameraRef, { torch = false } = {}) {
  if (!cameraRef) {
    throw new Error("cameraCapture: referência da câmera não disponível");
  }
  // skipProcessing:false mantém a correção de orientação da imagem, importante
  // para não embaralhar o recorte de nome/número feito depois (cropImage.js).
  const photo = await cameraRef.takePictureAsync({
    quality: 0.9,
    base64: false,
    exif: false,
    skipProcessing: false,
  });
  return { uri: photo.uri, width: photo.width, height: photo.height, torchUsed: torch };
}

module.exports = { captureStillPhoto };
