import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { songs } from "@/db/schema";
import SongDetail from "./song-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const song = await db.query.songs.findFirst({ where: eq(songs.id, id) });

  if (!song) {
    return { title: "Song not found — LyricAnki" };
  }

  const title = `${song.trackName} — ${song.artistName}`;
  const description = song.collectionName
    ? `Lyrics, translations & vocabulary for "${song.trackName}" by ${song.artistName} from ${song.collectionName}.`
    : `Lyrics, translations & vocabulary for "${song.trackName}" by ${song.artistName}.`;

  return {
    title: `${title} — LyricAnki`,
    description,
    openGraph: {
      title,
      description,
      type: "music.song",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default function SongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <SongDetail params={params} />;
}
