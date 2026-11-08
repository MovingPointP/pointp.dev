// デザイントークンと、遊びの値。仕様は docs/spec.md の「デザイントークン」「世界とカメラ」など

export const COLOR = {
  paper: "#fdfdfc",
  gridMinor: "#d1f0fa",
  gridMajor: "#a9daed",
  worldEdge: "#8dcae3",
  border: "#dad9d6",
  borderStrong: "#bcbbb5",
  muted: "#63635e",
  text: "#21201c",
  warning: "#ffc53d",
};

// インク（線の色）。最初は Black
export const INKS = {
  Black: "#1f2d5c",
  Blue: "#0d74ce",
  Red: "#dd4425",
  Green: "#2a7e3b",
  Sepia: "#ab6400",
};

export const LINE_WIDTHS = [6, 12, 24]; // 細・中・太。最初は中
export const START_WIDTH_INDEX = 1;
export const SPEED_STEPS = [0.5, 0.7, 1, 1.4, 2]; // デフォルトに対する倍率
export const START_SPEED_INDEX = 2;
export const LOOP_SECONDS = 20; // デフォルトの速さで世界を一周する秒数

export const GRID = 24; // 方眼の 1 マス
export const MAJOR = GRID * 5; // 太い線の間隔。世界の 1 辺はこの倍数
export const WORLD_MAX = 4080; // 世界の 1 辺の上限（iOS Safari のキャンバスの面積の上限に収める）
export const WORLD_SCALE = 2.5; // 世界の 1 辺 = 開いた時点の画面の長い辺 × 2.5

export const P_HALO = 3; // 点P と「P」の文字の紙の色の縁取り
export const pointDiameter = (lineWidth) => lineWidth + 8;

// 自己紹介
export const INTRO_SECONDS = 5; // 全文を書く時間
export const ZOOM_SECONDS = 1; // 書き終わってカメラが寄る時間（ジョイスティックなどが現れる時間も同じ）
export const SLOW_SECONDS = 0.3; // 書き終わってデフォルトの速さへ落とす時間
export const INTRO_X_HEIGHT = 42; // 小文字の高さ（線の太さの約 3.5 倍）
export const INTRO_MAX = 0.6; // 自己紹介の横幅は世界の 1 辺の 60% まで

// とても小さい画面では、自己紹介だけを見せる
export const PLAYABLE_MIN = 300;
