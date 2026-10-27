export async function optimizeImageFile(file, maxDimension = 1200) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Elegí un archivo de imagen.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No se pudo procesar la imagen.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const imageDataUrl = canvas.toDataURL('image/webp', 0.82)
  if (imageDataUrl.length > 3_000_000) throw new Error('La imagen sigue siendo demasiado pesada. Elegí otra más liviana.')
  return imageDataUrl
}
