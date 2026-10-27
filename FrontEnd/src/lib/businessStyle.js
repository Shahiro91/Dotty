export const businessFontOptions = [
  { value: 'original', label: 'Original' },
  { value: 'sans', label: 'Sans serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'rounded', label: 'Redondeada' },
  { value: 'mono', label: 'Monoespaciada' },
]

const fontStacks = {
  original: { body: "'DM Sans', sans-serif", heading: 'var(--serif)' },
  sans: { body: "'DM Sans', sans-serif", heading: "'DM Sans', sans-serif" },
  serif: { body: 'Georgia, serif', heading: 'Georgia, serif' },
  rounded: { body: "'Trebuchet MS', sans-serif", heading: "'Trebuchet MS', sans-serif" },
  mono: { body: "'Courier New', monospace", heading: "'Courier New', monospace" },
}

export function getBusinessFontVariables(fontFamily = 'original') {
  const fonts = fontStacks[fontFamily] || fontStacks.original
  return {
    '--business-font': fonts.body,
    '--business-heading-font': fonts.heading,
  }
}