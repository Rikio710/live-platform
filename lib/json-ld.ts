/**
 * Safely serialize an object for use in a <script type="application/ld+json"> tag.
 * JSON.stringify does not escape </script>, which can break out of the script tag (XSS).
 * This function escapes the characters that could terminate the script context.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}
