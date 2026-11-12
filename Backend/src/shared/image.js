export function isValidImageDataUrl(value) {
  return typeof value === 'string'
    && value.length <= 3_000_000
    && (value === '' || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value))
}

