"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { client } from "@/lib/api-client";

type BasicSong = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
};

type LyricsData = {
  lines: string[];
  translations: string[];
  vocab: { front: string; back: string; pos?: string }[];
};

const isJapanese = (text: string) =>
  /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF]/.test(text);

export default function SongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [basic, setBasic] = useState<BasicSong | null>(null);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [lyricsError, setLyricsError] = useState("");

  // Read basic info from sessionStorage immediately
  useEffect(() => {
    const stored = sessionStorage.getItem(`song:${id}`);
    if (stored) setBasic(JSON.parse(stored));
  }, [id]);

  // Save to DB then fetch/process lyrics
  useEffect(() => {
    const load = async () => {
      // Upsert song metadata if we have it from sessionStorage
      const stored = sessionStorage.getItem(`song:${id}`);
      if (stored) {
        const song: BasicSong = JSON.parse(stored);
        await client.api.song.$post({
          json: {
            trackId: song.trackId,
            trackName: song.trackName,
            artistName: song.artistName,
            collectionName: song.collectionName,
            artworkUrl100: song.artworkUrl100,
          },
        });
      }

      // Fetch processed song (cached or triggers processing)
      const res = await client.api.song[":id"].$get({ param: { id } });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if ("error" in data) throw new Error();
      const songData = data as {
        id: string;
        trackName: string;
        artistName: string;
        collectionName: string;
        artworkUrl: string;
        lines: string[];
        translations: string[];
        vocab: { front: string; back: string }[];
      };
      // Fill basic from API response if sessionStorage was empty (e.g. direct link)
      if (!stored) {
        setBasic({
          trackId: Number(songData.id),
          trackName: songData.trackName,
          artistName: songData.artistName,
          collectionName: songData.collectionName,
          artworkUrl100: songData.artworkUrl,
        });
      }
      setLyrics({
        lines: songData.lines,
        translations: songData.translations,
        vocab: songData.vocab,
      });
    };

    load().catch(() => setLyricsError("Could not load lyrics for this song."));
  }, [id]);

  const handleExport = async () => {
    if (!basic || !lyrics) return;
    const deckName = `${basic.artistName} - ${basic.trackName}`;
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

  const artworkUrl = basic?.artworkUrl100 ?? "";

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

        {/* Song info — shown immediately from sessionStorage */}
        {basic ? (
          <div className="flex items-center gap-4 mb-6">
            {artworkUrl ? (
              <img
                src={artworkUrl.replace("100x100", "300x300")}
                alt={basic.collectionName}
                className="w-20 h-20 rounded-lg object-cover shrink-0 shadow"
              />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Music className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight truncate">
                {basic.trackName}
              </h1>
              <p className="text-sm text-muted-foreground truncate">
                {basic.artistName}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {basic.collectionName}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-lg bg-muted animate-pulse shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-5 bg-muted rounded animate-pulse w-3/4" />
              <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
            </div>
          </div>
        )}

        {/* Lyrics / Vocab — loaded after processing */}
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
