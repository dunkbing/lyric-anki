"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Music } from "lucide-react";
import { Input } from "@/components/ui/input";
import { client } from "@/lib/api-client";

type SongResult = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl: string | null;
  inDb: boolean;
  artworkUrl100?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  trackTimeMillis?: number;
  previewUrl?: string;
  trackViewUrl?: string;
};

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongResult[]>([]);
  const [defaults, setDefaults] = useState<SongResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    client.api.songs.$get().then(async (res) => {
      const data = await res.json();
      setDefaults(data.results as SongResult[]);
    });
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setSearchError("");
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const res = await client.api.search.$get({ query: { q: query } });
        const data = await res.json();
        const r = data.results as SongResult[];
        setResults(r);
        if (!r.length) setSearchError("No songs found.");
      } catch {
        setSearchError("Search failed. Please try again.");
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleSelectSong = (song: SongResult) => {
    if (!song.inDb) {
      sessionStorage.setItem(
        `song:${song.trackId}`,
        JSON.stringify({
          trackId: song.trackId,
          trackName: song.trackName,
          artistName: song.artistName,
          collectionName: song.collectionName,
          artworkUrl100: song.artworkUrl100 ?? "",
          releaseDate: song.releaseDate,
          primaryGenreName: song.primaryGenreName,
          trackTimeMillis: song.trackTimeMillis,
          previewUrl: song.previewUrl,
          trackViewUrl: song.trackViewUrl,
        }),
      );
    }
    router.push(`/song/${song.trackId}`);
  };

  const displayed = query.trim() ? results : defaults;
  const showingDefaults = !query.trim() && defaults.length > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="max-w-2xl mx-auto px-4 py-16 w-full">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-2">LyricAnki</h1>
          <p className="text-muted-foreground">
            Convert Japanese song lyrics to Anki flashcard decks
          </p>
        </div>

        <div className="relative mb-6">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artist or song title..."
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              Searching...
            </span>
          )}
        </div>

        {searchError && (
          <p className="text-destructive text-sm mb-4">{searchError}</p>
        )}

        {displayed.length > 0 && (
          <>
            {showingDefaults && (
              <p className="text-xs text-muted-foreground mb-3">
                Recently added
              </p>
            )}
            <div className="space-y-2">
              {displayed.map((song) => (
                <button
                  key={song.trackId}
                  type="button"
                  onClick={() => handleSelectSong(song)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
                >
                  {song.artworkUrl ? (
                    <img
                      src={song.artworkUrl}
                      alt={song.collectionName}
                      className="w-12 h-12 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0">
                      <Music className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{song.trackName}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {song.artistName} · {song.collectionName}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
