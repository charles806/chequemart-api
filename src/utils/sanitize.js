import sanitizeHtml from 'sanitize-html';

export const sanitizeText = (text) => {
  if (typeof text !== 'string') return text;
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} }).trim();
};

export const sanitizeRichText = (text) => {
  if (typeof text !== 'string') return text;
  return sanitizeHtml(text, {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'p', 'br'],
    allowedAttributes: { a: ['href'] },
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
