/**
 * Modal compartilhado de "adicionar cópia física" (especificação da Entrega
 * 2, seção 8.8) — usado pelo Inventário, pelo detalhe de Fichário e pelo
 * botão "Já comprei — registrar no inventário" do Garimpo (seção 8.9), para
 * não duplicar o fluxo em três lugares.
 *
 * Fluxo: confirma a impressão (já veio de uma seleção real do catálogo ou de
 * um candidato confirmado do scanner — nunca escolhida aqui), quantidade,
 * fichário de destino ("Sem fichário" é sempre uma opção), e, se o destino
 * tiver um item de checklist compatível, associa automaticamente quando
 * inequívoco (ChecklistRepository.findMatchingItem). Para fichário tipo
 * Pokédex sem associação de espécie ainda confirmada para esta impressão,
 * pede a confirmação manual antes de salvar (especificação, seção 3.4/8.8).
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS } from "../theme";
import { AppButton } from "./AppButton";
import { buildCatalogCardKey } from "../../src/domain/catalogCardKey";
import { collectionRepository, checklistRepository, physicalCopyRepository, cardSpeciesRepository } from "../../src/collections";
import nationalDex from "../assets/data/national-dex.json";

function Row({ label, selected, onPress, note }) {
  return (
    <Pressable onPress={onPress} style={[styles.row, selected && styles.rowSelected]}>
      <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>{label}</Text>
      {note ? <Text style={styles.rowNote}>{note}</Text> : null}
    </Pressable>
  );
}

export function AddCopyModal({ visible, record, initialCollectionId = null, onClose, onSaved }) {
  const [collections, setCollections] = useState([]);
  const [destinationId, setDestinationId] = useState(initialCollectionId); // null = "Sem fichário"
  const [quantity, setQuantity] = useState("1");
  const [step, setStep] = useState("form"); // "form" | "species" | "saving" | "error"
  const [errorMessage, setErrorMessage] = useState(null);
  const [speciesQuery, setSpeciesQuery] = useState("");
  const [selectedSpecies, setSelectedSpecies] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setDestinationId(initialCollectionId);
    setQuantity("1");
    setStep("form");
    setErrorMessage(null);
    setSpeciesQuery("");
    setSelectedSpecies(null);
    collectionRepository.list({ includeArchived: false }).then(setCollections);
  }, [visible, record, initialCollectionId]);

  const catalogCardKey = useMemo(() => {
    if (!record) return null;
    return buildCatalogCardKey({
      sourceLanguage: record.sourceLanguage,
      sourceCardId: record.sourceCardId,
      sourceSetId: record.setId,
      localId: record.localId,
    });
  }, [record]);

  const destinationCollection = collections.find((c) => c.id === destinationId) || null;

  const speciesMatches = useMemo(() => {
    if (!speciesQuery.trim()) return [];
    const q = speciesQuery.trim().toLowerCase();
    return nationalDex.species
      .filter((s) => s.slug.includes(q) || String(s.nationalNumber).includes(q) || Object.values(s.names).some((n) => n && n.toLowerCase().includes(q)))
      .slice(0, 20);
  }, [speciesQuery]);

  const handleConfirmDestination = async () => {
    if (destinationCollection && destinationCollection.collectionType === "pokedex") {
      const existingLinks = await cardSpeciesRepository.getAssociations(catalogCardKey);
      const alreadyConfirmed = existingLinks.some((l) => l.associationStatus === "confirmed");
      if (!alreadyConfirmed) {
        setStep("species");
        return;
      }
    }
    await save();
  };

  const save = async () => {
    setStep("saving");
    setErrorMessage(null);
    try {
      const qty = Math.max(1, parseInt(quantity, 10) || 1);

      if (selectedSpecies) {
        await cardSpeciesRepository.confirmAssociation({ catalogCardKey, nationalDexNumber: selectedSpecies.nationalNumber });
      }

      const created = await physicalCopyRepository.addCopies({
        catalogCardKey,
        provider: "tcgdex",
        sourceLanguage: record.sourceLanguage,
        sourceCardId: record.sourceCardId,
        sourceSetId: record.setId,
        localId: record.localId,
        cardNameSnapshot: record.name,
        setNameSnapshot: record.setName,
        imageBaseUrlSnapshot: record.imageBaseUrl ?? null,
        quantity: qty,
        collectionId: destinationId,
      });

      if (destinationId) {
        const match = await checklistRepository.findMatchingItem(destinationId, {
          catalogCardKey,
          nationalDexNumber: selectedSpecies ? selectedSpecies.nationalNumber : null,
          setId: record.setId,
          localId: record.localId,
        });
        if (match && created.length > 0) {
          await physicalCopyRepository.updateCopy(created[0].id, { checklistItemId: match.id });
        }
      }

      onSaved(created);
      onClose();
    } catch (err) {
      setErrorMessage(err.message || String(err));
      setStep("error");
    }
  };

  if (!record) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Adicionar ao inventário</Text>
          <Text style={styles.cardLine}>
            {record.name} — {record.setName || record.setId} #{record.localId}
          </Text>

          {step === "form" && (
            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={styles.sectionLabel}>Quantidade de cópias</Text>
              <TextInput
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="number-pad"
                style={styles.input}
                placeholder="1"
                placeholderTextColor={COLORS.textMuted}
              />

              <Text style={styles.sectionLabel}>Fichário de destino</Text>
              <Row label="Sem fichário / aguardando organização" selected={destinationId === null} onPress={() => setDestinationId(null)} />
              {collections.map((c) => (
                <Row key={c.id} label={c.name} note={c.collectionType} selected={destinationId === c.id} onPress={() => setDestinationId(c.id)} />
              ))}
              {collections.length === 0 && <Text style={styles.bodyText}>Você ainda não tem fichários — a cópia ficará sem fichário.</Text>}
            </ScrollView>
          )}

          {step === "species" && (
            <View style={{ gap: 8 }}>
              <Text style={styles.sectionLabel}>Associação ao Pokémon ainda precisa ser confirmada</Text>
              <Text style={styles.bodyText}>
                Este fichário é uma Pokédex — selecione qual espécie esta carta representa (busca por nome ou número).
              </Text>
              <TextInput
                value={speciesQuery}
                onChangeText={setSpeciesQuery}
                placeholder="Nome ou número nacional"
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
              />
              <ScrollView style={{ maxHeight: 280 }}>
                {speciesMatches.map((s) => (
                  <Row
                    key={s.nationalNumber}
                    label={`#${String(s.nationalNumber).padStart(4, "0")} ${s.names.en || s.slug}`}
                    selected={selectedSpecies?.nationalNumber === s.nationalNumber}
                    onPress={() => setSelectedSpecies(s)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {step === "saving" && (
            <View style={{ alignItems: "center", padding: 16, gap: 8 }}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.bodyText}>Salvando...</Text>
            </View>
          )}

          {step === "error" && (
            <View style={[styles.alertBox]}>
              <Text style={styles.alertText}>Erro ao salvar: {errorMessage}. Nada foi gravado — tente de novo.</Text>
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <AppButton title="Cancelar" variant="outline" onPress={onClose} />
            {step === "form" && <AppButton title="Continuar" onPress={handleConfirmDestination} />}
            {step === "species" && <AppButton title="Confirmar espécie" disabled={!selectedSpecies} onPress={save} />}
            {step === "error" && <AppButton title="Tentar de novo" onPress={() => setStep("form")} />}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 8 },
  title: { color: COLORS.textPrimary, fontSize: 18, fontWeight: "700" },
  cardLine: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 6 },
  sectionLabel: { color: COLORS.textPrimary, fontSize: 13, fontWeight: "600", marginTop: 10, marginBottom: 6 },
  bodyText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
    color: COLORS.textPrimary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  row: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.surfaceAlt },
  rowLabel: { color: COLORS.textPrimary, fontSize: 14 },
  rowLabelSelected: { fontWeight: "700" },
  rowNote: { color: COLORS.textMuted, fontSize: 11 },
  alertBox: { backgroundColor: COLORS.dangerBg, borderRadius: 10, padding: 12 },
  alertText: { color: COLORS.dangerText, fontSize: 13 },
});
