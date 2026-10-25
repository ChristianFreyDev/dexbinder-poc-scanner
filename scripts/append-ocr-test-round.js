/**
 * Script de uso único: anexa ao reports/ocr-test-results.csv os 20 testes
 * reais que o usuário rodou no celular físico (24-25/10/2026), transcritos
 * a partir de 20 prints da tela "Texto reconhecido (bruto)" do app — cartas
 * físicas reais da coleção básica dele do set "151" (sv03.5, 1-165).
 *
 * IMPORTANTE: esta rodada cobre só UMA condição por carta (a "boa", luz/
 * ângulo normais) — o usuário ainda não mandou a condição "difícil"
 * (reflexo/ângulo/tela) pedida pelo protocolo formal (seção 16.3). Por
 * isso continua marcado EXECUTADO_INFORMAL, não EXECUTADO_FORMAL.
 */

const fs = require("fs");
const path = require("path");

const CSV_PATH = path.join(__dirname, "..", "reports", "ocr-test-results.csv");

function csvField(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(fields) {
  return fields.map(csvField).join(",") + "\n";
}

const ORIGEM = "coleção física do usuário (fichário, coleção básica do set 151, impressões 1-165)";
const OBS_BASE =
  "Rodada real no celular físico (24-25/10/2026), 1 foto por carta (condição normal/boa) — ainda falta a condição difícil (reflexo/ângulo/tela) por carta, pedida pelo protocolo formal da seção 16.3. Texto bruto transcrito literalmente do print da tela \"Texto reconhecido (bruto)\" enviado pelo usuário.";

const rows = [
  {
    id: "sv03.5-104", lang: "pt", name: "Cubone", num: "104/165",
    ocr: `ASICO Cubone
„7
BASICO
Cubone
N° 0104 Pokémon Solitário Altura: 0,4 m Peso: 6,5 kg
labilidade) Osso Empolgante
Enquanto este Pokémon estiver no seu Banco, os ataques
usados por seu Marowak causarão 30 pontos de dano a
mais ao Pokémon Ativo do seu oponente (antes de aplicar
Froqueza e Resistência).
10x
Jogue 2 moedas. Este ataque causa 10 pontos de dano para cada cara.
Fragueza Gx2Resistência
Must. Shinya Kemalsu
„70
Batida Dupla
GMEW104/165 @
Recuo
Este Pokémon usa o crânio de sua falecida mae.
As vezes, os sonhos de Cubone o fazemn chorar, mas cada lágrima que derrama só o torna mais forte.
Z023 Pokémon/Nintendo/Creatures/GAME FREAK
Bust. Shinya Komatu
GMEW 104/165 e
As vezes, os sonhos de Cubone o fazem chorar mas cada lágrima que derrama só o torna mais forte.
2023 Pokémon/Nintendo/Creatures/GAME FREAK`,
    top1: "sv03.5-104 (pt)", top3: "sv03.5-104 (pt)",
    resultado: "correto — Top-1 (confiança não visível no print, cortada pelo modal)",
  },
  {
    id: "sv03.5-094", lang: "pt", name: "Gengar", num: "o91/165 (leitura ruidosa de 094)",
    ocr: `MN2
50-30
do seu oponente como desejar.
Coloque 3 contadores de dano nos Pokemon no Banco
Mergulho Oco
110
encontrar la
50 pontos de dano para cada carta de Treinador que
Seu oponente revela a mao dele. Este ataque causa
Poltergeist
50x
Evoluide Haunter
CSTÁGIO2
Gengar
n130
BA
G2023 PokémonNintendo/Creatures/GAME FREAK
GMEW F o91/ 165
Must. Nelnal
correntes intensas desenvolvem espinhos grandes e afiados em suas conchas.
Cloyster que vivem em mares com
Fraqueza 4x2
Resistência
Recuo
***`,
    top1: "sv03.5-094 (pt)", top3: "sv03.5-094 (pt); sv03.5-166 (en, 49%)",
    resultado: "correto, mas confirmação manual necessária — confiança média (60%), número lido com ruído (\"o91\" em vez de \"094\", 4 confundido com 1)",
  },
  {
    id: "sv03.5-113", lang: "pt", name: "Chansey", num: "113/16S (leitura ruidosa de 165)",
    ocr: `Chansey
PS
11
BASICO
Chansey
Habilidade Bônus da Sorte
Fraqua x2
N° 0113 Pokémon Ovo Altura: 1,1 m Peso: 34,6 ka
Se você pegou este Pokémon como uma carta de Prêmio
virada para baixo durante o seu turno eo seu Banco não
estiver cheio, antes de colocá-lo na sua mão, você poderá
colocá-lo no seu Banco. Se você colocar este Pokémon no
seu Banco desta forma, jogue uma moeda. Se sair cara,
pegue carta de Prêmio a mais.
lust. Taigo Kayome
113/16S
Tapinha
Reslstência
1108
Recuo
C2021 Pokamon/tintendoCreaturesGAME FREAK
70
Este Pokémon gentil bota ovos bastante nutritivos e
os compartilha comn pessoas ou Pokémon feridos.
lust. Taigo Koyom
GMEW
oNEW 113/16s`,
    top1: "sv03.5-113 (pt)", top3: "sv03.5-113 (pt)",
    resultado: "correto — Top-1 (confiança não visível no print, cortada pelo modal)",
  },
  {
    id: "sv03.5-081", lang: "pt", name: "Magnemite", num: "o81/165",
    ocr: `Fraqu
Si
Es
m
62023 Pokémon/Nintendo/Crsatures/GAME FREAR
GMEW o81/165
Mlust.
Vulo Morl
As
ondaseletromagnéticas
emitidas
pelas unidaces
nas laterais de sua cabeça geram
antigravidade,
9que faz com que ele possa thutua.
Sraqus x2
Resistêncda
Recuo
SI mesmo.
Este Pokémon também causa 60 pontos de dano a
Grande Explosão
60
Carga Pequenina
10
NO 0081 Pokéon Magnético Altura: 0,3 m Peso: 6,0 kg
BASICO
Magnemite
„604
63027 Pokemen/Nintendekreatures GAME FREAR
odo barido`,
    top1: "sv03.5-081 (pt)", top3: "sv03.5-081 (pt)",
    resultado: "correto — Top-1 (confiança não visível no print, cortada pelo modal)",
  },
  {
    id: "sv03.5-092", lang: "pt", name: "Gastly", num: "092/165",
    ocr: `2023
Pokémon/Nintendo/CreaturevGAME FREAK
GMEW
Must. Tomokazu Komiye
092/165
eaenvenenando pelapele
Envolve o
oponente em seu corpo
gasos
entraquecendo sua presa lentamente
Fraqueza x2
Resistência -30
Recuo
Gás Asfixiante
20
N° O092 Pokémon Gás Altura: 1,3 m Peso: 0,1 kg
BÂSIO
Gastly
H50`,
    top1: "sv03.5-092 (pt)", top3: "sv03.5-092 (pt)",
    resultado: "correto — Top-1 automático, sem necessidade de confirmação manual (confiança alta, 100%)",
  },
  {
    id: "sv03.5-077", lang: "pt", name: "Ponyta", num: "077/16S",
    ocr: `2023
Pokémon/Nintendo/Creatures/GAME FREAK
G MEW
llust. Nurikahe
077/16S
abrasadora deste Pokéon misteriosamente
nao queimará ac ser tocada.
Se voce foi aceito por Ponyta, a crina
Fraqueza x2
Resistência
Recuo
Baque
30
Compre uma carta.
Coleta
N° 0077 Pokémon Cavalo de Fogo Altura: 1,0 m Peso: 30,0 ka
BASICO
Ponyta
„70
2023 Pokémon/Nintendo/Creatures/GAME FREAK
CSCaladoras.
te`,
    top1: "sv03.5-077 (pt)", top3: "sv03.5-077 (pt); sv03.5-160 (pt, 49%)",
    resultado: "correto — Top-1 automático, sem necessidade de confirmação manual (confiança alta, 100%)",
  },
  {
    id: "sv03.5-066", lang: "pt", name: "Machop", num: "066/165",
    ocr: `BASICO
Machop
lust. Ryuto Fuse
N 0066 Pokémon Superpoder Altura: 0,8 m Peso: 19,5 kg
Fraqueza x2
Descarte a carta de cima do baralho do seu oponente.
GMEW P 066/165
Esmagamento Montanhoso
Soco
„70
Resistência
Recuo
2023 Pokémon/Nintendo/Creatures/GAME FREAK
30
Sempre cheio de energia, passa o tempo levantando
pedras. Fazer isso o deixa ainda mais forte.
lust. Ryula Fuse
GMEW P
066/165 @
pedras. Fazer isso o deixa ainda mais forte.
2023 Pokémon/NintendoCreatures/GAME FREAK`,
    top1: "sv03.5-066 (pt)", top3: "sv03.5-066 (pt); sv03.5-012 (pt, 30%)",
    resultado: "correto — Top-1 automático, sem necessidade de confirmação manual (confiança alta, 100%)",
  },
  {
    id: "sv03.5-063", lang: "pt", name: "Abra", num: "063/165 (e leitura ruidosa secundária o60/165)",
    ocr: `GMEW
Sust. Miuhire Arito
063/165
2023
Pokémon/hNintendoCreatures/GAME FREAK
BOno for, mais distante ele se transpoctara
Aparentemente, quanto mais protfundo seu
Abra pode se teletransportar durante o sone
raqueza x2
Resistêncda -30
Recue
Tiro Psíquico
20
N° O063 Pokémon Psi Altura: 0,9 m Peso: 19,5 kg
BASICO
Abra
M50
2023 Pokemen/Nintendo/reatures/GAME FREAK
MEWeT o60/165
Ilust. Kurete Se
que agemcomo ventosas de sucÇão.
agarra-se a pedras com seus lábios carnudos,
Em rios de correntezas fortes, este Pokénon`,
    top1: "sv03.5-063 (pt)", top3: "sv03.5-063 (pt)",
    resultado: "correto — Top-1 automático, sem necessidade de confirmação manual (confiança alta, 100%; app usou a leitura correta do número entre as duas encontradas)",
  },
  {
    id: "sv03.5-058", lang: "pt", name: "Growlithe", num: "o58/165",
    ocr: `lust.
Fraqu
OZ023 Pokémon/Nintendo/Creatures/GAME FREAK
GMEWH o58/165
lMust. Afsushi Furusawa
5em medo adversarios maiores e mais fortes.
Tem uma natureza corajosa e leal e enfrenta
Fraqueza 6x2 Resistêncda
Recuo
oponente.
Descarte uma Energia 6 do Pokémon Ativo do seu
Evaporar
10
N° O058 Pokémon Filhote Altura: 0,7 m Peso: 19,0 kg
BASICO
Growlithe
80
wesrS ANE FREAR
har`,
    top1: "sv03.5-058 (pt)", top3: "sv03.5-058 (pt); sv03.5-052 (pt, 35%)",
    resultado: "correto — Top-1 automático, sem necessidade de confirmação manual (confiança alta, 100%)",
  },
  {
    id: "sv03.5-074", lang: "pt", name: "Geodude", num: "o74/16S",
    ocr: `Z023 Pokémon/Nintendo/Creatures/GAME FREAK
G MEWP o74/16S O
Must. Uta
Ingremes. Certas pessoas que o veem em
Usa as suas cduas mãos para escalar penhascOs
açao resolvem se tornar escaladoras.
Fraqueza x2
Resistência
Recuo
Soco com Punho
20
de aplicar Fraqueza e Resistência).
receberá 30 pontos de
dano a menos de ataques (depois
Durante o próximo turno do seu oponente, este
Pokémon
Fortificar
N° 0074 Pokémon Pedra Altura: 0,4 m Peso: 20,0 ka
BASIKO
Geodude
„80
884
n`,
    top1: "sv03.5-074 (pt)", top3: "sv03.5-074 (pt); sv03.5-058 (pt, 30%)",
    resultado: "correto — Top-1 automático, sem necessidade de confirmação manual (confiança alta, 100%)",
  },
  {
    id: "sv03.5-039", lang: "pt", name: "Jigglypuff", num: "039/165",
    ocr: `GMEW
lust. saino misaki
039/165
92023 Pokémon/Nintenda/Creatures/GAME FREAK
fazendo com que os inimigos adormeçam.
canta uma melodia misteriosa e relaxante,
Quando seus enormes olhos ficam pesados,
Fraqueza x2Resistência
Recuo
cada cara.
Jogue 2 moedas. Este ataque causa 20 pontos de dano para
Pisada
20x
baralho.
e cologue-a na sua mão. Em seguida, embaralhe o seu
Procure por uma carta de Apoiador no seu baralho,
revele-a
Liderar
N° 0039 Pokémon Balão Altura: 0,5 m Peso: 5,5 kg
BASIO
Jigglypuff
M70%`,
    top1: "sv03.5-039 (pt)", top3: "sv03.5-039 (pt); sv03.5-131 (pt, 34%)",
    resultado: "correto — Top-1 automático, sem necessidade de confirmação manual (confiança alta, 100%)",
  },
  {
    id: "sv03.5-035", lang: "pt", name: "Clefairy", num: "o35/165",
    ocr: `so
M60
Clefairy
BÁSICO
N° 0035 Pokémon Fada Altura: 0,6 m Peso: 7,5 kg
Convite Lunar
Procure por até 3 Clefairy no seu baralhoe
coloque-os
no seu Banco. Em seguida, embaralhe o seu
baralho.
20
Estalo
Recuo
Resistência
Fraqueza x2
Emuito popular devido ao seù gritinho e
comportamento adoráveis. No entanto este
Pokémon fofinho
raramente éencnradg,
2023 Pokémon/tNintendo/Creatures/GAME FREAK
Bust. ryomo
uralsuka
G MEW P o35/165
BA
G`,
    top1: "sv03.5-035 (pt)", top3: "sv03.5-035 (pt); sv03.5-165 (en, 49%)",
    resultado: "correto — Top-1 automático, sem necessidade de confirmação manual (confiança alta, 100%)",
  },
  {
    id: "sv03.5-025", lang: "en", name: "Pikachu", num: "025/165 (e leitura ruidosa secundária 022/165)",
    ocr: `Must
Fraq
02021 Pokemon/Nintender/Creatures/GAME PREAK
025/165
Must. Naoyo Kimua
energia armazenada nas bolsas emn suas
bochechas.
Quando está con raiva,
descarrega imediatamente a
Fraqueza Dx2 Reslstênca
Recuo
Soco Pikachu
50
baralho.
e ligue-aa este Pokémon. Em seguida, embaralhe
o seu
Procure por uma carta de Energia 4 Básica no
seu baralho
Carga
N° 0025 Pokémon Rato Altura: 0,4 m Peso: 6,0 kg
BASKOO
Pikachu
60
GMEWRl 022/165
terestreG AME FREAK
roubara comida em um instantel
que este Pokémon`,
    top1: "sv03.5-025 (en)", top3: "sv03.5-025 (en); sv03.5-144 (pt, 38%)",
    resultado: "correto — Top-1 automático, sem necessidade de confirmação manual (confiança alta, 100%; app usou a leitura correta do número entre as duas encontradas)",
  },
  {
    id: "sv03.5-052", lang: "pt", name: "Meowth", num: "052/165",
    ocr: `BASIO
Meowth
„7C
BÁSICO
Meowth
N° O052 Pokémon Arranha Gato Altura: 0,4 m Peso: 42 kg
Fraqueza x2
Jogue uma moeda. Se sair cara, mande I dos
Pokémon no
Banco do seu oponente para o Campo Ativo.
lust. Naoki Saito
Miaujude Aqui
GMEW 052/165
Fincar Garras
Reslstência
„70
Recuo
20
Tudo o que este Pokémon faz é dormir
02023 Pokemon/Nintendo/Creatures/GAME FREAK
durante o dia. A noite, patrulha seu
território com seus olhos brilhantes.
lust. Naoki Saito
GMEW o52/165e
Tudo o que este Pokémon faz é dormir
durante o dia. A noite, patrulha seu
território com seus olhos brilhantes.
02023 Pokemon/Nintendo/Creatures/GAME FREAK`,
    top1: "sv03.5-052 (pt)", top3: "sv03.5-052 (pt); sv03.5-001 (de, 34%)",
    resultado: "correto — Top-1 automático, sem necessidade de confirmação manual (confiança alta, 100%)",
  },
  {
    id: "sv03.5-012", lang: "pt", name: "Butterfree", num: "o12/165",
    ocr: `130
Butterfree
STAGO2
NO 0012 Pokémon Borboleta Altura: 1,1 m Peso: 32,0 ka
60
Mande o
Pokémon Ativo do seu oponente para o Banco.
(0 seu oponente escolhe o novo Pokémon Ativo.)
Ataque de Vento
Voo do Adeus
Escolha I dos Pokémon no Banco do seu
oponente. Embaralhe
aquele Pokémone todas as cartas ligadas a ele
no baralho
dele e, em seguida, embaralhe este Pokémone
todas as cartas
ligadas a ele no seu baralho. Se o seu
oponente não tiver
Pokémon no Banco, este ataque não fará nada.
Recuo
Resistência
Fraqueza x2
Coleta mel todos os dias. Para transportá-lo até o
seu ninho, esfrega mel no pelo de suas pernas.
o12/165
Wlust. Tika Matsuno
GMEM
2023 Pokémon/Nintenda/Creatures/GAME FREAK
STAC
Ma
(0
Esc
dele`,
    top1: "sv03.5-012 (pt)", top3: "sv03.5-012 (pt)",
    resultado: "correto — Top-1 (confiança não visível no print, cortada pelo modal)",
  },
  {
    id: "sv03.5-007", lang: "pt", name: "Squirtle", num: "007/165",
    ocr: `BASICO
Squirtle
H60
BASICO
Squirtle
llust. kantaro
N° 0007 Pokémon Tartaruguinha Altura: 0,5 m Peso: 9,0 kg
Fraqueza 42
Jogue uma moeda. Se sair cara, durante o
próximo turno
do seu oponente, previna todo o dano causado a este
Pokémon por ataques.
Retirada
GMEWP 007/165
Quebra-crânio
Resistência
606
Recuo
2023 Pokémon/Nintendo/Creatures/GAME FREAK
20
Quando este Pokémon sente-se amneaçado, escondes
dentro do seu casco e lança água pela boca
lust. kantaro
GMEW P 007/165
Quando este Pokémon sente-se ameaçado, escondes
dentro do seu casco e lança água pela boca
2023 PokérnonNintenda/Creatures/GAME FREAK`,
    top1: "sv03.5-007 (pt)", top3: "sv03.5-007 (pt)",
    resultado: "correto — Top-1 (confiança não visível no print, cortada pelo modal)",
  },
  {
    id: "sv03.5-016", lang: "pt", name: "Pidgey", num: "o16/165",
    ocr: `no e
seu
20
„50
Pidgey
BASISO
N° 0016 Pokémon Passarinho Altura: 0,3 m Peso: 1,8 kg
Chamar a Família
Procure por até 2 Pokémon Básicos no seu
baralho e
coloque-os no seu Banco. Em seguida, embaralhe
o seu
baralho.
20
Investida
Recuo
Resdstênca -30
Fraqueta x2
épertubado, pode contra-atacar ferozmnente.
Edócil e prefere evitar conflitos. No entanto,
quando
EWn o16/165
Must. Ouwwaldo KATO
MEWY
CreaturesGAME FREAK`,
    top1: "sv03.5-016 (pt)", top3: "sv03.5-016 (pt); sv03.5-001 (pt, 30%)",
    resultado: "correto — Top-1 automático, sem necessidade de confirmação manual (confiança alta, 100%)",
  },
  {
    id: "sv03.5-003", lang: "pt", name: "Venusaur ex", num: "003/165",
    ocr: `AME FREAK
GWEWn 003/165 a
Wust, Sbon Graphics
4Nocauteade, seu sponente pega 2 cartas de Prêmio.
Quando seu Pokenon @
Regra dos Pokenan ex
Sraueax2
Resistncla
Recuo
Envenenado.
OPokémon Ativo do seu oponente agora está Confuso e
43Chicotóxico Perigoso
150
dos seus Pokémon.
Campo Ativo, você poderá curar 60 pontos de dano de
Uma vez durante o seu turno, se este Pokémon estiver no
Habilidade Flor
Serena
Aecehgsau
VenusaurX340`,
    top1: "sv03.5-003 (pt) — empatado com sv03.5-003 (en)", top3: "sv03.5-003 (pt); sv03.5-003 (en); sv03.5-143 (pt, 17%)",
    resultado: "correto, mas confirmação manual necessária — nome lido com ruído (\"VenusaurX340\"), mesma ambiguidade de idioma já observada na sessão anterior",
  },
  {
    id: "sv03.5-004", lang: "pt", name: "Charmander", num: "004/16S",
    ocr: `2023 Pokémon/Nintendo/Creatures/GAME FREAK
G MEWn
Must, GIDORA
004/16S
chama apagar sua vida tambem apaga
Desde o momento em que nasce, uma chana
queima na ponta da sua cauda. Sea sua
fraqueza x2
Resistêncla
Recue
Hálito de Fogo Constante 30
Descarte um Estádio em jogo.
Destruição Flamejante
N° 0004 Pokémon Lagarto Altura: 0,6 m Peso: 8,5 kg
BASIGO
Charmander
70
a sua
hama
30`,
    top1: "sv03.5-004 (pt)", top3: "sv03.5-004 (pt); sv03.5-133 (pt, 33%)",
    resultado: "correto — Top-1 automático, sem necessidade de confirmação manual (confiança alta, 100%)",
  },
  {
    id: "sv03.5-001", lang: "pt", name: "Bulbasaur", num: "GMEWPI 001/165",
    ocr: `GMEW P
llust. Yuu
Fraqueza
Cure
2023 Pokémon/Nintendo/Creatures/GAME FREAK
GMEWPI 001/165
llust. Yuu Nishida
armazenados na semente emn suas costas para
cresCe
Durante sua
juventude, usa os nutrientes
Fraqueza x2
Resistência
Recuo
Cure 20 pontos de dano deste Pokémon.
Semente Sanguessuga
20
N° O001 Pokémon Semente Altura: 0,7 m Peso: 6,9 kg
8ASIO
Bulbasaur
„70`,
    top1: "sv03.5-001 (en) — empatado com sv03.5-001 (de)", top3: "sv03.5-001 (en); sv03.5-001 (de, 75%); sv03.5-166 (en, 60%)",
    resultado: "correto, mas confirmação manual necessária — empate entre impressões de idiomas diferentes (en/de/pt/fr todos indexados), mesmo achado documentado na sessão anterior para esta carta",
  },
];

const lines = rows.map((r) =>
  row([
    "EXECUTADO_INFORMAL",
    r.id,
    ORIGEM,
    r.lang,
    "não especificada pelo usuário nesta rodada",
    "não especificado — presumivelmente condição normal (não a condição difícil do protocolo)",
    r.ocr,
    r.name,
    r.num,
    "MEW (achado via busca no texto bruto inteiro — ver setPrintedCode em catalogFixtures.js)",
    r.top1,
    r.top3,
    r.resultado,
    "",
    OBS_BASE,
  ])
);

fs.appendFileSync(CSV_PATH, lines.join(""), "utf8");
console.log(`${lines.length} linhas anexadas em ${CSV_PATH}`);
