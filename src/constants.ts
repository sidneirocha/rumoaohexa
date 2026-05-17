export const FIFA_TO_ISO: { [key: string]: string } = {
  MEX: "mx",
  RSA: "za",
  KOR: "kr",
  CZE: "cz",
  CAN: "ca",
  BIH: "ba",
  QAT: "qa",
  SUI: "ch",
  BRA: "br",
  MAR: "ma",
  HAI: "ht",
  SCO: "gb-sct",
  USA: "us",
  PAR: "py",
  AUS: "au",
  TUR: "tr",
  GER: "de",
  CUW: "cw",
  CIV: "ci",
  ECU: "ec",
  NED: "nl",
  JPN: "jp",
  SWE: "se",
  TUN: "tn",
  BEL: "be",
  EGY: "eg",
  IRN: "ir",
  NZL: "nz",
  ESP: "es",
  CPV: "cv",
  KSA: "sa",
  URU: "uy",
  FRA: "fr",
  SEN: "sn",
  IRQ: "iq",
  NOR: "no",
  ARG: "ar",
  ALG: "dz",
  AUT: "at",
  JOR: "jo",
  POR: "pt",
  COD: "cd",
  UZB: "uz",
  COL: "co",
  ENG: "gb-eng",
  CRO: "hr",
  GHA: "gh",
  PAN: "pa",
};

export const COLORS = {
  cyan: "#00fbff",
  red: "#ff1700",
  green: "#00cf2d",
  yellow: "#f7ff00",
  purple: "#7b00ff",
  salmon: "#ff9386",
  blue: "#0051ff",
};

export const GROUPS = [
  {
    name: "A",
    teams: [
      { code: "MEX", name: "México" },
      { code: "RSA", name: "África do Sul" },
      { code: "KOR", name: "Coréia do Sul" },
      { code: "CZE", name: "Rep. Tcheca" },
    ],
  },
  {
    name: "B",
    teams: [
      { code: "CAN", name: "Canadá" },
      { code: "BIH", name: "Bósnia" },
      { code: "QAT", name: "Qatar" },
      { code: "SUI", name: "Suíça" },
    ],
  },
  {
    name: "C",
    teams: [
      { code: "BRA", name: "Brasil" },
      { code: "MAR", name: "Marrocos" },
      { code: "HAI", name: "Haiti" },
      { code: "SCO", name: "Escócia" },
    ],
  },
  {
    name: "D",
    teams: [
      { code: "USA", name: "Estados Unidos" },
      { code: "PAR", name: "Paraguai" },
      { code: "AUS", name: "Austrália" },
      { code: "TUR", name: "Turquia" },
    ],
  },
  {
    name: "E",
    teams: [
      { code: "GER", name: "Alemanha" },
      { code: "CUW", name: "Curaçao" },
      { code: "CIV", name: "Costa do Marfim" },
      { code: "ECU", name: "Equador" },
    ],
  },
  {
    name: "F",
    teams: [
      { code: "NED", name: "Holanda" },
      { code: "JPN", name: "Japão" },
      { code: "SWE", name: "Suécia" },
      { code: "TUN", name: "Tunisia" },
    ],
  },
  {
    name: "G",
    teams: [
      { code: "BEL", name: "Bélgica" },
      { code: "EGY", name: "Egito" },
      { code: "IRN", name: "Irã" },
      { code: "NZL", name: "Nova Zelândia" },
    ],
  },
  {
    name: "H",
    teams: [
      { code: "ESP", name: "Espanha" },
      { code: "CPV", name: "Cabo Verde" },
      { code: "KSA", name: "Arábia Saudita" },
      { code: "URU", name: "Uruguai" },
    ],
  },
  {
    name: "I",
    teams: [
      { code: "FRA", name: "França" },
      { code: "SEN", name: "Senegal" },
      { code: "IRQ", name: "Iraque" },
      { code: "NOR", name: "Noruega" },
    ],
  },
  {
    name: "J",
    teams: [
      { code: "ARG", name: "Argentina" },
      { code: "ALG", name: "Argélia" },
      { code: "AUT", name: "Áustria" },
      { code: "JOR", name: "Jordânia" },
    ],
  },
  {
    name: "K",
    teams: [
      { code: "POR", name: "Portugal" },
      { code: "COD", name: "Congo" },
      { code: "UZB", name: "Uzbequistão" },
      { code: "COL", name: "Colômbia" },
    ],
  },
  {
    name: "L",
    teams: [
      { code: "ENG", name: "Inglaterra" },
      { code: "CRO", name: "Croácia" },
      { code: "GHA", name: "Gana" },
      { code: "PAN", name: "Panamá" },
    ],
  },
];

export const SPECIALS = [
  { name: "Página Inicial & História", code: "FWC", range: [0, 19] },
  { name: "Coca-Cola", code: "CC", range: [1, 14] },
];

export const LEGENDS_PLAYERS = [
  { name: "Cristiano Ronaldo", code: "CR7", img: "https://img.a.transfermarkt.technology/portrait/header/2522.jpg?lm=1" },
  { name: "Lionel Messi", code: "MES", img: "https://img.a.transfermarkt.technology/portrait/header/28003.jpg?lm=1" },
  { name: "Achraf Hakimi", code: "HAK", img: "https://img.a.transfermarkt.technology/portrait/header/395516.jpg?lm=1" },
  { name: "Kylian Mbappé", code: "MBA", img: "https://img.a.transfermarkt.technology/portrait/header/342229.jpg?lm=1" },
  { name: "Jérémy Doku", code: "DOK", img: "https://img.a.transfermarkt.technology/portrait/header/564511.jpg?lm=1" },
  { name: "Florian Wirtz", code: "WIR", img: "https://img.a.transfermarkt.technology/portrait/header/598577.jpg?lm=1" },
  { name: "Lamine Yamal", code: "YAM", img: "https://img.a.transfermarkt.technology/portrait/header/924658.jpg?lm=1" },
  { name: "Erling Haaland", code: "HAA", img: "https://img.a.transfermarkt.technology/portrait/header/418560.jpg?lm=1" },
  { name: "Cody Gakpo", code: "GAK", img: "https://img.a.transfermarkt.technology/portrait/header/434675.jpg?lm=1" },
  { name: "Vinícius Júnior", code: "VIN", img: "https://img.a.transfermarkt.technology/portrait/header/371998.jpg?lm=1" },
  { name: "Christian Pulisic", code: "PUL", img: "https://img.a.transfermarkt.technology/portrait/header/316353.jpg?lm=1" },
  { name: "Federico Valverde", code: "VAL", img: "https://img.a.transfermarkt.technology/portrait/header/369178.jpg?lm=1" },
  { name: "Heung-min Son", code: "SON", img: "https://img.a.transfermarkt.technology/portrait/header/91845.jpg?lm=1" },
  { name: "Raúl Jiménez", code: "JIM", img: "https://img.a.transfermarkt.technology/portrait/header/206040.jpg?lm=1" },
  { name: "Alphonso Davies", code: "DAV", img: "https://img.a.transfermarkt.technology/portrait/header/424204.jpg?lm=1" },
  { name: "Luka Modrić", code: "MOD", img: "https://img.a.transfermarkt.technology/portrait/header/27992.jpg?lm=1" },
  { name: "Mohamed Salah", code: "SAL", img: "https://img.a.transfermarkt.technology/portrait/header/148455.jpg?lm=1" },
  { name: "Moisés Caicedo", code: "CAI", img: "https://img.a.transfermarkt.technology/portrait/header/687626.jpg?lm=1" },
  { name: "Luis Díaz", code: "DIA", img: "https://img.a.transfermarkt.technology/portrait/header/480654.jpg?lm=1" },
  { name: "Jude Bellingham", code: "BEL", img: "https://img.a.transfermarkt.technology/portrait/header/581678.jpg?lm=1" },
];

export const LEGENDS_VARIANTS: ('bordo' | 'silver' | 'gold' | 'purple')[] = ['bordo', 'silver', 'gold', 'purple'];
export const VARIANT_COLORS = {
  bordo: '#6e001c',
  silver: '#c0c0c0',
  gold: '#d4af37',
  purple: '#6a0dad',
};
