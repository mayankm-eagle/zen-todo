import { Fragment, type ReactNode } from "react";

// Renders the small subset of markdown Todoist allows in task text:
// [label](url), bare URLs, **bold**, *italic* / _italic_, `code`, ~~strike~~.
const TOKEN =
  /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,:;"')\]])|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|~~([^~]+)~~|\*([^*\s][^*]*)\*|(?<![\w])_([^_\s][^_]*)_(?![\w])/g;

export function Inline({ text }: { text: string }): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    const [, label, href, bare, bold, bold2, code, strike, em, em2] = m;
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();
    if (href || bare) {
      out.push(
        <a key={key++} href={href ?? bare} target="_blank" rel="noopener noreferrer" onClick={stop}>
          {label ?? prettyUrl(bare!)}
        </a>,
      );
    } else if (bold || bold2) out.push(<strong key={key++}>{bold ?? bold2}</strong>);
    else if (code) out.push(<code key={key++}>{code}</code>);
    else if (strike) out.push(<s key={key++}>{strike}</s>);
    else if (em || em2) out.push(<em key={key++}>{em ?? em2}</em>);
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}

function prettyUrl(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    const s = `${u.host.replace(/^www\./, "")}${path}`;
    return s.length > 48 ? `${s.slice(0, 45)}…` : s;
  } catch {
    return url;
  }
}
