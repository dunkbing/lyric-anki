"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Download, ExternalLink, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { client } from "@/lib/api-client";

type BasicSong = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  releaseDate?: string;
  primaryGenreName?: string;
  trackTimeMillis?: number;
  previewUrl?: string;
  trackViewUrl?: string;
};

type SongDetails = BasicSong & {
  artworkUrl: string | null; // S3 URL once uploaded, null until then
  genre?: string | null;
  durationMs?: number | null;
  itunesUrl?: string | null;
};

type LyricsData = {
  lines: string[];
  translations: string[];
  vocab: { front: string; back: string; pos?: string }[];
};

const isJapanese = (text: string) =>
  /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF]/.test(text);

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function SongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [details, setDetails] = useState<SongDetails | null>(null);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [lyricsError, setLyricsError] = useState("");

  // Read basic info from sessionStorage immediately
  useEffect(() => {
    const stored = sessionStorage.getItem(`song:${id}`);
    if (stored) {
      const song: BasicSong = JSON.parse(stored);
      setDetails({
        ...song,
        artworkUrl: song.artworkUrl100 ?? null, // temp: use iTunes URL until S3 resolves
        genre: song.primaryGenreName,
        durationMs: song.trackTimeMillis,
        itunesUrl: song.trackViewUrl,
      });
    }
  }, [id]);

  // Process song — POST returns full data after lyrics are done
  useEffect(() => {
    const load = async () => {
      const stored = sessionStorage.getItem(`song:${id}`);

      let res: Response;
      if (stored) {
        const basic: BasicSong = JSON.parse(stored);
        res = await client.api.song.$post({
          json: {
            trackId: basic.trackId,
            trackName: basic.trackName,
            artistName: basic.artistName,
            collectionName: basic.collectionName ?? "",
            artworkUrl100: basic.artworkUrl100 ?? "",
            releaseDate: basic.releaseDate,
            primaryGenreName: basic.primaryGenreName,
            trackTimeMillis: basic.trackTimeMillis,
            previewUrl: basic.previewUrl,
            trackViewUrl: basic.trackViewUrl,
          },
        });
      } else {
        // Direct link — song must already be in DB
        res = await client.api.song[":id"].$get({ param: { id } });
      }

      if (!res.ok) throw new Error();
      const data = await res.json();
      if ("error" in data) throw new Error();

      const song = data as {
        id: string;
        trackName: string;
        artistName: string;
        collectionName: string;
        artworkUrl: string | null;
        releaseDate?: string | null;
        genre?: string | null;
        durationMs?: number | null;
        previewUrl?: string | null;
        itunesUrl?: string | null;
        lines: string[];
        translations: string[];
        vocab: { front: string; back: string; pos?: string }[];
      };

      setDetails((prev) => ({
        ...(prev ?? {
          trackId: Number(song.id),
          trackName: song.trackName,
          artistName: song.artistName,
          collectionName: song.collectionName,
          artworkUrl100: song.artworkUrl ?? "",
        }),
        artworkUrl: song.artworkUrl,
        genre: song.genre,
        durationMs: song.durationMs,
        itunesUrl: song.itunesUrl,
      }));

      setLyrics({
        lines: song.lines,
        translations: song.translations,
        vocab: song.vocab,
      });
    };

    load().catch(() => setLyricsError("Could not load lyrics for this song."));
  }, [id]);

  const handleExport = async () => {
    if (!details || !lyrics) return;
    const deckName = `${details.artistName} - ${details.trackName}`;
    const res = await client.api.export.$post({
      json: { deckName, vocab: lyrics.vocab },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deckName.replace(/[^\w\s-]/g, "").trim()}.apkg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          {lyrics && (
            <Button onClick={handleExport} className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export to Anki ({lyrics.vocab.length} cards)
            </Button>
          )}
        </div>

        {/* Song info */}
        {details ? (
          <div className="flex items-center gap-4 mb-6">
            {details.artworkUrl ? (
              <img
                src={details.artworkUrl.replace("100x100", "300x300")}
                alt={details.collectionName}
                className="w-20 h-20 rounded-lg object-cover shrink-0 shadow"
              />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Music className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold leading-tight truncate">
                {details.trackName}
              </h1>
              <p className="text-sm text-muted-foreground truncate">
                {details.artistName}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {details.collectionName}
              </p>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                {details.genre && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {details.genre}
                  </span>
                )}
                {details.durationMs && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(details.durationMs)}
                  </span>
                )}
                {details.releaseDate && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(details.releaseDate).getFullYear()}
                  </span>
                )}
                {details.itunesUrl && (
                  <a
                    href={details.itunesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    iTunes
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-lg bg-muted animate-pulse shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-5 bg-muted rounded animate-pulse w-3/4" />
              <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
              <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
            </div>
          </div>
        )}

        {/* Lyrics / Vocab */}
        {lyrics ? (
          <Tabs defaultValue="lyrics">
            <TabsList className="mb-4">
              <TabsTrigger value="lyrics">Lyrics</TabsTrigger>
              <TabsTrigger value="vocab">
                Vocabulary ({lyrics.vocab.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="lyrics">
              <div className="space-y-3">
                {lyrics.lines.map((line, i) => (
                  <div key={i}>
                    <p
                      className={`text-sm ${isJapanese(line) ? "font-medium" : "text-muted-foreground italic"}`}
                    >
                      {line}
                    </p>
                    {lyrics.translations[i] && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {lyrics.translations[i]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="vocab">
              <div className="divide-y">
                {lyrics.vocab.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-baseline justify-between py-2 px-2"
                  >
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-base font-medium">
                        {item.front}
                      </span>
                      {item.pos && (
                        <span className="text-xs text-muted-foreground">
                          {item.pos}
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {item.back}
                    </span>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        ) : lyricsError ? (
          <p className="text-destructive text-sm">{lyricsError}</p>
        ) : (
          <div className="space-y-3 mt-2">
            <p className="text-sm text-muted-foreground">
              Processing lyrics...
            </p>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-4 bg-muted rounded animate-pulse"
                style={{ width: `${60 + ((i * 17) % 35)}%` }}
              />
            ))}
          </div>
        )}

        {lyrics && (
          <p className="text-xs text-muted-foreground mt-8">
            Open the exported <strong>.apkg</strong> file directly in Anki to
            import the deck.
          </p>
        )}
      </div>
    </div>
  );
}
