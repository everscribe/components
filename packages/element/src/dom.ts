// Tiny createElement helper used throughout the web component renderer
// - saves the createElement / setAttribute / appendChild boilerplate
// without pulling in JSX or a templating library.

type AttrValue = string | number | boolean | undefined | null
export type Attrs = Record<string, AttrValue> | null
export type Child = Node | string | number | null | undefined | false

export function h(tag: string, attrs?: Attrs, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue
      if (k === 'class') el.className = String(v)
      else if (k === 'html') el.innerHTML = String(v)
      else el.setAttribute(k, String(v))
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)))
  }
  return el
}
