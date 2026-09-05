/**
 * Minimal allow-list HTML sanitiser for admin-authored email bodies.
 *
 * Runs in Deno (no DOM), so it works on the raw markup string:
 *  - drops dangerous elements entirely (script/style/iframe/object/...)
 *  - keeps only a small formatting/image tag allow-list
 *  - keeps only safe attributes, and only http(s)/mailto URLs
 *
 * Anything not explicitly allowed is removed. The inner text of a disallowed
 * (but non-dangerous) tag is preserved so no copy is silently lost.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'span', 'div',
  'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'h1', 'h2', 'h3', 'h4',
  'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
]);

/** Elements whose entire contents must go, not just the tag. */
const DROP_WITH_CONTENT = /<\s*(script|style|iframe|object|embed|link|meta|form|svg|math)\b[\s\S]*?(<\/\s*\1\s*>|$)/gi;

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'style']),
  span: new Set(['style']),
  div: new Set(['style']),
  p: new Set(['style']),
  td: new Set(['style']),
  th: new Set(['style']),
  table: new Set(['style', 'width']),
  li: new Set(['style']),
  h1: new Set(['style']),
  h2: new Set(['style']),
  h3: new Set(['style']),
  h4: new Set(['style']),
  blockquote: new Set(['style']),
};

/** Inline CSS is limited to harmless presentation properties. */
const ALLOWED_CSS = new Set([
  'color', 'background-color', 'font-size', 'font-weight', 'font-style',
  'text-align', 'text-decoration', 'padding', 'margin', 'width', 'max-width',
  'height', 'border', 'border-radius', 'line-height', 'display',
]);

function safeUrl(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, '');
  if (/^(https?:|mailto:)/i.test(value)) return raw.trim();
  return null;
}

function sanitizeStyle(raw: string): string {
  return raw
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const [prop, ...rest] = decl.split(':');
      const value = rest.join(':');
      if (!prop || !value) return false;
      if (/expression|url\s*\(|javascript:/i.test(value)) return false;
      return ALLOWED_CSS.has(prop.trim().toLowerCase());
    })
    .join('; ');
}

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function sanitizeAttrs(tag: string, attrString: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return '';

  const out: string[] = [];
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(attrString)) !== null) {
    const name = m[1].toLowerCase();
    let value = m[2] ?? m[3] ?? m[4] ?? '';
    if (!allowed.has(name)) continue;
    if (name === 'href' || name === 'src') {
      const url = safeUrl(value);
      if (!url) continue;
      value = url;
    }
    if (name === 'style') {
      value = sanitizeStyle(value);
      if (!value) continue;
    }
    if ((name === 'width' || name === 'height') && !/^\d{1,4}$/.test(value.trim())) continue;
    out.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
  }

  if (tag === 'a') {
    out.push('target="_blank"', 'rel="noopener noreferrer"');
  }
  return out.length ? ' ' + out.join(' ') : '';
}

export function sanitizeEmailHtml(input: string, maxLength = 200_000): string {
  if (!input) return '';
  let html = input.slice(0, maxLength);

  html = html.replace(DROP_WITH_CONTENT, '');
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  html = html.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
    (_all, closing: string, rawTag: string, attrs: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return '';
      if (closing) return `</${tag}>`;
      if (tag === 'br' || tag === 'hr' || tag === 'img') {
        return `<${tag}${sanitizeAttrs(tag, attrs)} />`;
      }
      return `<${tag}${sanitizeAttrs(tag, attrs)}>`;
    });

  // Any stray angle brackets that were not part of an allowed tag.
  html = html.replace(/<(?![/a-zA-Z])/g, '&lt;');

  return html.trim();
}

/** Plain-text fallback used for the text part / previews. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(DROP_WITH_CONTENT, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-4]|tr|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
