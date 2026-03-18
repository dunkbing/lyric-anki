import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: { responseMimeType: "application/json" },
});

type GeminiResult = {
  translations: string[];
  meanings: Record<string, string>;
};

export async function enrichLyrics(
  lines: string[],
  words: string[],
): Promise<GeminiResult> {
  const prompt = `You are a Japanese language assistant helping with song lyrics study.

Given the lyrics lines and vocabulary words below, return a JSON object with:
1. "translations": array of English translations, one per line (same order, same length). Use empty string for lines that are already English or have no Japanese.
2. "meanings": object mapping each vocabulary word to a short English meaning (2-5 words).

Lyrics lines (${lines.length} total):
${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}

Vocabulary words:
${words.join(", ")}

Return only valid JSON matching: { "translations": string[], "meanings": Record<string, string> }`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = JSON.parse(text) as Partial<GeminiResult>;

  return {
    translations: parsed.translations ?? lines.map(() => ""),
    meanings: parsed.meanings ?? {},
  };
}
