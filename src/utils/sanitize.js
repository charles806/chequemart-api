// Lightweight HTML sanitizer.
// Replaces the `sanitize-html` dependency, which transitively required the
// ESM-only `htmlparser2` package and crashed at module load on Vercel
// (`ERR_REQUIRE_ESM`). This small pure-JS implementation has zero dependencies
// and is safe to import in any Node runtime.

const SAFE_TAGS = new Set(['b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'p', 'br']);
const SAFE_ATTRIBUTES = new Set(['href']);

const STRIP_REGEX = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z0-9:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
const SCRIPT_TAG_REGEX = /<\s*\/?\s*(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link|noscript|svg|math)\b[^>]*>/gi;
const TAG_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9]*/;

/**
 * Escapes special HTML characters in text content.
 */
const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Sanitizes an HTML string, keeping only the allowed tags and attributes.
 * All HTML entities in text content are preserved as-is where safe; tags not
 * in the allowlist are stripped (their inner text is kept).
 * @param {string} html - Raw HTML input.
 * @param {Set<string>} [allowedTags] - Tag names to keep.
 * @param {Set<string>} [allowedAttributes] - Attribute names to keep.
 * @returns {string} Sanitized HTML.
 */
const sanitizeHtml = (html, { allowedTags = SAFE_TAGS, allowedAttributes = SAFE_ATTRIBUTES } = {}) => {
  if (typeof html !== 'string') return '';

  // 1) Drop dangerous elements entirely (including their content)
  let out = html.replace(SCRIPT_TAG_REGEX, '');

  // HTML comments
  out = out.replace(/<!--[\s\S]*?-->/g, '');

  // 2) Replace any remaining tag with a token replacing it so we can decide
  //    allow/deny without wrecking text.
  const parts = [];
  let lastIndex = 0;

  const pushText = (text) => {
    if (text) parts.push(escapeHtml(text));
  };

  let m;
  STRIP_REGEX.lastIndex = 0;
  while ((m = STRIP_REGEX.exec(out)) !== null) {
    pushText(out.slice(lastIndex, m.index));

    const rawTag = m[0];
    const closing = rawTag.trim().startsWith('</');
    const tagName = (rawTag.replace(/^<\/?/, '').match(TAG_NAME_REGEX) || [''])[0].toLowerCase();

    if (tagName && allowedTags.has(tagName)) {
      // Keep the tag, but only with allowed attributes.
      let attrs = '';
      const attrRegex = /\s+([a-zA-Z0-9:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let am;
      while ((am = attrRegex.exec(rawTag)) !== null) {
        const name = am[1].toLowerCase();
        if (allowedAttributes.has(name)) {
          const value = am[2] ?? am[3] ?? am[4] ?? '';
          // Only allow safe (relative or http/https/mailto/tel) href values.
          if (name === 'href' && !/^(https?:|mailto:|tel:|\/|#)/i.test(value)) {
            continue;
          }
          attrs += ` ${name}="${escapeHtml(value)}"`;
        }
      }
      parts.push(closing ? `</${tagName}>` : `<${tagName}${attrs}>`);
    } else {
      // Strip disallowed tag but keep its inner content flowing.
      // (closing tags and void tags with no matching pair add nothing)
    }

    lastIndex = m.index + rawTag.length;
  }
  pushText(out.slice(lastIndex));

  return parts.join('');
};

/**
 * Strips ALL tags, returning plain text.
 */
export const sanitizeText = (text) => {
  if (typeof text !== 'string') return text;
  return sanitizeHtml(text, { allowedTags: new Set(), allowedAttributes: new Set() }).trim();
};

/**
 * Keeps a safe subset of rich-text tags.
 */
export const sanitizeRichText = (text) => {
  if (typeof text !== 'string') return text;
  return sanitizeHtml(text, {
    allowedTags: new Set(['b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'p', 'br']),
    allowedAttributes: new Set(['href']),
  });
};

export const sanitizeObject = (obj, fields = []) => {
  const sanitized = { ...obj };
  for (const field of fields) {
    if (typeof sanitized[field] === 'string') {
      sanitized[field] = sanitizeText(sanitized[field]);
    }
  }
  return sanitized;
};
