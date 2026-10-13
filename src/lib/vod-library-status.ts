type LibraryResult = { hasMovie: boolean; seasons: Record<number, boolean> };

export function isVodContentInLibrary(mediaType: "MOVIE" | "TV", results: LibraryResult[], season?: number) {
  if (mediaType === "MOVIE") return results.some((result) => result.hasMovie);
  return season !== undefined && results.some((result) => result.seasons[season] === true);
}
