/**
 * Estrutura inicial de navegação (especificação da Entrega 1, seção 4.8):
 * cinco áreas — Início, Fichários, Pokédex, Garimpo, Inventário. Garimpo é
 * a tela de scanner já existente (./index.jsx), ligada ao catálogo
 * completo (ver reports/delivery-1.md).
 *
 * Decisão deliberada (conservadora, documentada — especificação, seção 9):
 * navegação por abas construída à mão com `useState`, SEM instalar
 * expo-router/@react-navigation (que trariam novos módulos nativos —
 * react-native-screens, safe-area-context — exigindo regenerar
 * `android/`/`ios/` via `expo prebuild`, um risco real desnecessário pra
 * uma "estrutura inicial" que a própria especificação pede simples, sem
 * animações/personalizações complexas). App.js (Entrega 0) já documentava
 * essa mesma escolha deliberada de não usar Expo Router neste protótipo.
 */
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { COLORS } from "./theme";
import HomeScreen from "./screens/HomeScreen";
import FichariosScreen from "./screens/FichariosScreen";
import PokedexScreen from "./screens/PokedexScreen";
import GarimpoScreen from "./index";
import InventarioScreen from "./screens/InventarioScreen";

const TABS = [
  { key: "home", label: "Início", icon: "home", Component: HomeScreen },
  { key: "ficharios", label: "Fichários", icon: "book-open", Component: FichariosScreen },
  { key: "pokedex", label: "Pokédex", icon: "list", Component: PokedexScreen },
  { key: "garimpo", label: "Garimpo", icon: "camera", Component: GarimpoScreen },
  { key: "inventario", label: "Inventário", icon: "archive", Component: InventarioScreen },
];

export default function Navigation() {
  const [active, setActive] = useState("home");
  const activeTab = TABS.find((t) => t.key === active) || TABS[0];
  const ActiveComponent = activeTab.Component;

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <ActiveComponent />
      </View>
      <SafeAreaView style={styles.tabBarSafeArea} edges={["bottom"]}>
        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tabButton}
                onPress={() => setActive(tab.key)}
                accessibilityLabel={tab.label}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Feather name={tab.icon} size={20} color={isActive ? COLORS.primary : COLORS.textMuted} />
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1 },
  tabBarSafeArea: { backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  tabBar: { flexDirection: "row" },
  tabButton: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, gap: 2 },
  tabLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: "500" },
  tabLabelActive: { color: COLORS.primary, fontWeight: "700" },
});
