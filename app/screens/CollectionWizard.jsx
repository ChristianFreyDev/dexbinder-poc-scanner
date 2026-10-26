/**
 * Assistente de criação de fichário (especificação da Entrega 2, seção 8.3):
 * tipo -> nome/descrição -> origem/escopo/idioma -> grade -> prévia -> confirmar.
 *
 * Simplificação deliberada e documentada (reports/delivery-2.md): a seleção
 * manual de espécies da Pokédex usa um INTERVALO de números (ex.: 1 a 151),
 * não um seletor multi-escolha das 1025 espécies uma a uma — a própria
 * especificação permite isso ("seleção inicial por intervalo/números, se
 * isso puder ser entregue sem lógica frágil"). Fichário Personalizado nasce
 * com checklist vazia; itens são adicionados depois, no detalhe do fichário.
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS } from "../theme";
import { AppButton } from "../components/AppButton";
import { catalogRepository } from "../../src/catalog/catalogRepository";
import { collectionRepository, checklistRepository } from "../../src/collections";
import { generateSpeciesChecklistItems, generateCardChecklistItems } from "../../src/domain/checklistGeneration";
import { evaluateExpansionEligibility } from "../../src/domain/expansionEligibility";
import { GRID_PRESETS, DEFAULT_GRID } from "../../src/domain/gridLayout";
import nationalDex from "../assets/data/national-dex.json";

function OptionRow({ label, note, selected, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.row, selected && styles.rowSelected]}>
      <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>{label}</Text>
      {note ? <Text style={styles.rowNote}>{note}</Text> : null}
    </Pressable>
  );
}

const STEPS = ["type", "basics", "config", "grid", "preview"];

export function CollectionWizard({ onDone, onCancel }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  const [collectionType, setCollectionType] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Pokédex
  const [dexMode, setDexMode] = useState("full"); // "full" | "range"
  const [rangeFrom, setRangeFrom] = useState("1");
  const [rangeTo, setRangeTo] = useState("151");

  // Expansão
  const [sets, setSets] = useState([]);
  const [setQuery, setSetQuery] = useState("");
  const [selectedSetId, setSelectedSetId] = useState(null);
  const [availableLanguages, setAvailableLanguages] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const [languagePolicy, setLanguagePolicy] = useState("specific");
  const [checklistScope, setChecklistScope] = useState("complete_catalog");
  const [eligibility, setEligibility] = useState(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [expansionRecords, setExpansionRecords] = useState([]);

  // Grade
  const [columnsPerPage, setColumnsPerPage] = useState(DEFAULT_GRID.columns);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_GRID.rows);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (collectionType === "expansion" && sets.length === 0) {
      catalogRepository.listSets().then(setSets);
    }
  }, [collectionType, sets.length]);

  useEffect(() => {
    if (!selectedSetId) return;
    catalogRepository.listLanguagesForSet(selectedSetId).then(setAvailableLanguages);
    setSelectedLanguage(null);
    setEligibility(null);
  }, [selectedSetId]);

  useEffect(() => {
    if (!selectedSetId) return;
    const languagesToLoad = languagePolicy === "any_supported" ? availableLanguages : selectedLanguage ? [selectedLanguage] : [];
    if (languagesToLoad.length === 0) {
      setExpansionRecords([]);
      setEligibility(null);
      return;
    }
    setLoadingEligibility(true);
    Promise.all(languagesToLoad.map((lang) => catalogRepository.getRecordsBySetAndLanguage(selectedSetId, lang))).then((results) => {
      const records = results.flat();
      setExpansionRecords(records);
      // "any_supported" é elegível assim que QUALQUER idioma sincronizado estiver completo
      // (o usuário pode completar a checklist com cópias de qualquer um deles).
      const perLanguageEligibility =
        languagePolicy === "any_supported"
          ? languagesToLoad.map((_, idx) => evaluateExpansionEligibility(results[idx], { scope: checklistScope }))
          : [evaluateExpansionEligibility(records, { scope: checklistScope })];
      const best = perLanguageEligibility.find((e) => e.eligible) || perLanguageEligibility[0];
      setEligibility(best);
      setLoadingEligibility(false);
    });
  }, [selectedSetId, selectedLanguage, languagePolicy, availableLanguages, checklistScope]);

  const filteredSets = useMemo(() => {
    const q = setQuery.trim().toLowerCase();
    if (!q) return sets.slice(0, 30);
    return sets.filter((s) => s.setId.toLowerCase().includes(q) || (s.setName || "").toLowerCase().includes(q)).slice(0, 30);
  }, [sets, setQuery]);

  const previewItems = useMemo(() => {
    if (collectionType === "pokedex") {
      const from = dexMode === "full" ? 1 : Math.max(1, parseInt(rangeFrom, 10) || 1);
      const to = dexMode === "full" ? nationalDex.totalSpecies : Math.min(nationalDex.totalSpecies, parseInt(rangeTo, 10) || 1);
      const species = nationalDex.species.filter((s) => s.nationalNumber >= from && s.nationalNumber <= to).map((s) => ({
        nationalNumber: s.nationalNumber,
        label: s.names.en || s.slug,
      }));
      return generateSpeciesChecklistItems(species);
    }
    if (collectionType === "expansion" && eligibility?.eligible) {
      return generateCardChecklistItems(expansionRecords, { scope: checklistScope, languagePolicy });
    }
    return [];
  }, [collectionType, dexMode, rangeFrom, rangeTo, eligibility, expansionRecords, checklistScope, languagePolicy]);

  const canAdvanceFromConfig =
    collectionType === "custom" ||
    (collectionType === "pokedex" && (dexMode === "full" || (rangeFrom && rangeTo))) ||
    (collectionType === "expansion" && Boolean(eligibility?.eligible));

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await collectionRepository.create({
        name,
        description: description || null,
        collectionType,
        creationMode: collectionType === "custom" ? "manual" : "automatic",
        sourceSetId: collectionType === "expansion" ? selectedSetId : null,
        sourceLanguage: collectionType === "expansion" ? selectedLanguage : null,
        languagePolicy: collectionType === "expansion" ? languagePolicy : null,
        checklistScope: collectionType === "expansion" ? checklistScope : null,
        columnsPerPage,
        rowsPerPage,
      });
      if (!created.created) {
        setError(Object.values(created.errors).join(" "));
        setSaving(false);
        return;
      }
      if (previewItems.length > 0) {
        await checklistRepository.generateAutomatic(created.collection.id, previewItems);
      }
      onDone(created.collection);
    } catch (err) {
      setError(err.message || String(err));
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
        <Text style={styles.title}>Novo fichário</Text>

        {step === "type" && (
          <View style={{ gap: 8 }}>
            <OptionRow label="Pokédex" note="Checklist de espécies" selected={collectionType === "pokedex"} onPress={() => setCollectionType("pokedex")} />
            <OptionRow label="Expansão" note="Checklist de uma expansão do catálogo" selected={collectionType === "expansion"} onPress={() => setCollectionType("expansion")} />
            <OptionRow label="Personalizada" note="Você escolhe os itens depois" selected={collectionType === "custom"} onPress={() => setCollectionType("custom")} />
          </View>
        )}

        {step === "basics" && (
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Nome</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Ex.: 151, Minha Pokédex" placeholderTextColor={COLORS.textMuted} />
            <Text style={styles.label}>Descrição (opcional)</Text>
            <TextInput value={description} onChangeText={setDescription} style={styles.input} placeholder="Descrição" placeholderTextColor={COLORS.textMuted} />
          </View>
        )}

        {step === "config" && collectionType === "pokedex" && (
          <View style={{ gap: 8 }}>
            <OptionRow label="Pokédex Nacional completa (1–1025)" selected={dexMode === "full"} onPress={() => setDexMode("full")} />
            <OptionRow label="Intervalo de números específico" selected={dexMode === "range"} onPress={() => setDexMode("range")} />
            {dexMode === "range" && (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TextInput value={rangeFrom} onChangeText={setRangeFrom} keyboardType="number-pad" style={[styles.input, { flex: 1 }]} placeholder="De" placeholderTextColor={COLORS.textMuted} />
                <TextInput value={rangeTo} onChangeText={setRangeTo} keyboardType="number-pad" style={[styles.input, { flex: 1 }]} placeholder="Até" placeholderTextColor={COLORS.textMuted} />
              </View>
            )}
          </View>
        )}

        {step === "config" && collectionType === "expansion" && (
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Expansão</Text>
            <TextInput value={setQuery} onChangeText={setSetQuery} style={styles.input} placeholder="Buscar expansão" placeholderTextColor={COLORS.textMuted} />
            <ScrollView style={{ maxHeight: 160 }}>
              {filteredSets.map((s) => (
                <OptionRow key={s.setId} label={s.setName || s.setId} note={s.setId} selected={selectedSetId === s.setId} onPress={() => setSelectedSetId(s.setId)} />
              ))}
            </ScrollView>

            {selectedSetId && (
              <>
                <Text style={styles.label}>Política de idioma</Text>
                <OptionRow
                  label="Um idioma específico"
                  selected={languagePolicy === "specific"}
                  onPress={() => setLanguagePolicy("specific")}
                />
                {availableLanguages.length > 1 && (
                  <OptionRow
                    label="Qualquer idioma sincronizado deste set"
                    note="1 item por posição impressa, completo com cópia em qualquer idioma"
                    selected={languagePolicy === "any_supported"}
                    onPress={() => setLanguagePolicy("any_supported")}
                  />
                )}

                {languagePolicy === "specific" && (
                  <>
                    <Text style={styles.label}>Idioma</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {availableLanguages.map((lang) => (
                        <Pressable key={lang} onPress={() => setSelectedLanguage(lang)} style={[styles.chip, selectedLanguage === lang && styles.chipSelected]}>
                          <Text style={[styles.chipText, selectedLanguage === lang && styles.chipTextSelected]}>{lang.toUpperCase()}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
                {languagePolicy === "any_supported" && (
                  <Text style={styles.captionText}>Elegibilidade conferida com base no primeiro idioma sincronizado deste set.</Text>
                )}

                <Text style={styles.label}>Escopo</Text>
                <OptionRow label="Catálogo completo (inclui extras/secretas)" selected={checklistScope === "complete_catalog"} onPress={() => setChecklistScope("complete_catalog")} />
                <OptionRow label="Somente numeração oficial" selected={checklistScope === "official"} onPress={() => setChecklistScope("official")} />

                {loadingEligibility && <ActivityIndicator color={COLORS.primary} />}
                {eligibility && !loadingEligibility && (
                  <View style={[styles.alertBox, eligibility.eligible ? styles.alertSuccess : styles.alertWarning]}>
                    <Text style={styles.alertText}>
                      {eligibility.eligible
                        ? `Pronto: ${eligibility.recordCount}/${eligibility.expectedCount} impressões sincronizadas.`
                        : eligibility.reason === "not_synced"
                          ? "Este set/idioma ainda não tem nenhuma impressão sincronizada localmente."
                          : eligibility.reason === "unknown_expected_count"
                            ? "Contagem oficial/total deste set é desconhecida na fonte — não é possível confirmar completude."
                            : `Ainda sincronizando: ${eligibility.recordCount}/${eligibility.expectedCount} impressões. Aguarde ou crie uma checklist manual (fora deste assistente).`}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {step === "config" && collectionType === "custom" && (
          <Text style={styles.bodyText}>Sem configuração adicional — a checklist começa vazia e você adiciona itens no detalhe do fichário.</Text>
        )}

        {step === "grid" && (
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Grade (colunas × linhas)</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {GRID_PRESETS.map((p) => (
                <Pressable
                  key={p.label}
                  onPress={() => {
                    setColumnsPerPage(p.columns);
                    setRowsPerPage(p.rows);
                  }}
                  style={[styles.chip, columnsPerPage === p.columns && rowsPerPage === p.rows && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, columnsPerPage === p.columns && rowsPerPage === p.rows && styles.chipTextSelected]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {step === "preview" && (
          <View style={{ gap: 8 }}>
            <Text style={styles.bodyText}>
              {previewItems.length} {previewItems.length === 1 ? "item" : "itens"} nesta checklist, grade {columnsPerPage}×{rowsPerPage}.
            </Text>
            {collectionType === "expansion" && (
              <Text style={styles.captionText}>
                A checklist cobre as impressões retornadas pelo catálogo e não diferencia automaticamente variantes físicas de acabamento
                (normal/holo/reverse) — limitação conhecida do catálogo atual.
              </Text>
            )}
            {error && <Text style={[styles.captionText, { color: COLORS.dangerText }]}>Erro: {error}</Text>}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <AppButton title={stepIndex === 0 ? "Cancelar" : "Voltar"} variant="outline" onPress={() => (stepIndex === 0 ? onCancel() : setStepIndex((i) => i - 1))} />
        {step !== "preview" ? (
          <AppButton
            title="Avançar"
            disabled={
              (step === "type" && !collectionType) ||
              (step === "basics" && !name.trim()) ||
              (step === "config" && !canAdvanceFromConfig)
            }
            onPress={() => setStepIndex((i) => i + 1)}
          />
        ) : (
          <AppButton title={saving ? "Salvando..." : "Confirmar e criar"} disabled={saving} onPress={handleConfirm} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  title: { color: COLORS.textPrimary, fontSize: 20, fontWeight: "700", marginBottom: 6 },
  label: { color: COLORS.textPrimary, fontSize: 13, fontWeight: "600" },
  bodyText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18 },
  captionText: { color: COLORS.textMuted, fontSize: 11, lineHeight: 16 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  row: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, flexDirection: "row", justifyContent: "space-between" },
  rowSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.surfaceAlt },
  rowLabel: { color: COLORS.textPrimary, fontSize: 14 },
  rowLabelSelected: { fontWeight: "700" },
  rowNote: { color: COLORS.textMuted, fontSize: 11 },
  chip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 12 },
  chipTextSelected: { color: "#FFFFFF", fontWeight: "700" },
  alertBox: { borderRadius: 10, padding: 12 },
  alertSuccess: { backgroundColor: COLORS.successBg },
  alertWarning: { backgroundColor: COLORS.warningBg },
  alertText: { color: COLORS.textPrimary, fontSize: 12, lineHeight: 17 },
  footer: { flexDirection: "row", gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: COLORS.border },
});
