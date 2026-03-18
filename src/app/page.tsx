"use client";

import { useState } from "react";
import { ArrowLeft, Download, Music, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { client } from "@/lib/api-client";

type Song = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
};

type AppState =
  | { view: "search" }
  | { view: "lyrics"; song: Song; lyrics: string[] };

const isJapanese = (text: string) =>
  /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF]/.test(text);

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Song[]>([]);
  const [state, setState] = useState<AppState>({ view: "search" });
  const [searching, setSearching] = useState(false);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [lyricsError, setLyricsError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError("");
    setResults([]);
    try {
      const res = await client.api.search.$get({ query: { q: query } });
      const data = await res.json();
      setResults(data.results);
      if (!data.results.length) setSearchError("No songs found.");
    } catch {
      setSearchError("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSong = async (song: Song) => {
    setLoadingLyrics(true);
    setLyricsError("");
    try {
      const res = await client.api.lyrics.$get({
        query: { artist: song.artistName, title: song.trackName },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if ("error" in data) throw new Error();
      const lines = data.lyrics
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      setState({ view: "lyrics", song, lyrics: lines });
    } catch {
      setLyricsError("Could not find lyrics for this song.");
    } finally {
      setLoadingLyrics(false);
    }
  };

  const handleExport = async () => {
    if (state.view !== "lyrics") return;
    const { song, lyrics } = state;
    const japaneseLines = lyrics.filter(isJapanese);
    if (!japaneseLines.length) return;

    const deckName = `${song.artistName} - ${song.trackName}`;
    const res = await client.api.export.$post({
      json: {
        deckName,
        cards: japaneseLines.map((line) => ({ front: line, back: "" })),
      },
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deckName.replace(/[^\w\s-]/g, "").trim()}.apkg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (state.view === "lyrics") {
    const japaneseLines = state.lyrics.filter(isJapanese);
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={() => setState({ view: "search" })}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <Button
              onClick={handleExport}
              disabled={!japaneseLines.length}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export to Anki ({japaneseLines.length} cards)
            </Button>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold">{state.song.trackName}</h1>
            <p className="text-muted-foreground">{state.song.artistName}</p>
          </div>

          {!japaneseLines.length && (
            <p className="text-muted-foreground text-sm mb-4">
              No Japanese lyrics detected.
            </p>
          )}

          <div className="space-y-0.5">
            {state.lyrics.map((line, i) => (
              <p
                key={i}
                className={`py-1 px-2 rounded text-sm ${
                  isJapanese(line)
                    ? "font-medium"
                    : "text-muted-foreground italic"
                }`}
              >
                {line}
              </p>
            ))}
          </div>

          <p className="text-xs text-muted-foreground mt-8">
            Open the exported <strong>.apkg</strong> file directly in Anki to
            import the deck.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="max-w-2xl mx-auto px-4 py-16 w-full">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-2">LyricAnki</h1>
          <p className="text-muted-foreground">
            Convert Japanese song lyrics to Anki flashcard decks
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artist or song title..."
            className="flex-1"
          />
          <Button type="submit" disabled={searching}>
            <Search className="w-4 h-4 mr-2" />
            {searching ? "Searching..." : "Search"}
          </Button>
        </form>

        {searchError && (
          <p className="text-destructive text-sm mb-4">{searchError}</p>
        )}

        {lyricsError && (
          <p className="text-destructive text-sm mb-4">{lyricsError}</p>
        )}

        {loadingLyrics && (
          <p className="text-muted-foreground text-sm text-center py-8">
            Loading lyrics...
          </p>
        )}

        {results.length > 0 && !loadingLyrics && (
          <div className="space-y-2">
            {results.map((song) => (
              <button
                key={song.trackId}
                type="button"
                onClick={() => handleSelectSong(song)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
              >
                {song.artworkUrl100 ? (
                  <img
                    src={song.artworkUrl100}
                    alt={song.collectionName}
                    className="w-12 h-12 rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <Music className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium truncate">{song.trackName}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {song.artistName} · {song.collectionName}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
