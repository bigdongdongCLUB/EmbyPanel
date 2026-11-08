// Approximate display width: narrow Latin characters use one unit, CJK and emoji two.
export function compactMediaTitle(title: string, chineseCharacters = 23) {
  const segments = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(title), (part) => part.segment);
  const limit = chineseCharacters * 2;
  let width = 0;
  let result = "";
  for (const segment of segments) {
    const narrow = /^[\u0000-\u024f\u0300-\u036f\u2000-\u206f]+$/u.test(segment);
    const nextWidth = narrow ? 1 : 2;
    if (width + nextWidth > limit) return result + "...";
    width += nextWidth;
    result += segment;
  }
  return title;
}
