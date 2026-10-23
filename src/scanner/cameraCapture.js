/**
 * Captura de uma foto estática com expo-camera (câmera traseira).
 * API verificada na documentação oficial em 22/10/2026
 * (https://docs.expo.dev/versions/latest/sdk/camera/): `CameraView` +
 * `useCameraPermissions` + `takePictureAsync`.
 *
 * Este módulo isola a chamada à câmera para que a tela (app/index.jsx)
 * não acople lógica de permissão/captura diretamente.
 */

/**
 * Captura uma foto estática a partir de uma ref de CameraView.
 *
 * Achado real em dispositivo físico (22/10/2026): a tag EXIF Orientation
 * da câmera não é confiável para corrigir a rotação automaticamente aqui
 * (ver src/scanner/rotateImage.js) — por isso a foto é devolvida como veio
 * da câmera, e a correção de orientação fica a cargo do botão "Girar"
 * manual na tela de prévia (app/index.jsx).
 * @param {import('expo-camera').CameraView} cameraRef
 * @param {{ torch?: boolean }} [options]
 */
async function captureStillPhoto(cameraRef, { torch = false } = {}) {
  if (!cameraRef) {
    throw new Error("cameraCapture: referência da câmera não disponível");
  }
  const photo = await cameraRef.takePictureAsync({
    quality: 0.9,
    base64: false,
    exif: false,
    skipProcessing: false,
  });

  return {
    uri: photo.uri,
    width: photo.width,
    height: photo.height,
    torchUsed: torch,
  };
}

module.exports = { captureStillPhoto };
