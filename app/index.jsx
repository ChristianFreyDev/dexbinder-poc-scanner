/**
 * Tela de scanner — conteúdo da aba "Garimpo" da navegação principal
 * (especificação da Entrega 1, seção 4.8). Fluxo original da Entrega 0
 * preservado sem alterações: permissão de câmera → captura → prévia com
 * opção de refazer → OCR → candidatos com confirmação manual obrigatória
 * → busca manual sempre disponível. NUNCA grava nada em inventário/
 * checklist — só identifica e exibe (especificação, seção 4.5).
 *
 * Mudança real da Entrega 1: o índice local deixou de ser o bundle estático
 * de 58 cartas (app/assets/catalog-index.json, usado só pela Entrega 0) e
 * passou a vir do catálogo completo sincronizado via
 * src/catalog/catalogRepository.js — a tela bloqueia o scanner/busca manual
 * até o catálogo estar "ready" ou "offline_using_local" (nunca finge que
 * carregou, ver CatalogStatusBanner). COLORS/AppButton foram extraídos pra
 * app/theme.js e app/components/AppButton.jsx (reutilizados pelas outras
 * abas); o resto do visual (styles, cards, modais) continua aqui, sem
 * alteração do que já foi validado em dispositivo físico.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

import { captureStillPhoto } from "../src/scanner/cameraCapture";
import { generateCardCrops } from "../src/scanner/cropImage";
import { rotateImage } from "../src/scanner/rotateImage";
import { recognizeCardText } from "../src/scanner/ocrAdapter";
import { parseCardText } from "../src/scanner/parseCardText";
import { parseManualQuery } from "../src/scanner/parseManualQuery";
import { resolveImageUrl } from "../src/scanner/resolveImageUrl";
import { catalogRepository } from "../src/catalog/catalogRepository";
import { collectionProgressService } from "../src/collections";
import { COLORS } from "./theme";
import { AppButton, BUTTON_VARIANTS } from "./components/AppButton";
import { CatalogStatusBanner } from "./components/CatalogStatusBanner";
import { ScreenHeader } from "./components/ScreenHeader";
import { AddCopyModal } from "./components/AddCopyModal";

/** Botão circular com ícone vetorial (Feather/MaterialIcons), para ações compactas lado a lado. */
function IconButton({ icon, iconSet: IconSet = Feather, onPress, variant = "outline", accessibilityLabel, size = 52 }) {
  const variantStyle = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.outline;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.iconButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: variantStyle.bg,
          borderColor: variantStyle.border,
          borderWidth: variantStyle.border ? 1 : 0,
        },
        pressed && { opacity: 0.6 },
      ]}
    >
      <IconSet name={icon} size={Math.round(size * 0.42)} color={variantStyle.text} />
    </Pressable>
  );
}

// Bandeira por idioma de origem da carta (códigos presentes no índice local:
// ver app/assets/catalog-index.json). "pt" no TCGdex é português genérico
// (sem distinguir PT/BR), mas pedido explícito: usar a bandeira do Brasil.
// Um idioma fora desta lista some sem bandeira, nunca mostra uma errada.
const LANGUAGE_FLAGS = {
  en: "🇺🇸",
  pt: "🇧🇷",
  fr: "🇫🇷",
  de: "🇩🇪",
  ja: "🇯🇵",
  es: "🇪🇸",
  it: "🇮🇹",
  ko: "🇰🇷",
  zh: "🇨🇳",
};

function LanguageTag({ code }) {
  if (!code) return null;
  const flag = LANGUAGE_FLAGS[code.toLowerCase()];
  return (
    <Text style={styles.candidateMeta}>
      {flag ? `${flag} ` : ""}
      {code.toUpperCase()}
    </Text>
  );
}

/** Badge colorido de confiança a partir do score (0-1) do matching. */
function ScoreBadge({ score }) {
  const level = score >= 0.8 ? "alta" : score >= 0.6 ? "média" : "baixa";
  const palette =
    level === "alta"
      ? { bg: COLORS.successBg, text: COLORS.successText }
      : level === "média"
        ? { bg: COLORS.warningBg, text: COLORS.warningText }
        : { bg: COLORS.dangerBg, text: COLORS.dangerText };
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.text }]}>Confiança {level} · {Math.round(score * 100)}%</Text>
    </View>
  );
}

/**
 * Só formatação de texto na tela — não mexe nos valores de
 * src/scanner/rankCandidates.js (já validado, 36 testes), que continua
 * devolvendo os motivos em minúsculo (ex.: "nome exato").
 */
function capitalizeFirst(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Pedido real do usuário (25/10/2026): uma linha separada com código da
 * expansão impresso na carta (ex.: "MEW", "DRI" — vem de verdade da API do
 * TCGdex, `abbreviation.official`, gravado como `setPrintedCode` por
 * scripts/sync-full-catalog.js; ausente só nos sets que a própria API não
 * documenta um código, nunca inventado aqui) + número/total impresso (ex.:
 * "061/165"). Usa `setOfficial` (contagem OFICIAL impressa na carta, ex.:
 * 165/182) — achado real ao testar com a carta "034/182" do Ethan's
 * Typhlosion (set "151", "Destined Rivals"): `setTotal` inclui secretas/
 * variantes especiais fora da numeração impressa (ex.: 244 em vez de 182
 * no "Destined Rivals") e mostraria um total errado.
 */
function buildCardCodeLine(record) {
  const parts = [];
  if (record.setPrintedCode) parts.push(record.setPrintedCode);
  if (record.localId) parts.push(record.setOfficial ? `${record.localId}/${record.setOfficial}` : record.localId);
  return parts.join(" · ");
}

function CandidateRow({ candidate, onConfirm, onExpandImage, canLoadImage = true, onImageSettled }) {
  const { record, score, reasons } = candidate;
  const thumbUrl = resolveImageUrl(record, "low");
  const cardCodeLine = buildCardCodeLine(record);
  // Achado real (25/10/2026, medido em dispositivo físico): a miniatura
  // "low" do TCGdex pode levar de 3,5 a 34s pra carregar dependendo da
  // rede do usuário (CDN responde rápido quando testado de outros lugares
  // — throughput/sinal do lado do cliente, não um bug aqui). O sistema de
  // miniaturas bem pequenas pré-empacotadas (scripts/sync-thumbnails.js,
  // ~1KB cada) resolveria isso, mas ainda não está disponível (gated até
  // o catálogo completo terminar — ver reports/decision.md, seção 11.3).
  // Por ora, só mostra claramente que está carregando em vez de parecer
  // travado.
  //
  // Achado real (25/10/2026, regressão própria): usei StyleSheet.
  // absoluteFillObject (dimensão implícita) na miniatura e a imagem parou
  // de carregar — EXATAMENTE a mesma classe de bug já documentada no modal
  // de imagem ampliada desta tela (ver imageModal, abaixo): <Image> com
  // dimensão implícita/em "%" não renderiza de forma confiável neste RN/
  // Android. Corrigido com width/height explícitos (mesmos valores de
  // styles.candidateThumb), igual o modal já fazia.
  const [imageLoading, setImageLoading] = useState(Boolean(thumbUrl));

  // Achado real do usuário (25/10/2026): as miniaturas de todas as cartas
  // começavam a baixar em paralelo assim que a lista aparecia — a imagem
  // de uma carta mais abaixo (ex.: a 2ª, em inglês) podia terminar de
  // baixar antes da 1ª, dando a impressão de que a ordem de carregamento
  // não batia com a ordem exibida. `canLoadImage` (controlado pelo
  // CandidateList abaixo) só libera o <Image> desta linha depois que a
  // anterior na lista já terminou (sucesso ou erro) — carrega sempre na
  // mesma ordem mostrada ao usuário. Carta sem imagem (thumbUrl nulo)
  // libera a próxima na hora, sem travar a fila esperando algo que nunca
  // vai carregar.
  useEffect(() => {
    if (canLoadImage && !thumbUrl && onImageSettled) onImageSettled();
  }, [canLoadImage, thumbUrl, onImageSettled]);

  const handleImageSettled = () => {
    setImageLoading(false);
    if (onImageSettled) onImageSettled();
  };

  return (
    <View style={styles.candidateCard}>
      {/* Achado real (25/10/2026): com a miniatura (106px) e o texto na
          mesma linha flex, a altura da LINHA sempre batia 106px (a altura do
          maior filho) mesmo quando o texto era bem mais curto — por isso os
          motivos, colocados como irmão logo abaixo dessa linha, sempre
          ficavam "presos" a essa altura de 106px, longe da confiança.
          Miniatura flutua (position: absolute) por cima de um container
          com altura MÍNIMA de 106px (nunca corta a miniatura), mas o bloco
          de texto (nome/expansão/código/confiança/motivos) fica em fluxo
          normal, do lado dela — sua altura real (que pode passar de 106px
          quando os motivos quebram linha) é que manda, não a da miniatura. */}
      {/* Pedido do usuário (25/10/2026): o botão "Confirmar" deve ficar
          sempre no meio/centro vertical do card. Botão como irmão NUMA LINHA
          (flex:1 + botão) tinha reduzido a largura do bloco de texto
          inteiro — inclusive os motivos, que voltaram a quebrar mais linha.
          Botão agora também flutua (position: absolute, like a miniatura),
          ancorado à direita e centralizado verticalmente com
          top:0/bottom:0/justifyContent:"center" — não reduz a largura de
          nenhum texto. Nome/expansão/código/confiança reservam um respiro à
          direita (paddingRight) pra nunca ficar embaixo do botão; os
          motivos continuam com a largura total (não precisam — já são a
          última linha, abaixo de onde o botão fica). */}
      <View style={{ minHeight: 106 }}>
        {thumbUrl ? (
          <TouchableOpacity
            style={{ position: "absolute", left: 0, top: 0 }}
            onPress={() => onExpandImage(record)}
            accessibilityLabel={`Ampliar imagem de ${record.name || "carta"}`}
          >
            <View style={styles.candidateThumb}>
              {canLoadImage && (
                <Image
                  source={{ uri: thumbUrl }}
                  style={{ width: 76, height: 106, borderRadius: 8 }}
                  resizeMode="contain"
                  onLoadEnd={handleImageSettled}
                  onError={handleImageSettled}
                />
              )}
              {imageLoading && (
                <ActivityIndicator
                  style={{ position: "absolute", width: 76, height: 106 }}
                  color={COLORS.primary}
                  size="small"
                />
              )}
            </View>
          </TouchableOpacity>
        ) : (
          <View style={[styles.candidateThumb, styles.candidateThumbPlaceholder, { position: "absolute", left: 0, top: 0 }]}>
            <Text style={{ fontSize: 10, color: COLORS.textMuted, textAlign: "center" }}>sem{"\n"}imagem</Text>
          </View>
        )}
        <View style={{ position: "absolute", right: 0, top: 0, bottom: 0, justifyContent: "center" }}>
          <AppButton title="Confirmar" variant="successOutline" compact onPress={() => onConfirm(record)} />
        </View>
        <View style={{ marginLeft: 88, gap: 4 }}>
          <Text style={[styles.candidateName, { paddingRight: 100 }]}>{record.name || "(sem nome)"}</Text>
          {/* Pedido do usuário (25/10/2026, testado com nome de expansão
              propositalmente grande): a expansão/coleção também precisa da
              largura total, igual os motivos — reservar espaço pro botão
              aqui fazia ela quebrar em 2 linhas sem necessidade. */}
          <Text style={styles.candidateSet}>{record.setName || record.setId || "Expansão desconhecida"}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap", paddingRight: 100 }}>
            {cardCodeLine ? <Text style={styles.candidateMeta}>{cardCodeLine} ·</Text> : null}
            <LanguageTag code={record.sourceLanguage} />
          </View>
          <ScoreBadge score={score} />
          <Text style={styles.candidateReasons}>{reasons.map(capitalizeFirst).join(" · ")}</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Lista de candidatos com carregamento de miniatura SEQUENCIAL, na mesma
 * ordem exibida (ver achado real documentado em CandidateRow acima). Usada
 * nos dois lugares que listam candidatos (resultado do scanner e da busca
 * manual) pra garantir o mesmo comportamento nos dois.
 */
function CandidateList({ candidates, onConfirm, onExpandImage }) {
  const [readyIndex, setReadyIndex] = useState(0);

  useEffect(() => {
    setReadyIndex(0);
  }, [candidates]);

  const advancePast = useCallback((idx) => {
    setReadyIndex((current) => (idx === current ? current + 1 : current));
  }, []);

  return (
    <View style={{ gap: 10 }}>
      {candidates.map((c, idx) => (
        <CandidateRow
          key={`${c.record.sourceCardId}-${idx}`}
          candidate={c}
          onConfirm={onConfirm}
          onExpandImage={onExpandImage}
          canLoadImage={idx <= readyIndex}
          onImageSettled={() => advancePast(idx)}
        />
      ))}
    </View>
  );
}

export default function ScannerPocScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  // Estado real de sincronização do catálogo completo (especificação,
  // seção 4.2, item 10) — o scanner só fica utilizável depois que o
  // catálogo estiver "ready" ou "offline_using_local" (há banco local
  // íntegro utilizável mesmo sem rede). Nunca finge que carregou.
  const [catalogStatus, setCatalogStatus] = useState("checking");
  const [catalogError, setCatalogError] = useState(null);
  const [catalogManifest, setCatalogManifest] = useState(null);

  const syncCatalog = useCallback(async () => {
    setCatalogError(null);
    const result = await catalogRepository.ensureReady({ onStatusChange: setCatalogStatus });
    setCatalogStatus(result.status);
    setCatalogManifest(result.manifest);
    setCatalogError(result.error);
  }, []);

  useEffect(() => {
    syncCatalog();
  }, [syncCatalog]);

  const catalogUsable = catalogStatus === "ready" || catalogStatus === "offline_using_local";
  // Achado real: <Image> com width/height em "%" dentro de um container
  // flex centralizado às vezes não renderiza no modal de ampliação
  // (pegadinha conhecida do RN) — usa dimensões em pixel calculadas a
  // partir do tamanho real da tela em vez de porcentagem.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // "permission" | "ready" | "preview" | "processing" | "result" | "manual" | "confirmed"
  const [phase, setPhase] = useState("ready");
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [ocrResult, setOcrResult] = useState(null); // { parsed, candidates, needsManualConfirmation }
  const [errorMessage, setErrorMessage] = useState(null);
  const [confirmedRecord, setConfirmedRecord] = useState(null);

  const [manualQuery, setManualQuery] = useState("");
  const [manualResult, setManualResult] = useState(null);

  // Integração do inventário ao resultado confirmado do Garimpo
  // (especificação da Entrega 2, seção 8.9): identificar NUNCA grava posse
  // sozinho — só depois de "confirmed" é que consultamos o estado real da
  // coleção, e só o botão explícito abaixo grava algo.
  const [confirmedCardStatus, setConfirmedCardStatus] = useState(null);
  const [showAddCopyModal, setShowAddCopyModal] = useState(false);

  // Pedido real de quem testou o app: poder ampliar a imagem da carta pra
  // ler o texto nela, em vez de só a miniatura pequena da lista.
  const [expandedRecord, setExpandedRecord] = useState(null);
  // TCGdex só tem "low" (245x337) e "high" (600x825) — não existe um nível
  // "médio" na API (confirmado na documentação oficial). A "high" pode
  // demorar bastante dependendo da rede, então o modal abre com a "low"
  // (instantânea, já em cache) e só carrega a "high" se o usuário pedir.
  const [showHighQuality, setShowHighQuality] = useState(false);
  const [highQualityLoading, setHighQualityLoading] = useState(false);
  const handleExpandImage = useCallback((record) => {
    setShowHighQuality(false);
    setHighQualityLoading(false);
    setExpandedRecord(record);
  }, []);
  const handleLoadHighQuality = useCallback(() => {
    setShowHighQuality(true);
    setHighQualityLoading(true);
  }, []);

  // Pedido explícito: o texto bruto do OCR não precisa ficar sempre visível
  // — fica atrás de um botão flutuante que abre um modal com o texto.
  const [showRawTextModal, setShowRawTextModal] = useState(false);

  const resetToReady = useCallback(() => {
    setPhase("ready");
    setCapturedPhoto(null);
    setOcrResult(null);
    setErrorMessage(null);
    setConfirmedRecord(null);
    setConfirmedCardStatus(null);
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

  // Detecção automática de rotação por EXIF se mostrou pouco confiável em
  // dispositivo físico real (ver src/scanner/rotateImage.js) — por isso o
  // ajuste fica manual: cada toque gira a prévia 90° até ficar em pé.
  // degrees positivo = sentido horário (ver rotateImage.js).
  const handleRotate = useCallback(
    async (degrees) => {
      if (!capturedPhoto) return;
      try {
        const rotated = await rotateImage(capturedPhoto.uri, degrees);
        setCapturedPhoto((prev) => (prev ? { ...prev, ...rotated } : prev));
      } catch (err) {
        setErrorMessage(err.message || String(err));
      }
    },
    [capturedPhoto]
  );

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
      const { candidates, needsManualConfirmation } = await catalogRepository.getScannerCandidates(parsed, { topN: 5 });

      setOcrResult({ parsed, candidates, needsManualConfirmation });
      setPhase("result");
    } catch (err) {
      setErrorMessage(err.message || String(err));
      setPhase("result");
      setOcrResult({ parsed: { rawText: "" }, candidates: [], needsManualConfirmation: true });
    }
  }, [capturedPhoto]);

  const handleManualSearch = useCallback(async () => {
    const query = manualQuery.trim();
    if (!query) {
      setManualResult(null);
      return;
    }
    // Achado real (25/10/2026): busca manual usava parseCardText() (feito
    // pro texto ruidoso do OCR, que exige prefixo de letra num número
    // solto pra não confundir com ruído) — buscar só "001" não achava
    // nada. parseManualQuery() é um parser separado pra texto digitado de
    // propósito, sem essa exigência (ver src/scanner/parseManualQuery.js).
    const parsed = parseManualQuery(query);
    const { candidates, needsManualConfirmation } = await catalogRepository.getScannerCandidates(parsed, { topN: 5 });
    setManualResult({ parsed, candidates, needsManualConfirmation });
  }, [manualQuery]);

  const handleConfirmCandidate = useCallback((record) => {
    // Confirmação manual explícita do usuário — nunca automática. A partir
    // daqui (Entrega 2, seção 8.9) consultamos o estado REAL da coleção
    // (cópias já existentes e onde estão, fichários que já tem/precisam
    // desta impressão) — a identificação em si ainda não grava nada; só o
    // botão "Já comprei" abaixo registra uma cópia de verdade.
    setConfirmedRecord(record);
    setConfirmedCardStatus(null);
    setPhase("confirmed");
    collectionProgressService.getConfirmedCardStatus(record).then(setConfirmedCardStatus);
  }, []);

  const noneMatchMessage = useMemo(
    () => "Nenhum candidato corresponde à carta fotografada. Use a busca manual abaixo ou tente uma nova captura.",
    []
  );

  const imageModal = (
    <Modal visible={Boolean(expandedRecord)} transparent animationType="fade" onRequestClose={() => setExpandedRecord(null)}>
      <View style={styles.modalOverlay}>
        {/* Fundo e conteúdo são IRMÃOS, não um dentro do outro — achado
            real: botão dentro de um TouchableOpacity que fecha ao toque
            disparava os dois ao mesmo tempo (toque no botão também fechava
            o modal). O fundo cobre a tela inteira por trás; o conteúdo fica
            por cima, sem fechar ao ser tocado. */}
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => setExpandedRecord(null)}
          accessibilityLabel="Fechar imagem ampliada"
        />
        {expandedRecord && (
          <View pointerEvents="box-none" style={{ alignItems: "center", gap: 10 }}>
            {/* Achado real: a versão "high" demorava 30s+ pra chegar na rede
                do usuário (bem fora do normal pra um arquivo de ~48KB — CDN
                lento nessa rede específica, não o tamanho do arquivo). Abre
                sempre com a "low" (mesma imagem já usada na miniatura da
                lista, já em cache, instantânea) e só busca a "high" se o
                usuário pedir explicitamente pelo botão abaixo. */}
            {/* Achado real: Image com style={StyleSheet.absoluteFillObject}
                (top/left/right/bottom:0, sem width/height explícitos) não
                renderizava de forma confiável aqui — mesma classe do bug
                original desta tela (dimensão implícita/porcentagem falhava
                no modal). width/height explícitos em pixel resolveram da
                primeira vez; usa o mesmo valor explícito nas duas imagens
                empilhadas em vez do atalho de absoluteFillObject. */}
            <View style={{ width: windowWidth * 0.9, height: windowHeight * 0.7 }}>
              <Image
                source={{ uri: resolveImageUrl(expandedRecord, "low") }}
                style={{ position: "absolute", width: windowWidth * 0.9, height: windowHeight * 0.7 }}
                resizeMode="contain"
              />
              {showHighQuality && (
                <Image
                  source={{ uri: resolveImageUrl(expandedRecord, "high") }}
                  style={{ position: "absolute", width: windowWidth * 0.9, height: windowHeight * 0.7 }}
                  resizeMode="contain"
                  onLoadEnd={() => setHighQualityLoading(false)}
                  onError={() => setHighQualityLoading(false)}
                />
              )}
              {highQualityLoading && (
                <ActivityIndicator
                  style={{ position: "absolute", width: windowWidth * 0.9, height: windowHeight * 0.7 }}
                  color={COLORS.primary}
                />
              )}
            </View>
            {!showHighQuality && (
              <AppButton title="Carregar em alta qualidade" variant="outline" compact onPress={handleLoadHighQuality} />
            )}
            <Text style={styles.modalCaption}>
              {expandedRecord.name} — {expandedRecord.setName} #{expandedRecord.localId} (
              {LANGUAGE_FLAGS[expandedRecord.sourceLanguage?.toLowerCase()] ?? ""} {expandedRecord.sourceLanguage?.toUpperCase()})
            </Text>
            <AppButton title="Fechar" variant="outline" compact onPress={() => setExpandedRecord(null)} />
          </View>
        )}
      </View>
    </Modal>
  );

  const rawTextModal = (
    <Modal visible={showRawTextModal} transparent animationType="fade" onRequestClose={() => setShowRawTextModal(false)}>
      <View style={styles.modalOverlay}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => setShowRawTextModal(false)}
          accessibilityLabel="Fechar texto reconhecido"
        />
        <View pointerEvents="box-none" style={{ width: windowWidth * 0.88, maxHeight: windowHeight * 0.7, gap: 10 }}>
          <View style={styles.rawTextCard}>
            <Text style={styles.sectionTitle}>Texto reconhecido (bruto)</Text>
            <ScrollView>
              <Text style={styles.rawText} selectable>
                {ocrResult?.parsed?.rawText || "(nenhum texto reconhecido)"}
              </Text>
            </ScrollView>
          </View>
          <AppButton title="Fechar" variant="outline" compact onPress={() => setShowRawTextModal(false)} />
        </View>
      </View>
    </Modal>
  );

  if (!permission) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  // Especificação, seção 4.2, item 12: sem catálogo local e sem internet,
  // mostra mensagem clara — nunca finge que o catálogo carregou. Scanner e
  // busca manual ficam bloqueados até "ready" ou "offline_using_local"
  // (banco local íntegro, mesmo sem rede agora).
  if (!catalogUsable) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.screen, { alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }]}>
        <ScreenHeader title="DexBinder" />
        <CatalogStatusBanner status={catalogStatus} error={catalogError} manifest={catalogManifest} onRetry={syncCatalog} />
      </SafeAreaView>
    );
  }

  const manualSearchBlock = (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Busca manual</Text>
      <TextInput
        value={manualQuery}
        onChangeText={setManualQuery}
        placeholder="Nome da carta e/ou número (ex.: Bulbasaur 001)"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />
      <AppButton title="Buscar no índice local" onPress={handleManualSearch} />
      {manualResult && (
        <View style={{ gap: 10 }}>
          {manualResult.candidates.length === 0 && <Text style={styles.bodyText}>Nenhum resultado encontrado no índice local.</Text>}
          <CandidateList candidates={manualResult.candidates} onConfirm={handleConfirmCandidate} onExpandImage={handleExpandImage} />
        </View>
      )}
    </View>
  );

  if (!permission.granted) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <ScrollView>
          <View style={{ alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
            <Text style={[styles.bodyText, { textAlign: "center" }]}>
              Sem acesso à câmera. A busca manual continua disponível abaixo (permissão negada nunca bloqueia a
              pesquisa manual).
            </Text>
            <AppButton title="Permitir câmera" onPress={requestPermission} />
          </View>
          {manualSearchBlock}
          {imageModal}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView style={{ flex: 1 }}>
        <ScreenHeader title="DexBinder" />

        {(phase === "ready" || phase === "preview") && (
          <View style={styles.cameraFrame}>
            {phase === "ready" && <CameraView ref={cameraRef} style={{ flex: 1 }} />}
            {phase === "preview" && capturedPhoto && (
              <Image source={{ uri: capturedPhoto.uri }} style={{ flex: 1 }} resizeMode="contain" />
            )}
          </View>
        )}

        <View style={styles.section}>
          {phase === "ready" && <AppButton title="Capturar carta" onPress={handleCapture} />}

          {phase === "preview" && (
            <View style={{ flexDirection: "row", gap: 14, justifyContent: "center" }}>
              {/* Achado real: tentativas de ícone com "90°" embutido (glifo
                  MaterialIcons/MaterialCommunityIcons ausente, depois ícone+
                  texto "90°" abaixo, achado feio/grande demais) — ficou só o
                  ícone de girar (Feather rotate-ccw/cw), confirmado
                  funcionando, sem tentar embutir o "90°" visualmente. */}
              <IconButton icon="rotate-ccw" variant="outline" accessibilityLabel="Girar 90° à esquerda" onPress={() => handleRotate(-90)} />
              <IconButton icon="rotate-cw" variant="outline" accessibilityLabel="Girar 90° à direita" onPress={() => handleRotate(90)} />
              <IconButton icon="camera" variant="outline" accessibilityLabel="Tirar outra foto" onPress={handleRetake} />
              <IconButton icon="check" variant="primary" accessibilityLabel="Usar esta foto" onPress={handleUsePhoto} />
            </View>
          )}

          {phase === "processing" && (
            <View style={{ alignItems: "center", gap: 10, paddingVertical: 12 }}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.bodyText}>Processando OCR e buscando candidatos no índice local...</Text>
            </View>
          )}

          {errorMessage && (
            <View style={[styles.alertBox, { backgroundColor: COLORS.dangerBg }]}>
              <Text style={[styles.alertText, { color: COLORS.dangerText }]}>Erro: {errorMessage}</Text>
            </View>
          )}

          {phase === "result" && ocrResult && (
            <View style={{ gap: 10 }}>
              {ocrResult.needsManualConfirmation && (
                <View style={[styles.alertBox, { backgroundColor: COLORS.warningBg }]}>
                  <Text style={[styles.alertText, { color: COLORS.warningText }]}>
                    Confirme manualmente — identificação ambígua ou pouco confiável.
                  </Text>
                </View>
              )}

              {ocrResult.candidates.length === 0 ? (
                <Text style={styles.bodyText}>{noneMatchMessage}</Text>
              ) : (
                <CandidateList candidates={ocrResult.candidates} onConfirm={handleConfirmCandidate} onExpandImage={handleExpandImage} />
              )}
            </View>
          )}

          {phase === "manual" && (
            <View style={{ gap: 10 }}>
              <Text style={styles.bodyText}>{noneMatchMessage}</Text>
              <AppButton title="Nova captura" onPress={resetToReady} />
            </View>
          )}

          {phase === "confirmed" && confirmedRecord && (
            <View style={{ gap: 10 }}>
              <View style={[styles.alertBox, { backgroundColor: COLORS.successBg }]}>
                <Text style={[styles.alertText, { color: COLORS.successText }]}>Identificação confirmada pelo usuário:</Text>
              </View>
              <Text style={styles.candidateName}>
                {confirmedRecord.name} — {confirmedRecord.setName} #{confirmedRecord.localId} (
                {LANGUAGE_FLAGS[confirmedRecord.sourceLanguage?.toLowerCase()] ?? ""} {confirmedRecord.sourceLanguage?.toUpperCase()})
              </Text>

              {!confirmedCardStatus && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.captionText}>Consultando seu inventário...</Text>
                </View>
              )}

              {confirmedCardStatus && (
                <View style={{ gap: 6 }}>
                  {confirmedCardStatus.existingCopies.length > 0 ? (
                    <>
                      <Text style={styles.sectionTitle}>Você já tem esta impressão:</Text>
                      {confirmedCardStatus.existingCopies.map((c) => (
                        <Text key={c.id} style={styles.captionText}>
                          • {c.collectionName ? c.collectionName : "Sem fichário"}
                          {c.pageNumber ? ` · pág. ${c.pageNumber}, bolso ${c.slotIndex}` : c.collectionName ? " · aguardando organização" : ""}
                        </Text>
                      ))}
                    </>
                  ) : (
                    <Text style={styles.captionText}>Você ainda não tem nenhuma cópia desta impressão no inventário.</Text>
                  )}

                  {confirmedCardStatus.collectionsNeedingThis.length > 0 && (
                    <Text style={styles.captionText}>
                      Falta para: {confirmedCardStatus.collectionsNeedingThis.map((c) => c.name).join(", ")}
                    </Text>
                  )}
                  {confirmedCardStatus.collectionsCompletedByThis.length > 0 && (
                    <Text style={[styles.captionText, { color: COLORS.successText }]}>
                      Já completa: {confirmedCardStatus.collectionsCompletedByThis.map((c) => c.name).join(", ")}
                    </Text>
                  )}
                  {!confirmedCardStatus.speciesAssociation.confirmed && (
                    <Text style={styles.captionText}>Associação ao Pokémon precisa ser confirmada (se aplicável).</Text>
                  )}
                </View>
              )}

              <AppButton title="Já comprei — registrar no inventário" variant="success" onPress={() => setShowAddCopyModal(true)} />
              <AppButton title="Nova captura" variant="outline" onPress={resetToReady} />
            </View>
          )}
        </View>

        {manualSearchBlock}
      </ScrollView>

      {phase === "result" && ocrResult && (
        <View style={styles.fab}>
          <IconButton
            icon="search"
            variant="primary"
            size={52}
            accessibilityLabel="Nenhum candidato corresponde"
            onPress={() => setPhase("manual")}
          />
          <IconButton
            icon="camera-retake-outline"
            iconSet={MaterialCommunityIcons}
            variant="success"
            size={52}
            accessibilityLabel="Nova captura"
            onPress={resetToReady}
          />
          <IconButton
            icon="file-text"
            variant="warning"
            size={56}
            accessibilityLabel="Ver texto reconhecido"
            onPress={() => setShowRawTextModal(true)}
          />
        </View>
      )}

      {imageModal}
      {rawTextModal}
      <AddCopyModal
        visible={showAddCopyModal}
        record={confirmedRecord}
        onClose={() => setShowAddCopyModal(false)}
        onSaved={() => {
          if (confirmedRecord) collectionProgressService.getConfirmedCardStatus(confirmedRecord).then(setConfirmedCardStatus);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  cameraFrame: {
    height: 420,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    alignItems: "center",
    gap: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  section: {
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
  bodyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  captionText: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonCompact: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexShrink: 0,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  buttonTextCompact: {
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  alertBox: {
    borderRadius: 12,
    padding: 14,
  },
  alertText: {
    fontSize: 14,
    fontWeight: "600",
  },
  rawTextCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 6,
  },
  rawText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "monospace",
    lineHeight: 17,
  },
  candidateCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
  },
  candidateThumb: {
    width: 76,
    height: 106,
    borderRadius: 8,
  },
  candidateThumbPlaceholder: {
    backgroundColor: COLORS.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  candidateName: {
    color: COLORS.textPrimary,
    fontWeight: "700",
    fontSize: 15,
  },
  candidateSet: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  candidateMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  candidateReasons: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCaption: {
    color: COLORS.textPrimary,
    marginTop: 14,
    textAlign: "center",
    paddingHorizontal: 20,
    fontSize: 14,
  },
});
