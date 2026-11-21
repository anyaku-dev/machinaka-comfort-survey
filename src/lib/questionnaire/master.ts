import type { ChoiceOption, ElementKey, MasterQuestion } from "./types";

/**
 * 国土交通省「まちなかの居心地の良さを測る指標（改訂版 ver.1.1）」設問マスタ。
 *
 * - 文言は調査票PDF（001740895.pdf）からテキスト抽出し、照合した原文。
 * - excelRow は分析ツール（001740896.xlsx）シート「入力①」の行番号。
 * - excelLabel は Excel 側の表記（PDFと異なる場合の差異確認用）。
 * - このファイルを変更した場合は `npm run master:sql` でマイグレーションSQLを再生成する。
 *   既に適用済みの版の行は変更せず、新しい版として追加すること（過去調査の意味を変えないため）。
 */

export const MASTER_VERSION = "ver1.1" as const;

const SRC_PDF = "国土交通省 調査票 ver.1.1 (https://www.mlit.go.jp/toshi/content/001740895.pdf)";
const SRC_PDF_EXCEL =
  "調査票 ver.1.1 (001740895.pdf) / 分析ツール 入力① (001740896.xlsx)";

export const YNU3_OPTIONS: ChoiceOption[] = [
  { value: 1, label: "はい" },
  { value: 2, label: "いいえ" },
  { value: 3, label: "不明" },
];

export const SUBJECTIVE_OPTIONS: ChoiceOption[] = [
  { value: 1, label: "全くそう思わない" },
  { value: 2, label: "あまりそう思わない" },
  { value: 3, label: "少しそう思う" },
  { value: 4, label: "とてもそう思う" },
];

export const ACTIVITY_OPTIONS: ChoiceOption[] = [
  { value: 1, label: "いない" },
  { value: 2, label: "一人いる" },
  { value: 3, label: "数人いる" },
  { value: 4, label: "たくさんいる" },
];

const WEATHER: ChoiceOption[] = [
  { value: "sunny", label: "晴れ" },
  { value: "cloudy", label: "曇り" },
  { value: "rain_snow", label: "雨（雪）" },
];
const WIND: ChoiceOption[] = [
  { value: "none", label: "無風" },
  { value: "light", label: "微風" },
  { value: "strong", label: "強風" },
];

let order = 0;
const next = () => (order += 10);

type BaseInput = Omit<
  MasterQuestion,
  "id" | "version" | "displayOrder" | "defaultVisible" | "notes" | "excelLabel" | "applicability" | "options" | "category" | "pairNo" | "element" | "computedFrom"
> &
  Partial<Pick<MasterQuestion, "defaultVisible" | "notes" | "excelLabel" | "applicability" | "options" | "category" | "pairNo" | "element" | "computedFrom">>;

function base(partial: BaseInput): MasterQuestion {
  const applicability = partial.applicability && Object.keys(partial.applicability).length > 0 ? partial.applicability : null;
  return {
    ...partial,
    id: `${MASTER_VERSION}:${partial.code}`,
    version: MASTER_VERSION,
    displayOrder: next(),
    defaultVisible: partial.defaultVisible ?? true,
    notes: partial.notes ?? null,
    excelLabel: partial.excelLabel ?? null,
    applicability,
    options: partial.options ?? null,
    category: partial.category ?? null,
    pairNo: partial.pairNo ?? null,
    element: partial.element ?? null,
    computedFrom: partial.computedFrom ?? null,
  };
}

// ---------------------------------------------------------------- 基礎情報（調査票 p.1）
const basic: MasterQuestion[] = [
  base({ section: "basic", kind: "fact", code: "BASIC-TIME-START", originalNo: "p1-時間-開始", category: "時間", text: "開始時刻", answerFormat: "time", source: SRC_PDF_EXCEL, verification: "pdf_excel_verified", excelRow: 13, excelLabel: "調査開始時刻" }),
  base({ section: "basic", kind: "fact", code: "BASIC-TIME-END", originalNo: "p1-時間-終了", category: "時間", text: "終了時刻", answerFormat: "time", source: SRC_PDF_EXCEL, verification: "pdf_excel_verified", excelRow: 14, excelLabel: "調査終了時刻" }),
  base({ section: "basic", kind: "fact", code: "BASIC-WEATHER-START", originalNo: "p1-天候-開始時", category: "天候", text: "天候（開始時）", answerFormat: "choice", options: WEATHER, source: SRC_PDF_EXCEL, verification: "pdf_excel_verified", excelRow: 15, excelLabel: "調査開始時の天候" }),
  base({ section: "basic", kind: "fact", code: "BASIC-WEATHER-END", originalNo: "p1-天候-終了時", category: "天候", text: "天候（終了時）", answerFormat: "choice", options: WEATHER, source: SRC_PDF_EXCEL, verification: "pdf_excel_verified", excelRow: 16, excelLabel: "調査終了時の天候" }),
  base({ section: "basic", kind: "fact", code: "BASIC-TEMP-START", originalNo: "p1-気温-開始時", category: "気温", text: "気温（開始時）℃", answerFormat: "number", source: SRC_PDF_EXCEL, verification: "pdf_excel_verified", excelRow: 17, excelLabel: "調査開始時の気温（℃）" }),
  base({ section: "basic", kind: "fact", code: "BASIC-TEMP-END", originalNo: "p1-気温-終了時", category: "気温", text: "気温（終了時）℃", answerFormat: "number", source: SRC_PDF_EXCEL, verification: "pdf_excel_verified", excelRow: 18, excelLabel: "調査終了時の気温（℃）" }),
  base({ section: "basic", kind: "fact", code: "BASIC-WIND-START", originalNo: "p1-風-開始時", category: "風", text: "風（開始時）", answerFormat: "choice", options: WIND, source: SRC_PDF_EXCEL, verification: "pdf_excel_verified", excelRow: 19, excelLabel: "調査開始時の風", notes: "強風：樹木や電線が揺れ、風に向かって歩きにくくなる程度の風（平均風速：10m/s以上）" }),
  base({ section: "basic", kind: "fact", code: "BASIC-WIND-END", originalNo: "p1-風-終了時", category: "風", text: "風（終了時）", answerFormat: "choice", options: WIND, source: SRC_PDF_EXCEL, verification: "pdf_excel_verified", excelRow: 20, excelLabel: "調査終了時の風", notes: "強風：樹木や電線が揺れ、風に向かって歩きにくくなる程度の風（平均風速：10m/s以上）" }),
  base({ section: "basic", kind: "memo", code: "BASIC-MEMO", originalNo: "p1-メモ", category: "メモ", text: "メモ（調査当日の居心地の良さ、滞在者数等に影響すると思われる特筆事項）", answerFormat: "text", source: SRC_PDF_EXCEL, verification: "pdf_excel_verified", excelRow: 21, excelLabel: "メモ（調査当日の居心地の良さ、滞在者数等に影響すると思われる特筆事項）", notes: "例：工事中の場所がある等" }),
];

// ---------------------------------------------------------------- 空間A（調査票 p.2）
const spaceADefs: Array<[string, string, string, number]> = [
  ["A01", "建物｜利用｜飲食店｜利用者の様子が見やすい｜屋外の滞留空間あり（テラス席等）", "建物/利用/飲食店", 61],
  ["A02", "建物｜利用｜飲食店｜利用者の様子が見やすい｜屋外の滞留空間なし", "建物/利用/飲食店", 62],
  ["A03", "建物｜利用｜飲食店｜利用者の様子が見にくい", "建物/利用/飲食店", 63],
  ["A04", "建物｜利用｜販売店｜利用者の様子が見やすい｜屋外の滞留空間あり（店頭販売等）", "建物/利用/販売店", 64],
  ["A05", "建物｜利用｜販売店｜利用者の様子が見やすい｜屋外の滞留空間なし", "建物/利用/販売店", 65],
  ["A06", "建物｜利用｜販売店｜利用者の様子が見にくい", "建物/利用/販売店", 66],
  ["A07", "建物｜利用｜その他｜利用者の様子が見やすい｜屋外の滞留空間あり", "建物/利用/その他", 67],
  ["A08", "建物｜利用｜その他｜利用者の様子が見やすい｜屋外の滞留空間なし", "建物/利用/その他", 68],
  ["A09", "建物｜利用｜その他｜利用者の様子が見にくい", "建物/利用/その他", 69],
  ["A10", "建物｜未利用", "建物/未利用", 70],
  ["A11", "土地｜滞留空間として活用（広場や公園 など）｜イベントの実施（キッチンカーの設置等を含む）", "土地/滞留空間として活用", 71],
  ["A12", "土地｜滞留空間として活用（広場や公園 など）｜実施なし", "土地/滞留空間として活用", 72],
  ["A13", "土地｜滞留空間として未活用（空き地、駐車場としての利用 など）", "土地/滞留空間として未活用", 73],
];
const spaceA: MasterQuestion[] = [
  ...spaceADefs.map(([code, text, category, row], i) =>
    base({
      section: "space_a",
      kind: "count",
      code,
      originalNo: `A-${i + 1}`,
      category,
      text,
      answerFormat: "count",
      source: SRC_PDF_EXCEL,
      verification: "pdf_excel_verified",
      excelRow: row,
      notes:
        code === "A01" ? "飲食店の例：カフェ、レストラン など" : code === "A04" ? "販売店の例：服飾店、雑貨・文具店、花屋、家具屋 など（販売店の定義は事前に関係者間ですり合わせる）" : null,
    }),
  ),
  base({ section: "space_a", kind: "memo", code: "A-MEMO", originalNo: "A-メモ", category: "メモ", text: "メモ（上記以外で「居心地が良く歩きたくなる」空間の創出に影響を与えると思われるもの）", answerFormat: "text", source: SRC_PDF_EXCEL, verification: "pdf_excel_verified", excelRow: 74, notes: "例）1階部分がピロティになっている、著しく劣化した民家がある 等" }),
];

// ---------------------------------------------------------------- 空間B（調査票 p.3-4）
type BDef = [number, string, string | null, boolean];
// [No, 調査票の文言, Excel表記（異なる場合のみ）, 周辺エリア(※)]
const spaceBDefs: BDef[] = [
  [1, "飲食物を買うことができる設備・場所がある（※）（例：自動販売機、キッチンカー等）", "飲食物を買うことができる設備・場所がある", true],
  [2, "給水・手洗いができる場所がある（※）", "給水・手洗いができる場所がある", true],
  [3, "雨宿りできる場所がある（※）", "雨宿りできる場所がある", true],
  [4, "トイレがある（※）", "トイレがある", true],
  [5, "多目的トイレがある（※）", "多目的トイレがある", true],
  [6, "案内所・案内板・デジタルサイネージ等がある（※）", "案内所・掲示板・デジタルサイネージ等がある", true],
  [7, "No.6の案内板等が外国語に対応している（※）", "案内板等が外国語に対応している", true],
  [8, "近くに交番・警察署がある（※）", "近くに交番・警察署がある", true],
  [9, "人の活動エリアから隔離された場所に喫煙スペースがある（※）", "人の活動エリアから隔離された場所に喫煙スペースがある", true],
  [10, "荷物を預けられる場所がある（※）", "荷物を預けられる場所がある", true],
  [11, "イスやテーブルなどの設備に可変性がある", null, false],
  [12, "座れる場がある", null, false],
  [13, "自由に使えるテーブルがある", null, false],
  [14, "ゴミ箱がある", null, false],
  [15, "子ども用の遊具がある", null, false],
  [16, "誰でも自由に入れる芝生がある", null, false],
  [17, "夜間照明設備がある", null, false],
  [18, "車いす利用者やベビーカー利用者が通行しやすい段差の無い動線がある", null, false],
  [19, "防犯カメラがある", null, false],
  [20, "様々な目的で活用できるスペースがある（場を可変的に活用できる）", null, false],
  [21, "体操や運動ができるスペースがある（運動器具は無いが、体操・運動はできる開けたスペースを含む）", "体操や運動に利用可能な場がある", false],
  [22, "イベントを開催できるスペースがある", null, false],
  [23, "Wi-Fi、電源が整備されている", null, false],
  [24, "点字ブロックや音の鳴る信号がある", null, false],
  [25, "車両進入防止設備がある", null, false],
  [26, "建物等への車両進入口が歩行空間を分離しないよう配慮されている", null, false],
  [27, "歩行者専用道路になっている（曜日や時間に応じた一時的な指定も含む）", null, false],
  [28, "車道と歩道が分かれている", null, false],
  [29, "自転車レーンと歩道が分かれている", "自動車レーンと歩道が分かれている", false],
  [30, "車両の速度を抑制する対策が講じられている（ゾーン30の指定、ハンプ、狭さく、シケイン等）", null, false],
  [31, "近くにレンタサイクルや電動キックボードなどシェアモビリティのポートがある（※）", "近くにレンタサイクルや電動キックボードなどシェアモビリティのポートがある", true],
  [32, "アート・展示空間がある", null, false],
  [33, "電灯／樹木に、目にとまるような魅力的な装飾が設けられている", null, false],
  [34, "管理の行き届いた植栽（植木・花壇等）がある", null, false],
  [35, "アスファルト以外の舗装材が整備されている", "アスファルト以外の化粧材が整備されている", false],
  [36, "無電柱化されている", null, false],
  [37, "親水空間がある", null, false],
  [38, "歴史・伝統を感じる建物がある（※）", "歴史・伝統を感じる建物がある", true],
  [39, "伝統的なお店がある（※）", "伝統的なお店がある", true],
  [40, "近くに駐輪場がある（※）", "近くに駐輪場がある", true],
  [41, "近くに駐車場がある（※）", "近くに駐車場がある", true],
  [42, "近くに公共交通（駅・バス停）がある（※）", "近くに公共交通（駅・バス停）がある", true],
];

function bCategory(no: number): string {
  if (no <= 23) return "滞在";
  if (no <= 31) return "回遊";
  if (no <= 39) return "景観・雰囲気";
  return "アクセス";
}

const spaceB: MasterQuestion[] = [
  ...spaceBDefs.map(([no, text, excelLabel, peripheral]) => {
    const code = `B${String(no).padStart(2, "0")}`;
    const notes: string[] = [];
    if (no === 7) notes.push("No.6 が「はい」でない場合は「適用外」を選択可（アプリの運用。調査票に明示の分岐指示はない）");
    if (no >= 24 && no <= 31) notes.push("活用の手引き：回遊のしやすさはストリート限定項目のため、広場では計測不要");
    if (excelLabel && excelLabel !== text.replace(/（※）/g, "")) notes.push(`Excel表記「${excelLabel}」と相違（調査票の文言を採用）`);
    if (no >= 40) notes.push("類型名「アクセス」はExcel/結果シートの表記に依拠（調査票PDFでは類型名を抽出できず）");
    return base({
      section: "space_b",
      kind: "fact",
      code,
      originalNo: `B-${no}`,
      category: bCategory(no),
      text,
      answerFormat: "ynu3",
      options: YNU3_OPTIONS,
      applicability: {
        ...(peripheral ? { peripheral: true } : {}),
        ...(no >= 24 && no <= 31 ? { siteTypes: ["street" as const] } : {}),
        ...(no === 7 ? { dependsOn: "B06" } : {}),
      },
      source: SRC_PDF_EXCEL,
      verification: "pdf_excel_verified",
      excelRow: 74 + no,
      excelLabel: excelLabel ?? text,
      notes: notes.length ? notes.join(" / ") : null,
    });
  }),
  base({ section: "space_b", kind: "memo", code: "B-MEMO", originalNo: "B-メモ", category: "メモ", text: "メモ（空間の状態を確認する中で、現地での具体の状態や問題点など、気になった点）", answerFormat: "text", source: SRC_PDF, verification: "pdf_verified", excelRow: null }),
];

// ---------------------------------------------------------------- 居心地の良さ（調査票 p.7-11）
type PairDef = [string, string, number];
const ELEMENT_PREFIX: Record<ElementKey, string> = { anshin: "ANS", kanyo: "KAN", yasuragi: "YAS", kitai: "KIT" };
const ELEMENT_LABEL: Record<ElementKey, string> = { anshin: "安心感", kanyo: "寛容性", yasuragi: "安らぎ感", kitai: "期待感" };

function pairs(element: ElementKey, defs: PairDef[], page: string, extra: Record<number, { notes?: string; nightOnly?: boolean; countGroupsActivity?: boolean }> = {}): MasterQuestion[] {
  const out: MasterQuestion[] = [];
  defs.forEach(([subj, act, sRow], idx) => {
    const no = idx + 1;
    const nn = String(no).padStart(2, "0");
    const e = extra[no] ?? {};
    const section = element === "kanyo" ? "kanyo" : element;
    out.push(
      base({
        section,
        element,
        kind: "subjective",
        code: `${ELEMENT_PREFIX[element]}-${nn}-S`,
        pairNo: no,
        originalNo: `${ELEMENT_LABEL[element]}${element === "kanyo" ? "❷" : ""}-${no}-主観`,
        category: ELEMENT_LABEL[element],
        text: subj,
        answerFormat: "scale4",
        options: SUBJECTIVE_OPTIONS,
        applicability: e.nightOnly ? { nightOnly: true } : null,
        source: `${SRC_PDF_EXCEL} ${page}`,
        verification: "pdf_excel_verified",
        excelRow: sRow,
        notes: e.notes ?? null,
      }),
      base({
        section,
        element,
        kind: "activity",
        code: `${ELEMENT_PREFIX[element]}-${nn}-A`,
        pairNo: no,
        originalNo: `${ELEMENT_LABEL[element]}${element === "kanyo" ? "❷" : ""}-${no}-活動`,
        category: ELEMENT_LABEL[element],
        text: act,
        answerFormat: "scale4",
        options: ACTIVITY_OPTIONS,
        applicability: e.nightOnly ? { nightOnly: true } : e.countGroupsActivity ? { countGroups: true } : null,
        source: `${SRC_PDF_EXCEL} ${page}`,
        verification: "pdf_excel_verified",
        excelRow: sRow + 1,
        excelLabel: e.countGroupsActivity ? act.replace("（※）", "") : null,
        notes: e.countGroupsActivity ? "（※）個人の数ではなく、グループの数をカウントして回答" : e.notes ?? null,
      }),
    );
  });
  return out;
}

const anshin = pairs(
  "anshin",
  [
    ["安心して赤ちゃんを連れてこられる場所だと感じる", "赤ちゃんを連れている人がいる", 122],
    ["安心して子どもを遊ばせられる場所だと感じる", "子どもを遊ばせている", 124],
    ["地域の人など「人の目による防犯」が行われている安全な場所だと感じる", "地域の人や警備員など「人の目による防犯」が行われている", 126],
    ["足腰の弱い人や車いす・ベビーカーの利用者が気軽に利用できる場所だと感じる", "足腰の弱い人や車いす・ベビーカーの利用者が移動・滞在している", 128],
    ["空間が綺麗に利用されていて気持ちよく過ごせると感じる", "ゴミを片付ける人がいる", 130],
    ["気持ち良く食事ができる場所だと感じる", "食事をしている人がいる", 132],
    ["他の人との距離が不快ではないと感じる", "人とぶつからない距離を保ち歩いている", 134],
    ["滞在者・通行者同士がお互いに顔や名前を知っているように感じる", "挨拶や世間話をしている人がいる", 136],
    ["車やバイクの往来を気にせず歩けると感じる", "車やバイクの往来を気にせず歩いている人がいる", 138],
    ["周りを気にせず立ち止まって会話できる場所だと感じる", "立ち止まって会話をしている人がいる", 140],
    ["夜一人で歩いても不安にならない場所だと感じる", "夜一人で歩いている人がいる", 142],
  ],
  "p.7",
  { 11: { nightOnly: true, notes: "※本項目は夜間に計測した場合に回答" } },
);

// 寛容性 ❶活動の種類（調査票 p.8）。1～20 は Excel 式で自動計算（記入不要）、21～23 は入力。
const activityTypeDefs: Array<[number, string, string | null, string[] | null]> = [
  [1, "遊んでいる", null, ["ANS-02-S", "KAN-02-S"]],
  [2, "食事をしている", null, ["ANS-06-A", "KIT-02-A"]],
  [3, "会話をしている", null, ["ANS-08-A", "ANS-10-A", "KIT-01-A"]],
  [4, "横になっている", null, ["KAN-03-A", "YAS-03-A"]],
  [5, "個々の趣味の練習をしている", null, ["KAN-04-A"]],
  [6, "ペットを連れている", null, ["KAN-05-A"]],
  [7, "私服やスーツなど多様な服装で来ている", null, ["KAN-08-A"]],
  [8, "仕事をしている", null, ["KAN-09-A"]],
  [9, "写真や動画を撮っている", null, ["KIT-08-A"]],
  [10, "運動をしている", null, ["KAN-11-A", "YAS-12-A"]],
  [11, "ぼーっとしている", null, ["YAS-01-A"]],
  [12, "座っている", null, ["YAS-02-A"]],
  [13, "読書・スマホ操作をしている", null, ["YAS-04-A"]],
  [14, "景色を眺めている", null, ["YAS-05-A", "YAS-06-A"]],
  [15, "陽だまり、日陰で過ごしている", "陽だまり日陰で過ごしている", ["YAS-07-A"]],
  [16, "散歩をしている", null, ["YAS-09-A"]],
  [17, "お茶をしている", null, ["YAS-11-A"]],
  [18, "買い物をしている", null, ["KIT-05-A"]],
  [19, "パフォーマンスをしている", null, ["KIT-06-A"]],
  [20, "音楽にのっている", null, ["KIT-09-A"]],
  [21, "勉強をしている", null, null],
  [22, "絵を描いている", null, null],
  [23, "ボードゲームをしている", null, null],
];

const kanyoTypes: MasterQuestion[] = activityTypeDefs.map(([no, text, excelLabel, from]) =>
  base({
    section: "kanyo_type",
    element: "kanyo",
    kind: from ? "activity_type_computed" : "activity_type",
    code: `KAN-T${String(no).padStart(2, "0")}`,
    originalNo: `寛容性❶-${no}`,
    category: "寛容性 活動の種類",
    text,
    answerFormat: from ? "computed" : "scale4",
    options: ACTIVITY_OPTIONS,
    source: `${SRC_PDF_EXCEL} p.8`,
    verification: from ? (no === 1 ? "unverified" : "pdf_excel_verified") : "pdf_excel_verified",
    excelRow: 145 + no,
    excelLabel: excelLabel ?? text,
    computedFrom: from,
    notes: from
      ? no === 1
        ? "Excel式 =MAX(L124,L178) は安心感2・寛容性2の『主観』行を参照しており、他の19項目（活動行を参照）と不整合。意図の確認まで未検証扱い"
        : "調査票：1～20は４要素の計測結果から自動計算（記入不要）。算出式は Excel 入力①の式を採用"
      : null,
  }),
);

const kanyo = pairs(
  "kanyo",
  [
    ["気軽に出入りできる場所だと感じる（沿道建物も含む）", "入ること、近づくことをためらわず、その場を利用している（沿道建物も含む）", 176],
    ["子どもが声を出して遊べる場所だと感じる", "子どもが声を出して遊んでいる", 178],
    ["周りを気にせずうたた寝できる場所だと感じる", "うたた寝をしている人がいる", 180],
    ["ダンス、楽器、スポーツなどの練習をしたい場所だと感じる", "ダンス、楽器、スポーツなどの個々人の趣味の練習をしている人がいる", 182],
    ["ペットを連れて行っても良い場所だと感じる", "ペットを連れている人がいる", 184],
    ["思い思いの時間を過ごすことができる場所だと感じる", "思い思いの時間を過ごしている", 186],
    ["一人でも複数人でも過ごしやすい場所だと感じる", "一人で過ごす人、複数人で過ごす人々の両方がいる", 188],
    ["好きな格好で行っても良い場所だと感じる", "私服やスーツなど多様な服装の人がいる", 190],
    ["パソコンやWeb会議で仕事をすることが許容されると感じる", "パソコンやWeb会議で仕事をしている人がいる", 192],
    ["自分のペースで歩ける場所だと感じる", "周囲より遅いペースで歩いている人がいる", 194],
    ["ジョギングなどの軽い運動ができそうな場所だと感じる", "ジョギングなどの軽い運動をしている人がいる", 196],
  ],
  "p.9",
);

const yasuragi = pairs(
  "yasuragi",
  [
    ["ぼーっとできる場所だと感じる", "ぼーっとしている人がいる", 200],
    ["座って休憩したり、くつろいだりしたい場所だと感じる", "座って休憩したり、くつろいだりしている人がいる", 202],
    ["横になってくつろぎたい場所だと感じる", "横になって過ごしている人がいる", 204],
    ["ゆったり読書をしたい場所だと感じる", "読書をしたり、スマートフォン・タブレットを操作したりする人がいる", 206],
    ["緑などに囲まれて自然を感じられる場所だと感じる", "花壇や緑などを眺める人がいる", 208],
    ["水辺を眺め、たたずんでいられる場所だと感じる", "水辺を眺め、たたずんでいる人がいる", 210],
    ["陽だまり、または日陰で過ごしたい場所だと感じる", "日光を楽しむ、日陰で過ごす人がいる", 212],
    ["眺めたいまちなみや景色があると感じる", "まちなみや景色を眺める人がいる", 214],
    ["ぶらぶらと歩きたい場所だと感じる", "散歩をしている人がいる", 216],
    ["長居したい場所だと感じる", "長時間滞在している人がいる（長時間：30分程度）", 218],
    ["ゆったりお茶をしたい場所だと感じる", "お茶をしている人がいる", 220],
    ["体を軽く動かしてリラックスできる場所だと感じる（ヨガや体操・ストレッチ等）", "ヨガや体操・ストレッチをしている人がいる", 222],
  ],
  "p.10",
);

const kitai = pairs(
  "kitai",
  [
    ["友人や恋人と来て過ごしたい場所だと感じる", "笑いながら話をしている人がいる", 226],
    ["複数人で飲食をしたい場所だと感じる（ピクニックを含む）", "複数人で飲食をしている（ピクニックを含む）（※）", 228],
    ["人との新しい出会いがありそうな場所だと感じる", "会話・交流している人がいる", 230],
    ["人が群がりそうな面白そう・雰囲気の良いものがある場所だと感じる", "何かに人が群がっている", 232],
    ["沿道や近くでウィンドウショッピングを楽しみたい場所だと感じる", "沿道や近くでウィンドウショッピングや買い物をしている人がいる", 234],
    ["パフォーマンスができる場所だと感じる", "パフォーマンスをしている人がいる", 236],
    ["魅力的なコンテンツがあり、子どもや大人が楽しく遊べる場所だと感じる", "子どもや大人が夢中になって遊んでいる", 238],
    ["写真や動画に映える・誰かにシェアしたい場所だと感じる", "写真や動画を撮っている人がいる", 240],
    ["雰囲気に合った音楽が流れていると感じる", "音楽にのっている人がいる", 242],
  ],
  "p.11",
  { 2: { countGroupsActivity: true } },
);

// ---------------------------------------------------------------- 滞在者・通行者（調査票 p.5-6）
const observation: MasterQuestion[] = [
  base({ section: "observation", kind: "observation_attribute", code: "OBS-PRESENCE", originalNo: "滞在者・通行者-滞在・通行", category: "滞在・通行", text: "滞在・通行（滞在者：その場で立ち止まり、何かしらの活動をした人／通行者：滞在者以外の人）", answerFormat: "observation", options: [{ value: "stay", label: "滞在" }, { value: "pass", label: "通行" }], source: SRC_PDF, verification: "pdf_verified", excelRow: null, notes: "ver.1.1 の定義。旧案の「3分以上」は条件にしない（分析ツール結果シート②の注記には旧定義が残存）" }),
  base({ section: "observation", kind: "observation_attribute", code: "OBS-GROUP", originalNo: "滞在者・通行者-グループ", category: "1人・家族・グループ・団体", text: "1人・家族・グループ・団体（グループ：家族以外の少人数グループ）", answerFormat: "observation", options: [{ value: "single", label: "1人" }, { value: "family", label: "家族" }, { value: "group", label: "グループ" }, { value: "party", label: "団体" }], source: "調査票 p.5 / 活用の手引き p.27（家族は夫婦2人の場合も含む。団体は10人以上でツアー等団体行動をしている集団）", verification: "pdf_verified", excelRow: null }),
  base({ section: "observation", kind: "observation_attribute", code: "OBS-GENDER", originalNo: "滞在者・通行者-性別", category: "性別", text: "性別", answerFormat: "observation", options: [{ value: "male", label: "男性" }, { value: "female", label: "女性" }, { value: "genderUnknown", label: "わからない" }], source: SRC_PDF, verification: "pdf_verified", excelRow: null }),
  base({ section: "observation", kind: "observation_attribute", code: "OBS-AGE", originalNo: "滞在者・通行者-年齢", category: "年齢", text: "年齢（見た目で一番近いと思うカテゴリー。高齢者はWHOの定義により65歳以上を目安）", answerFormat: "observation", options: [{ value: "infant", label: "乳幼児" }, { value: "child", label: "小学生" }, { value: "teen", label: "中高生" }, { value: "adult", label: "大人" }, { value: "elderly", label: "高齢者" }, { value: "ageUnknown", label: "わからない" }], source: SRC_PDF, verification: "pdf_verified", excelRow: null }),
  base({ section: "observation", kind: "observation_attribute", code: "OBS-BEHAVIOR", originalNo: "滞在者・通行者-行動", category: "行動（通行者のみ）", text: "行動（通行者のみ）", answerFormat: "observation", options: [{ value: "walkFast", label: "スタスタ歩いている" }, { value: "walkSlow", label: "のんびり歩いている" }], applicability: { passOnly: true }, source: SRC_PDF, verification: "pdf_verified", excelRow: null, notes: "スタスタ：早歩きで急いでいる／のんびり：おしゃべりをしている、景色を眺めている等ゆっくりと歩いている（活用の手引き p.27）" }),
  base({ section: "observation", kind: "observation_attribute", code: "OBS-NATIONALITY", originalNo: "滞在者・通行者-国籍", category: "国籍", text: "国籍", answerFormat: "observation", options: [{ value: "japanese", label: "日本人" }, { value: "foreigner", label: "外国人" }, { value: "nationalityUnknown", label: "わからない" }], source: SRC_PDF, verification: "pdf_verified", excelRow: null }),
];

export const QUESTION_MASTER: MasterQuestion[] = [
  ...basic,
  ...spaceA,
  ...spaceB,
  ...observation,
  ...anshin,
  ...kanyoTypes,
  ...kanyo,
  ...yasuragi,
  ...kitai,
];

export const ELEMENT_LABELS = ELEMENT_LABEL;

export const SECTION_LABELS: Record<string, string> = {
  basic: "基礎情報",
  space_a: "空間A（沿道建物・土地）",
  space_b: "空間B（機能・設え）",
  observation: "滞在者・通行者",
  anshin: "安心感",
  kanyo_type: "寛容性（活動の種類）",
  kanyo: "寛容性（主観・活動）",
  yasuragi: "安らぎ感",
  kitai: "期待感",
};

export const SECTION_ORDER = [
  "basic",
  "space_a",
  "space_b",
  "observation",
  "anshin",
  "kanyo_type",
  "kanyo",
  "yasuragi",
  "kitai",
] as const;

/** 観察属性のうち非表示にできないもの */
export const REQUIRED_OBSERVATION_CODES = ["OBS-PRESENCE", "OBS-GROUP"];

export function findMaster(code: string): MasterQuestion | undefined {
  return QUESTION_MASTER.find((q) => q.code === code);
}
