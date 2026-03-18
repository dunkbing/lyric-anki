import { type ItunesSong, processAndSave } from "@/api";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const SEARCH_QUERIES = [
  // Genres
  "J-Pop",
  "J-Rock",
  "アニソン",
  "シティポップ",
  "ボカロ",

  // Current artists
  "米津玄師",
  "YOASOBI",
  "藤井風",
  "あいみょん",
  "Official髭男dism",
  "King Gnu",
  "Ado",
  "back number",
  "Mrs. GREEN APPLE",
  "優里",
  "緑黄色社会",
  "ヨルシカ",
  "imase",
  "SauceG",
  "Vaundy",
  "BE:FIRST",
  "Da-iCE",
  "Number_i",
  "Creepy Nuts",
  "さユり",
  "mol-74",
  "never young beach",
  "羊文学",
  "リュックと添い寝ごはん",
  "illion",
  "cero",
  "折坂悠太",
  "小袋成彬",
  "indigo la End",
  "ゲスの極み乙女",
  "キタニタツヤ",
  "TOMOO",
  "中島みゆき",
  "宇多田ヒカル",
  "椎名林檎",
  "浜崎あゆみ",
  "安室奈美恵",

  // Classic / city pop
  "山下達郎",
  "竹内まりや",
  "大貫妙子",
  "松任谷由実",
  "荒井由実",
  "角松敏生",
  "杏里",
  "稲垣潤一",
  "サザンオールスターズ",
  "桑田佳祐",
  "オフコース",
  "チャゲ&飛鳥",

  // Rock / alt
  "RADWIMPS",
  "凛として時雨",
  "ONE OK ROCK",
  "マキシマムザホルモン",
  "BUCK-TICK",
  "L'Arc-en-Ciel",
  "GLAY",
  "X Japan",
  "LUNA SEA",
  "DIR EN GREY",
  "Bump of Chicken",
  "ASIAN KUNG-FU GENERATION",
  "ストレイテナー",
  "the GazettE",
  "SiM",

  // Anime / vocaloid
  "LiSA",
  "Aimer",
  "Kalafina",
  "FictionJunction",
  "梶浦由記",
  "supercell",
  "ClariS",
  "nano.RIPE",
  "鈴木このみ",
  "fhana",
  "ZAQ",
  "TrySail",
  "内田真礼",
  "水樹奈々",
  "田所あずさ",
  "初音ミク",
  "REOL",
  "まふまふ",
  "そらる",

  // Idol / pop groups
  "AKB48",
  "乃木坂46",
  "櫻坂46",
  "日向坂46",
  "TWICE",
  "Perfume",
  "BABYMETAL",
  "でんぱ組",
  "BiSH",

  // Jazz / soul / R&B
  "Juju",
  "bird",
  "土岐麻子",
  "CHEMISTRY",
  "平井堅",
  "久保田利伸",
  "コブクロ",
];

async function searchItunes(query: string): Promise<ItunesSong[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=25&country=JP&lang=ja_jp`;
  const res = await fetch(url);
  const data = await res.json();
  return data.results ?? [];
}

async function run() {
  console.log(`\n[cron] ${new Date().toISOString()}`);

  const query =
    SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
  console.log(`[cron] searching: "${query}"`);

  const results = await searchItunes(query);
  if (!results.length) return console.log("[cron] no results");

  console.log(`[cron] ${results.length} results — processing new songs`);

  let ok = 0;
  let skipped = 0;
  for (const song of results) {
    try {
      const saved = await processAndSave(song);
      if (saved.processedAt) {
        console.log(`  [ok] ${song.artistName} — ${song.trackName}`);
        ok++;
      }
    } catch (e) {
      console.log(`  [skip] ${song.artistName} — ${song.trackName}: ${e}`);
      skipped++;
    }
  }

  console.log(`[cron] done — ${ok} processed, ${skipped} skipped`);
}

run();
setInterval(run, INTERVAL_MS);
