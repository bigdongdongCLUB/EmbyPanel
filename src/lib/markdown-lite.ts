function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderMarkdownLite(md: string) {
  const src = String(md || "").replace(/\r\n/g, "\n");
  const lines = src.split("\n");
  const out: string[] = [];
  let inUl = false;

  const closeUl = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
  };

  const splitTableRow = (line: string) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((x) => x.trim());

  const isTableDivider = (line: string) => {
    const cells = splitTableRow(line);
    if (!cells.length) return false;
    return cells.every((c) => /^:?-{3,}:?$/.test(c));
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    if (!line.trim()) {
      closeUl();
      out.push("<br />");
      continue;
    }

    // Markdown table:
    // | h1 | h2 |
    // | --- | --- |
    // | c1 | c2 |
    if (line.includes("|") && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      closeUl();
      const headers = splitTableRow(line);
      out.push("<table><thead><tr>");
      headers.forEach((h) => out.push(`<th>${inline(h)}</th>`));
      out.push("</tr></thead><tbody>");

      i += 2;
      while (i < lines.length && lines[i].trim().includes("|")) {
        const rowCells = splitTableRow(lines[i]);
        if (rowCells.length) {
          out.push("<tr>");
          rowCells.forEach((c) => out.push(`<td>${inline(c)}</td>`));
          out.push("</tr>");
        }
        i += 1;
      }
      i -= 1;
      out.push("</tbody></table>");
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      closeUl();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    const li = line.match(/^[-*]\s+(.+)$/);
    if (li) {
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }

    closeUl();
    out.push(`<p>${inline(line)}</p>`);
  }

  closeUl();
  return out.join("\n");
}

function inline(s: string) {
  let x = escapeHtml(s);
  x = x.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />`);
  x = x.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(text)}</a>`);
  x = x.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  x = x.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  x = x.replace(/`([^`]+)`/g, "<code>$1</code>");
  return x;
}
