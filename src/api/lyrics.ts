/**
 * Fetch lyrics from multiple sources with fallback.
 *
 * 1. lrclib.net direct GET  — fast exact match
 * 2. lrclib.net search      — handles romanized / alternate titles
 * 3. lyrics.ovh             — broader artist coverage as last resort
 */
export async function fetchLyrics(
  artist: string,
  title: string,
): Promise<string> {
  const lyrics =
    (await fromLrclibDirect(artist, title)) ??
    (await fromLrclibSearch(artist, title)) ??
    (await fromLyricsOvh(artist, title));

  if (!lyrics) throw new Error("Lyrics not found");
  return lyrics;
}

function stripLrcTimestamps(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\[\d+:\d+\.\d+\]\s*/, "").trim())
    .filter(Boolean)
    .join("\n");
}

function pickLyrics(data: {
  plainLyrics?: string;
  syncedLyrics?: string;
}): string | null {
  if (data.plainLyrics?.trim()) return data.plainLyrics.trim();
  if (data.syncedLyrics?.trim()) return stripLrcTimestamps(data.syncedLyrics);
  return null;
}

async function fromLrclibDirect(
  artist: string,
  title: string,
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title,
    });
    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { "Lrclib-Client": "LyricAnki" },
    });
    if (!res.ok) return null;
    return pickLyrics(await res.json());
  } catch {
    return null;
  }
}

async function fromLrclibSearch(
  artist: string,
  title: string,
): Promise<string | null> {
  try {
    // Search by title only — more reliable for Japanese songs where artist names
    // may differ in spacing/romanization between iTunes and lrclib
    const params = new URLSearchParams({ q: title });
    const res = await fetch(`https://lrclib.net/api/search?${params}`, {
      headers: { "Lrclib-Client": "LyricAnki" },
    });
    if (!res.ok) return null;

    const results = (await res.json()) as {
      trackName: string;
      artistName: string;
      plainLyrics?: string;
      syncedLyrics?: string;
    }[];

    const withLyrics = results.filter((r) => r.plainLyrics || r.syncedLyrics);
    if (!withLyrics.length) return null;

    // Normalize for loose artist matching (strip spaces, lowercase)
    const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();
    const artistNorm = normalize(artist);

    const match =
      withLyrics.find((r) => normalize(r.artistName) === artistNorm) ??
      withLyrics.find((r) => normalize(r.trackName) === normalize(title)) ??
      withLyrics[0];

    return pickLyrics(match);
  } catch {
    return null;
  }
}

async function fromLyricsOvh(
  artist: string,
  title: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { lyrics?: string };
    return data.lyrics?.trim() || null;
  } catch {
    return null;
  }
}
