import { Fragment, type ReactNode } from "react";

// Minimal, safe Markdown renderer (no HTML injection) for the deliverables:
// headings, lists, tables, blockquotes and **bold**.

function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `l${i}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("### ")) out.push(<h4 key={k}>{inline(line.slice(4))}</h4>);
    else if (line.startsWith("## ")) out.push(<h3 key={k}>{inline(line.slice(3))}</h3>);
    else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i].split("|").slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      out.push(
        <table key={k}>
          <thead>
            <tr>{rows[0].map((c, j) => <th key={j}>{inline(c)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.slice(1).map((r, ri) => (
              <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    } else if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: string[] = [];
      while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) {
        items.push(lines[i].replace(/^(- |\d+\. )/, ""));
        i++;
      }
      const List = ordered ? "ol" : "ul";
      out.push(<List key={k}>{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</List>);
      continue;
    } else if (line.startsWith("> ")) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        q.push(lines[i].slice(2));
        i++;
      }
      out.push(<blockquote key={k}>{q.map((l, j) => <p key={j}>{inline(l)}</p>)}</blockquote>);
      continue;
    } else out.push(<p key={k}>{inline(line)}</p>);
    i++;
  }
  return <div className="md">{out}</div>;
}
