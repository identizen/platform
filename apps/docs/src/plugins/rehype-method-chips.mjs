import { visit } from 'unist-util-visit';

const METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Turns inline code containing only an HTTP method (`POST`) into a coloured method chip, and
 * inline code that is just an auth scheme (`Idz-Signature`, `Bearer`, `Basic`) into an auth chip.
 * Purely presentational: the markdown stays plain and the extractor is unaffected.
 */
export function rehypeMethodChips() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'code' || node.children.length !== 1) return;
      const child = node.children[0];
      if (child.type !== 'text') return;
      const text = child.value.trim();
      node.properties ??= {};
      const classes = Array.isArray(node.properties.className)
        ? node.properties.className
        : node.properties.className
          ? [String(node.properties.className)]
          : [];
      if (METHODS.has(text)) {
        node.properties.className = [...classes, 'idz-method', `idz-method-${text.toLowerCase()}`];
      } else if (text === 'Idz-Signature' || text === 'Bearer' || text === 'Basic') {
        node.properties.className = [...classes, 'idz-auth'];
      }
    });
  };
}
