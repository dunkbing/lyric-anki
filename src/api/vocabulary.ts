import type { IpadicFeatures, Tokenizer } from "kuromoji";
import kuromoji from "kuromoji";
import { isHiragana, isJapanese, isKana, toHiragana } from "wanakana";

let tokenizerCache: Tokenizer<IpadicFeatures> | null = null;

function getTokenizer(): Promise<Tokenizer<IpadicFeatures>> {
  if (tokenizerCache) return Promise.resolve(tokenizerCache);
  return new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath: `${process.cwd()}/node_modules/kuromoji/dict` })
      .build((err, tokenizer) => {
        if (err) return reject(err);
        tokenizerCache = tokenizer;
        resolve(tokenizer);
      });
  });
}

const POS_LABELS: Record<string, string> = {
  名詞: "n.",
  動詞: "v.",
  形容詞: "adj.",
  形容動詞: "adj.",
  副詞: "adv.",
};

function isContentWord(token: IpadicFeatures): boolean {
  const { pos, pos_detail_1: d1 } = token;
  if (!POS_LABELS[pos]) return false;
  if (
    pos === "名詞" &&
    (d1 === "非自立" || d1 === "接尾" || d1 === "数" || d1 === "代名詞")
  )
    return false;
  if (pos === "動詞" && d1 === "非自立") return false;
  const word = token.basic_form === "*" ? token.surface_form : token.basic_form;
  if (word.length === 1 && isHiragana(word)) return false;
  if (!isJapanese(word)) return false;
  return true;
}

export type RawVocabItem = { word: string; reading: string; pos: string };

export async function extractVocabulary(
  lyricsText: string,
): Promise<RawVocabItem[]> {
  const tokenizer = await getTokenizer();
  const tokens = tokenizer.tokenize(lyricsText);
  const seen = new Set<string>();
  const vocab: RawVocabItem[] = [];

  for (const token of tokens) {
    if (!isContentWord(token)) continue;
    const word =
      token.basic_form === "*" ? token.surface_form : token.basic_form;
    if (seen.has(word)) continue;
    seen.add(word);

    const reading =
      token.reading && token.reading !== "*" ? toHiragana(token.reading) : "";
    const pos = POS_LABELS[token.pos] ?? "";
    vocab.push({ word, reading: isKana(word) ? "" : reading, pos });
  }

  return vocab;
}
