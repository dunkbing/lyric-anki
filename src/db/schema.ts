import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const songs = pgTable("songs", {
  id: text("id").primaryKey(), // iTunes trackId as string
  trackName: text("track_name").notNull(),
  artistName: text("artist_name").notNull(),
  collectionName: text("collection_name").notNull().default(""),
  artworkS3Key: text("artwork_s3_key"),
  releaseDate: text("release_date"),
  genre: text("genre"),
  durationMs: integer("duration_ms"),
  previewUrl: text("preview_url"),
  itunesUrl: text("itunes_url"),
  lines: jsonb("lines").$type<string[]>(),
  translations: jsonb("translations").$type<string[]>(),
  vocab:
    jsonb("vocab").$type<{ front: string; back: string; pos?: string }[]>(),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Song = typeof songs.$inferSelect;
export type InsertSong = typeof songs.$inferInsert;
