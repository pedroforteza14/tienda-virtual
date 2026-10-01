/**
 * JSON-LD emission.
 *
 * This is the **only** sanctioned use of `dangerouslySetInnerHTML` in the
 * codebase (`react/no-danger` is an error everywhere else, with this directory as
 * the single eslint exception). Structured data has to be a raw `<script>` body,
 * so the escaping has to be done properly here instead.
 *
 * `safeJsonLd` escapes the four characters that can break out of a `<script>`
 * element or out of a JS string literal:
 *   `<` and `>`  — `</script>` inside a string value would end the element early;
 *   `&`          — defends against entity-based re-parsing tricks;
 *   U+2028/U+2029 — valid in JSON, but are line terminators in JavaScript.
 *
 * On top of that, **no user input ever reaches this function.** Every value comes
 * from the catalogue or from `src/config/site.ts`. Both controls are deliberate:
 * the escaping is correct on its own, and the no-user-input rule means a bug in it
 * is still not exploitable. docs/threat-model.md §4.5.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function JsonLd({ data, id }: { data: unknown; id?: string }) {
  return (
    <script
      type="application/ld+json"
      {...(id ? { id } : {})}
      // eslint-disable-next-line react/no-danger -- see the module comment: escaped by safeJsonLd, and never fed user input.
      dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }}
    />
  );
}
