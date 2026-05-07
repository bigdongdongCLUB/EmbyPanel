export type RequestedVodMedia = {
  id: number | string;
  title: string;
  titleOriginal?: string | null;
  year?: number | string | null;
};

export type LibraryMediaCandidate = {
  Name?: string | null;
  OriginalTitle?: string | null;
  ProductionYear?: number | string | null;
  ProviderIds?: Record<string, string | number | null | undefined> | null;
};

export function normalizeVodTitle(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]/g, "")
    .trim();
}

export function parseVodYear(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const m = String(v).match(/\d{4}/);
  if (!m) return null;
  const y = Number(m[0]);
  return Number.isFinite(y) ? y : null;
}

export function getVodTmdbProviderId(item: LibraryMediaCandidate) {
  const p = item?.ProviderIds ?? {};
  return String(p.Tmdb ?? p.TMDb ?? p.TMDB ?? p.tmdb ?? "").trim();
}

function yearsMatch(requestedYear: number | null, libraryYear: number | null) {
  if (!requestedYear || !libraryYear) return true;
  return requestedYear === libraryYear;
}

function hasTitleMatch(item: LibraryMediaCandidate, requested: RequestedVodMedia) {
  const libraryName = normalizeVodTitle(item.Name ?? "");
  const libraryOriginal = normalizeVodTitle(item.OriginalTitle ?? "");
  const title = normalizeVodTitle(requested.title);
  const original = normalizeVodTitle(requested.titleOriginal ?? "");

  if (!libraryName) return false;

  if (libraryOriginal && original && libraryOriginal === original) return true;
  if (libraryName && title && libraryName === title) return true;
  if (libraryName && original && libraryName === original) return true;

  if (libraryOriginal && original) {
    const lenRatio = libraryOriginal.length / Math.max(original.length, 1);
    if (lenRatio <= 1.5 && lenRatio >= 0.67 && (libraryOriginal.includes(original) || original.includes(libraryOriginal))) {
      return true;
    }
  }

  const maxRequestedLength = Math.max(title.length, original.length || 1);
  const lenRatio = libraryName.length / maxRequestedLength;
  if (lenRatio > 1.5 || lenRatio < 0.67) return false;

  return (
    (libraryName && title && (libraryName.includes(title) || title.includes(libraryName))) ||
    (libraryName && original && (libraryName.includes(original) || original.includes(libraryName)))
  );
}

export function isVodLibraryMatch(item: LibraryMediaCandidate, requested: RequestedVodMedia) {
  const providerTmdb = getVodTmdbProviderId(item);
  if (providerTmdb) return providerTmdb === String(requested.id);

  const requestedYear = parseVodYear(requested.year);
  const libraryYear = parseVodYear(item.ProductionYear);
  if (!yearsMatch(requestedYear, libraryYear)) return false;

  return hasTitleMatch(item, requested);
}

export function scoreVodLibraryMatch(item: LibraryMediaCandidate, requested: RequestedVodMedia) {
  const providerTmdb = getVodTmdbProviderId(item);
  if (providerTmdb) return providerTmdb === String(requested.id) ? 1000 : 0;

  const requestedYear = parseVodYear(requested.year);
  const libraryYear = parseVodYear(item.ProductionYear);
  if (!yearsMatch(requestedYear, libraryYear)) return 0;

  const libraryName = normalizeVodTitle(item.Name ?? "");
  const libraryOriginal = normalizeVodTitle(item.OriginalTitle ?? "");
  const title = normalizeVodTitle(requested.title);
  const original = normalizeVodTitle(requested.titleOriginal ?? "");

  if (libraryOriginal && original && libraryOriginal === original) return 190;
  if (libraryName && title && libraryName === title) return 170;
  if (libraryName && original && libraryName === original) return 160;
  if (hasTitleMatch(item, requested)) return 90;
  return 0;
}
