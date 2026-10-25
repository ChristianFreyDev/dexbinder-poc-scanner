/**
 * Ponto de entrada do app. Entrega 1: passou a renderizar a navegação
 * principal (./app/Navigation.jsx — cinco áreas, especificação seção 4.8)
 * em vez de ir direto pra tela de scanner. O scanner (Entrega 0, validado
 * em dispositivo físico) virou o conteúdo da aba "Garimpo", sem alteração
 * na sua lógica interna — ver app/index.jsx.
 *
 * Continua sem Expo Router de propósito (ver app/Navigation.jsx para a
 * justificativa) — a navegação por abas é construída à mão.
 */
import Navigation from "./app/Navigation";

export default function App() {
  return <Navigation />;
}
