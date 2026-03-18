import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { buildAnkiPackage } from "./anki";
import { enrichLyrics } from "./gemini";
import { fetchLyrics } from "./lyrics";
import { extractVocabulary } from "./vocabulary";

const app = new Hono()
  .basePath("/api")
  .get(
    "/search",
    zValidator("query", z.object({ q: z.string() })),
    async (c) => {
      const { q } = c.req.valid("query");
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=15&country=JP&lang=ja_jp`;
      const res = await fetch(url);
      const data = await res.json();
      return c.json({
        results: (data.results ?? []) as {
          trackId: number;
          trackName: string;
          artistName: string;
          collectionName: string;
          artworkUrl100: string;
        }[],
      });
    },
  )
  .get(
    "/lyrics",
    zValidator("query", z.object({ artist: z.string(), title: z.string() })),
    async (c) => {
      const { artist, title } = c.req.valid("query");
      try {
        const lyricsText = await fetchLyrics(artist, title);
        const lines = lyricsText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const rawVocab = await extractVocabulary(lyricsText);
        const { translations, meanings } = await enrichLyrics(
          lines,
          rawVocab.map((v) => v.word),
        );
        const vocab = rawVocab.map((v) => ({
          front: v.word,
          back: [v.reading, meanings[v.word], v.pos].filter(Boolean).join("  "),
        }));
        return c.json({ lines, translations, vocab });
      } catch {
        return c.json({ error: "Lyrics not found" }, 404);
      }
    },
  )
  .post(
    "/export",
    zValidator(
      "json",
      z.object({
        deckName: z.string(),
        vocab: z.array(z.object({ front: z.string(), back: z.string() })),
      }),
    ),
    async (c) => {
      const { deckName, vocab } = c.req.valid("json");
      const zip = buildAnkiPackage(deckName, vocab);
      const safeName = deckName.replace(/[^\w\s-]/g, "").trim();
      return new Response(Buffer.from(zip), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${safeName}.apkg"`,
        },
      });
    },
  );

export type AppType = typeof app;
export default app;
