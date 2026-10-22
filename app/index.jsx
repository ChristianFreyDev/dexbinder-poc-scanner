/**
 * Tela única do protótipo (Entrega 0 / PoC B): permissão de câmera →
 * captura → prévia com opção de refazer → OCR → candidatos com
 * confirmação manual obrigatória → busca manual sempre disponível.
 *
 * STATUS: escrito com as APIs reais e documentadas (expo-camera,
 * expo-image-manipulator, rn-mlkit-ocr — ver comentários em cada módulo
 * de src/scanner), mas NÃO executado em dispositivo físico nesta sessão
 * (sem Android SDK/emulador/aparelho conectado neste ambiente — ver
 * reports/decision.md para o runbook de validação real pendente).
 *
 * O índice local vem de um bundle único (app/assets/catalog-index.json),
 * gerado por scripts/export-index-bundle.js a partir das fixtures reais
 * da auditoria + do mapa real set->série (já filtra o Pokémon TCG Pocket).
 * Reexecute esse script sempre que as fixtures ou o mapa de séries mudarem.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Button, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

import indexBundle from "./assets/catalog-index.json";
import { captureStillPhoto } from "../src/scanner/cameraCapture";
import { generateCardCrops } from "../src/scanner/cropImage";
import { recognizeCardText } from "../src/scanner/ocrAdapter";
import { parseCardText } from "../src/scanner/parseCardText";
import { rankCandidates } from "../src/scanner/rankCandidates";
import { resolveImageUrl } from "../src/scanner/resolveImageUrl";

const LOCAL_INDEX = indexBundle.records;

function CandidateRow({ candidate, onConfirm, onExpandImage }) {
  const { record, score, reasons } = candidate;
  const thumbUrl = resolveImageUrl(record, "low");
  return (
    <View style={{ flexDirection: "row", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: "#eee" }}>
      {thumbUrl ? (
        <TouchableOpacity onPress={() => onExpandImage(record)} accessibilityLabel={`Ampliar imagem de ${record.name || "carta"}`}>
          <Image source={{ uri: thumbUrl }} style={{ width: 48, height: 67, borderRadius: 4 }} resizeMode="contain" />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 48, height: 67, backgroundColor: "#ddd", borderRadius: 4, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 10, textAlign: "center" }}>sem{"\n"}imagem</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "bold" }}>{record.name || "(sem nome)"}</Text>
        <Text style={{ fontSize: 12, color: "#555" }}>
          {record.setName || record.setId} · #{record.localId} · {record.sourceLanguage}
        </Text>
        <Text style={{ fontSize: 11, color: "#888" }}>
          score {score.toFixed(2)} — {reasons.join(", ")}
        </Text>
        <Button title="Confirmar esta carta" onPress={() => onConfirm(record)} />
      </View>
    </View>
  );
}

export default function ScannerPocScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  // "permission" | "ready" | "preview" | "processing" | "result" | "manual" | "confirmed"
  const [phase, setPhase] = useState("ready");
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [ocrResult, setOcrResult] = useState(null); // { parsed, candidates, needsManualConfirmation }
  const [errorMessage, setErrorMessage] = useState(null);
  const [confirmedRecord, setConfirmedRecord] = useState(null);

  const [manualQuery, setManualQuery] = useState("");
  const [manualResult, setManualResult] = useState(null);

  // Pedido real de quem testou o app: poder ampliar a imagem da carta pra
  // ler o texto nela, em vez de só a miniatura pequena da lista.
  const [expandedRecord, setExpandedRecord] = useState(null);

  const resetToReady = useCallback(() => {
    setPhase("ready");
    setCapturedPhoto(null);
    setOcrResult(null);
    setErrorMessage(null);
    setConfirmedRecord(null);
    setManualResult(null);
  }, []);

  const handleCapture = useCallback(async () => {
    setErrorMessage(null);
    try {
      const photo = await captureStillPhoto(cameraRef.current);
      setCapturedPhoto(photo);
      setPhase("preview"); // exige confirmação do usuário antes de processar — permite refazer a captura
    } catch (err) {
      setErrorMessage(err.message || String(err));
    }
  }, []);

  const handleRetake = useCallback(() => {
    setCapturedPhoto(null);
    setPhase("ready");
  }, []);

  const handleUsePhoto = useCallback(async () => {
    if (!capturedPhoto) return;
    setPhase("processing");
    setErrorMessage(null);
    try {
      const crops = await generateCardCrops(capturedPhoto.uri, capturedPhoto);
      // Achado real: rodar o OCR só na foto inteira lia mal (ou não lia)
      // o número de coleção, que ocupa uma fração minúscula da imagem.
      // Roda o OCR também nos recortes de cabeçalho/rodapé (ampliados
      // relativamente à foto inteira), e junta todo o texto reconhecido —
      // dá ao nome e ao número uma segunda e terceira chance de serem lidos
      // com mais nitidez. Cada recorte roda em sequência (não em paralelo)
      // para não sobrecarregar o módulo nativo de OCR com 3 chamadas
      // simultâneas; isso deixa o processamento mais lento, é uma troca
      // deliberada por mais acerto.
      const fullBlocks = await recognizeCardText(crops.fullUri, { provider: "rn-mlkit-ocr" });
      const headerBlocks = await recognizeCardText(crops.headerUri, { provider: "rn-mlkit-ocr" }).catch(() => []);
      const footerBlocks = await recognizeCardText(crops.footerUri, { provider: "rn-mlkit-ocr" }).catch(() => []);
      const textBlocks = [...headerBlocks, ...fullBlocks, ...footerBlocks];
      const parsed = parseCardText(textBlocks);
      const { candidates, needsManualConfirmation } = rankCandidates(parsed, LOCAL_INDEX, { topN: 5 });

      setOcrResult({ parsed, candidates, needsManualConfirmation });
      setPhase("result");
    } catch (err) {
      setErrorMessage(err.message || String(err));
      setPhase("result");
      setOcrResult({ parsed: { rawText: "" }, candidates: [], needsManualConfirmation: true });
    }
  }, [capturedPhoto]);

  const handleManualSearch = useCallback(() => {
    const query = manualQuery.trim();
    if (!query) {
      setManualResult(null);
      return;
    }
    const parsed = parseCardText(query.split(/\n|,/).map((s) => s.trim()).filter(Boolean));
    const { candidates, needsManualConfirmation } = rankCandidates(parsed, LOCAL_INDEX, { topN: 5 });
    setManualResult({ parsed, candidates, needsManualConfirmation });
  }, [manualQuery]);

  const handleConfirmCandidate = useCallback((record) => {
    // Confirmação manual explícita do usuário — nunca automática. Este
    // protótipo só exibe o resultado confirmado; ele NÃO grava nada em
    // inventário/checklist (isso é escopo do app final, fora desta PoC).
    setConfirmedRecord(record);
    setPhase("confirmed");
  }, []);

  const noneMatchMessage = useMemo(
    () => "Nenhum candidato corresponde à carta fotografada. Use a busca manual abaixo ou tente uma nova captura.",
    []
  );

  const imageModal = (
    <Modal visible={Boolean(expandedRecord)} transparent animationType="fade" onRequestClose={() => setExpandedRecord(null)}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center" }}
        activeOpacity={1}
        onPress={() => setExpandedRecord(null)}
        accessibilityLabel="Fechar imagem ampliada"
      >
        {expandedRecord && (
          <>
            <Image
              source={{ uri: resolveImageUrl(expandedRecord, "high") || resolveImageUrl(expandedRecord, "low") }}
              style={{ width: "90%", height: "70%" }}
              resizeMode="contain"
            />
            <Text style={{ color: "#fff", marginTop: 12, textAlign: "center", paddingHorizontal: 16 }}>
              {expandedRecord.name} — {expandedRecord.setName} #{expandedRecord.localId} ({expandedRecord.sourceLanguage})
            </Text>
            <Text style={{ color: "#ccc", marginTop: 8 }}>Toque em qualquer lugar para fechar</Text>
          </>
        )}
      </TouchableOpacity>
    </Modal>
  );

  if (!permission) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }

  const manualSearchBlock = (
    <View style={{ padding: 16, borderTopWidth: 1, borderColor: "#ddd", gap: 8 }}>
      <Text style={{ fontWeight: "bold" }}>Busca manual (sempre disponível)</Text>
      <TextInput
        value={manualQuery}
        onChangeText={setManualQuery}
        placeholder="Nome da carta e/ou número (ex.: Bulbasaur 001)"
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8 }}
      />
      <Button title="Buscar no índice local" onPress={handleManualSearch} />
      {manualResult && (
        <View>
          {manualResult.candidates.length === 0 && <Text>Nenhum resultado encontrado no índice local.</Text>}
          {manualResult.candidates.map((c, idx) => (
            <CandidateRow
              key={`${c.record.sourceCardId}-${idx}`}
              candidate={c}
              onConfirm={handleConfirmCandidate}
              onExpandImage={setExpandedRecord}
            />
          ))}
        </View>
      )}
    </View>
  );

  if (!permission.granted) {
    return (
      <ScrollView style={{ flex: 1 }}>
        <View style={{ alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ textAlign: "center", marginBottom: 12 }}>
            Sem acesso à câmera. A busca manual continua disponível abaixo (ver especificação, seção 16.4:
            permissão negada nunca bloqueia a pesquisa manual).
          </Text>
          <Button title="Permitir câmera" onPress={requestPermission} />
        </View>
        {manualSearchBlock}
        {imageModal}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }}>
      {(phase === "ready" || phase === "preview") && (
        <View style={{ height: 420 }}>
          {phase === "ready" && <CameraView ref={cameraRef} style={{ flex: 1 }} />}
          {phase === "preview" && capturedPhoto && (
            <Image source={{ uri: capturedPhoto.uri }} style={{ flex: 1 }} resizeMode="contain" />
          )}
        </View>
      )}

      <View style={{ padding: 16, gap: 8 }}>
        {phase === "ready" && <Button title="Capturar carta" onPress={handleCapture} />}

        {phase === "preview" && (
          <View style={{ gap: 8 }}>
            <Text>Confira o enquadramento antes de processar.</Text>
            <Button title="Usar esta foto" onPress={handleUsePhoto} />
            <Button title="Tirar outra foto" onPress={handleRetake} color="#A15C00" />
          </View>
        )}

        {phase === "processing" && (
          <View style={{ alignItems: "center", gap: 8 }}>
            <ActivityIndicator />
            <Text>Processando OCR e buscando candidatos no índice local...</Text>
          </View>
        )}

        {errorMessage && <Text style={{ color: "#B42318" }}>Erro: {errorMessage}</Text>}

        {phase === "result" && ocrResult && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontWeight: "bold" }}>Texto reconhecido (bruto):</Text>
            <Text selectable>{ocrResult.parsed.rawText || "(nenhum texto reconhecido)"}</Text>

            {ocrResult.needsManualConfirmation && (
              <Text style={{ color: "#A15C00", fontWeight: "bold" }}>
                Confirme manualmente — identificação ambígua ou pouco confiável.
              </Text>
            )}

            {ocrResult.candidates.length === 0 ? (
              <Text>{noneMatchMessage}</Text>
            ) : (
              ocrResult.candidates.map((c, idx) => (
                <CandidateRow
                  key={`${c.record.sourceCardId}-${idx}`}
                  candidate={c}
                  onConfirm={handleConfirmCandidate}
                  onExpandImage={setExpandedRecord}
                />
              ))
            )}

            <Button title="Nenhum candidato corresponde" onPress={() => setPhase("manual")} color="#A15C00" />
            <Button title="Nova captura" onPress={resetToReady} />
          </View>
        )}

        {phase === "manual" && (
          <View style={{ gap: 8 }}>
            <Text>{noneMatchMessage}</Text>
            <Button title="Nova captura" onPress={resetToReady} />
          </View>
        )}

        {phase === "confirmed" && confirmedRecord && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: "#17824B", fontWeight: "bold" }}>Identificação confirmada pelo usuário:</Text>
            <Text>
              {confirmedRecord.name} — {confirmedRecord.setName} #{confirmedRecord.localId} ({confirmedRecord.sourceLanguage})
            </Text>
            <Text style={{ fontSize: 12, color: "#667085" }}>
              Este protótipo não grava nada em inventário/checklist — a confirmação aqui serve só para a
              avaliação da PoC. Isso é escopo do app final.
            </Text>
            <Button title="Nova captura" onPress={resetToReady} />
          </View>
        )}
      </View>

      {manualSearchBlock}
      {imageModal}
    </ScrollView>
  );
}
