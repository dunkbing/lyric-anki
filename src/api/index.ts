import { zValidator } from "@hono/zod-validator";
import { desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { z } from "zod";
import { db } from "@/db";
import { songs } from "@/db/schema";
import { artworkPresignedUrl, uploadArtwork } from "@/lib/s3";
import { buildAnkiPackage } from "./anki";
import { enrichLyrics } from "./gemini";
import { fetchLyrics } from "./lyrics";
import { extractVocabulary } from "./vocabulary";

const iTunesSongSchema = z.object({
  trackId: z.number(),
  trackName: z.string(),
  artistName: z.string(),
  collectionName: z.string().default(""),
  artworkUrl100: z.string().default(""),
  releaseDate: z.string().optional(),
  primaryGenreName: z.string().optional(),
  trackTimeMillis: z.number().optional(),
  previewUrl: z.string().optional(),
  trackViewUrl: z.string().optional(),
});

export type ItunesSong = z.infer<typeof iTunesSongSchema>;

/** Full pipeline: process lyrics then save everything in one insert. */
export async function processAndSave(input: ItunesSong) {
  const id = String(input.trackId);

  // Return cached if already processed
  const existing = await db.query.songs.findFirst({ where: eq(songs.id, id) });
  if (
    existing?.processedAt &&
    existing.lines &&
    existing.translations &&
    existing.vocab
  ) {
    return existing;
  }

  // 1. Upload artwork to S3
  const artworkS3Key = input.artworkUrl100
    ? await uploadArtwork(id, input.artworkUrl100)
    : undefined;

  // 2. Fetch and process lyrics
  const lyricsText = await fetchLyrics(input.artistName, input.trackName);
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

  // 3. Insert everything at once
  const [song] = await db
    .insert(songs)
    .values({
      id,
      trackName: input.trackName,
      artistName: input.artistName,
      collectionName: input.collectionName,
      artworkS3Key,
      releaseDate: input.releaseDate,
      genre: input.primaryGenreName,
      durationMs: input.trackTimeMillis,
      previewUrl: input.previewUrl,
      itunesUrl: input.trackViewUrl,
      lines,
      translations,
      vocab,
      processedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: songs.id,
      set: {
        lines,
        translations,
        vocab,
        artworkS3Key,
        processedAt: new Date(),
      },
    })
    .returning();

  return song;
}

type DbSong = NonNullable<Awaited<ReturnType<typeof db.query.songs.findFirst>>>;

function toSearchResult(song: DbSong) {
  return {
    trackId: Number(song.id),
    trackName: song.trackName,
    artistName: song.artistName,
    collectionName: song.collectionName,
    artworkUrl: song.artworkS3Key
      ? artworkPresignedUrl(song.artworkS3Key)
      : null,
    genre: song.genre,
    durationMs: song.durationMs,
    inDb: true,
  };
}

function songResponse(
  song: NonNullable<Awaited<ReturnType<typeof db.query.songs.findFirst>>>,
) {
  return {
    id: song.id,
    trackName: song.trackName,
    artistName: song.artistName,
    collectionName: song.collectionName,
    artworkUrl: song.artworkS3Key
      ? artworkPresignedUrl(song.artworkS3Key)
      : null,
    releaseDate: song.releaseDate,
    genre: song.genre,
    durationMs: song.durationMs,
    previewUrl: song.previewUrl,
    itunesUrl: song.itunesUrl,
    lines: song.lines ?? [],
    translations: song.translations ?? [],
    vocab: song.vocab ?? [],
  };
}

const app = new Hono()
  .basePath("/api")
  .get("/songs", async (c) => {
    const rows = await db.query.songs.findMany({
      where: isNotNull(songs.processedAt),
      orderBy: [desc(songs.createdAt)],
      limit: 20,
    });
    return c.json({ results: rows.map(toSearchResult) });
  })
  .get(
    "/search",
    zValidator("query", z.object({ q: z.string() })),
    async (c) => {
      const { q } = c.req.valid("query");

      // Query DB first
      const dbRows = await db.query.songs.findMany({
        where: or(
          ilike(songs.trackName, `%${q}%`),
          ilike(songs.artistName, `%${q}%`),
        ),
        limit: 15,
      });
      const dbIds = new Set(dbRows.map((s) => s.id));
      const dbResults = dbRows.map(toSearchResult);

      // Supplement with iTunes for songs not in DB
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=15&country=JP&lang=ja_jp`;
      const itunesRes = await fetch(url);
      const itunesData = await itunesRes.json();
      const itunesResults = ((itunesData.results ?? []) as ItunesSong[])
        .filter((s) => !dbIds.has(String(s.trackId)))
        .map((s) => ({ ...s, artworkUrl: s.artworkUrl100, inDb: false }));

      return c.json({ results: [...dbResults, ...itunesResults] });
    },
  )
  .post("/song", zValidator("json", iTunesSongSchema), async (c) => {
    try {
      const song = await processAndSave(c.req.valid("json"));
      return c.json(songResponse(song));
    } catch (e) {
      console.log({ e });
      return c.json({ error: "Lyrics not found" }, 404);
    }
  })
  .get("/song/:id", async (c) => {
    const song = await db.query.songs.findFirst({
      where: eq(songs.id, c.req.param("id")),
    });
    if (!song?.processedAt) return c.json({ error: "Song not found" }, 404);
    return c.json(songResponse(song));
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

app.use(logger());
export type AppType = typeof app;
export default app;
