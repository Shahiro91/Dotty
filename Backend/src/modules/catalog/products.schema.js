import { isValidImageDataUrl } from '../../shared/image.js'

export function readProductInput(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const category = typeof body?.category === 'string' ? body.category.trim() : ''
  const price = Number(body?.price)
  const pointsPerUnit = Number(body?.pointsPerUnit)
  const imageDataUrl = body?.imageDataUrl ?? ''
  const imageScale = Number(body?.imageScale ?? 1)
  const imagePositionX = Number(body?.imagePositionX ?? 50)
  const imagePositionY = Number(body?.imagePositionY ?? 50)
  if (!name || name.length > 100 || description.length > 500 || !category || category.length > 60
    || !Number.isSafeInteger(price) || price < 1 || price > 100_000_000
    || !Number.isSafeInteger(pointsPerUnit) || pointsPerUnit < 0 || pointsPerUnit > 1_000_000
    || !Number.isFinite(imageScale) || imageScale < 1 || imageScale > 3
    || !Number.isFinite(imagePositionX) || imagePositionX < 0 || imagePositionX > 100
    || !Number.isFinite(imagePositionY) || imagePositionY < 0 || imagePositionY > 100
    || !isValidImageDataUrl(imageDataUrl)) return null
  return { name, description, category, price, pointsPerUnit, imageDataUrl, imageScale, imagePositionX, imagePositionY }
}

