import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "@/db";
import { songs } from "@/db/schema";
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
  .post(
    "/song",
    zValidator(
      "json",
      z.object({
        trackId: z.number(),
        trackName: z.string(),
        artistName: z.string(),
        collectionName: z.string(),
        artworkUrl100: z.string(),
      }),
    ),
    async (c) => {
      const { trackId, trackName, artistName, collectionName, artworkUrl100 } =
        c.req.valid("json");
      const id = String(trackId);
      await db
        .insert(songs)
        .values({
          id,
          trackName,
          artistName,
          collectionName,
          artworkUrl: artworkUrl100,
        })
        .onConflictDoNothing();
      return c.json({ id });
    },
  )
  .get("/song/:id", async (c) => {
    const id = c.req.param("id");
    const song = await db.query.songs.findFirst({
      where: eq(songs.id, id),
    });
    if (!song) return c.json({ error: "Song not found" }, 404);

    // Return cached if already processed
    if (song.processedAt && song.lines && song.translations && song.vocab) {
      return c.json({
        id: song.id,
        trackName: song.trackName,
        artistName: song.artistName,
        collectionName: song.collectionName,
        artworkUrl: song.artworkUrl,
        lines: song.lines,
        translations: song.translations,
        vocab: song.vocab,
      });
    }

    // Fetch and process
    try {
      const lyricsText = await fetchLyrics(song.artistName, song.trackName);
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
        back: [v.reading, meanings[v.word]].filter(Boolean).join("  "),
        pos: v.pos,
      }));

      await db
        .update(songs)
        .set({ lines, translations, vocab, processedAt: new Date() })
        .where(eq(songs.id, id));

      return c.json({
        id: song.id,
        trackName: song.trackName,
        artistName: song.artistName,
        collectionName: song.collectionName,
        artworkUrl: song.artworkUrl,
        lines,
        translations,
        vocab,
      });
    } catch {
      return c.json({ error: "Lyrics not found" }, 404);
    }
  })
  .post(
    "/export",
    zValidator(
      "json",
      z.object({
        deckName: z.string(),
        vocab: z.array(
          z.object({
            front: z.string(),
            back: z.string(),
            pos: z.string().optional(),
          }),
        ),
      }),
    ),
    async (c) => {
      const { deckName, vocab } = c.req.valid("json");
      const cards = vocab.map((v) => ({
        front: v.front,
        back: [v.back, v.pos].filter(Boolean).join("  "),
      }));
      const zip = buildAnkiPackage(deckName, cards);
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
