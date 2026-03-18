import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const songs = pgTable("songs", {
  id: text("id").primaryKey(), // iTunes trackId as string
  trackName: text("track_name").notNull(),
  artistName: text("artist_name").notNull(),
  collectionName: text("collection_name").notNull().default(""),
  artworkUrl: text("artwork_url").notNull().default(""),
  lines: jsonb("lines").$type<string[]>(),
  translations: jsonb("translations").$type<string[]>(),
  vocab:
    jsonb("vocab").$type<{ front: string; back: string; pos?: string }[]>(),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Song = typeof songs.$inferSelect;
export type InsertSong = typeof songs.$inferInsert;
