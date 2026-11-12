import { randomInt } from 'node:crypto'
import { pool } from '../../database/pool.js'
import { lockPoints, adjustPoints } from '../loyalty/points.repository.js'
import { publicCustomer } from '../auth/auth.shared.js'
import { lockOrderCustomer, lockDiscountReward, lockProductReward, insertFulfilledRedemption, findEligibleReferrer, hasPreviousOrder, insertOrder, findOrderCustomer } from './order-write.repository.js'
import { calculateDiscount } from './discount.js'

const publicCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generatePublicCode() {
  const group = () => Array.from({ length: 4 }, () => publicCodeAlphabet[randomInt(publicCodeAlphabet.length)]).join('')
  return `${group()}-${group()}-${group()}`
}

export async function persistOrder({ customerId, businessId, discountRewardId, productRewardId, subtotal, pointsAwarded, bonusApplied, items, deliveryAddress, paymentMethod, customerNotes, fulfillmentType, deliveryReference, deliveryFloor, deliveryApartment, cashPaymentAmount, deliveryLat, deliveryLng, customerFirstName, customerLastName, referralEnabled, referralPoints, referralCode }) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const customer = await lockOrderCustomer(client, customerId)
    if (customer?.role !== 'customer') {
      await client.query('ROLLBACK')
      transactionStarted = false
      return { status: 403, body: { error: 'Solo las cuentas de cliente pueden realizar pedidos.' } }
    }
    const currentPoints = businessId ? await lockPoints(client, customerId, businessId) : 0

    let discountAmount = 0
    let discountName = ''
    let discountPointsSpent = 0
    let discountRedemptionId = null
    let productRewardName = ''
    let productRewardPointsSpent = 0
    let productRewardRedemptionId = null
    let productRewardItem = null
    if (discountRewardId !== null) {
      const discountReward = await lockDiscountReward(client, discountRewardId, businessId)
      if (!discountReward) {
        await client.query('ROLLBACK')
        transactionStarted = false
        return { status: 404, body: { error: 'Ese descuento ya no está disponible.' } }
      }
      if (currentPoints < discountReward.points_cost) {
        await client.query('ROLLBACK')
        transactionStarted = false
        return { status: 400, body: { error: 'Ya no tenés puntos suficientes para aplicar ese descuento.' } }
      }
      const discount = calculateDiscount(discountReward, items)
      if (discount.eligible === 0) {
        await client.query('ROLLBACK')
        transactionStarted = false
        return { status: 400, body: { error: 'Ese descuento no aplica a los productos de tu pedido.' } }
      }
      discountAmount = discount.amount
      discountName = discountReward.name
      discountPointsSpent = discountReward.points_cost
      discountRedemptionId = await insertFulfilledRedemption(client, businessId, customerId, discountReward)
    }

    if (productRewardId !== null) {
      const productReward = await lockProductReward(client, productRewardId, businessId)
      if (!productReward) {
        await client.query('ROLLBACK')
        transactionStarted = false
        return { status: 404, body: { error: 'Ese producto de canje ya no está disponible.' } }
      }
      if (currentPoints < productReward.points_cost) {
        await client.query('ROLLBACK')
        transactionStarted = false
        return { status: 400, body: { error: 'Ya no tenés puntos suficientes para ese producto.' } }
      }
      productRewardName = productReward.name
      productRewardPointsSpent = productReward.points_cost
      productRewardRedemptionId = await insertFulfilledRedemption(client, businessId, customerId, productReward)
      productRewardItem = {
        id: productReward.product_id,
        name: productReward.product_name,
        category: productReward.category,
        quantity: 1,
        unitPrice: 0,
        pointsPerUnit: 0,
        isReward: true,
        rewardName: productReward.name,
        pointsSpent: productReward.points_cost,
      }
    }

    const total = subtotal - discountAmount
    if (cashPaymentAmount !== null && cashPaymentAmount < total) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return { status: 400, body: { error: 'El monto con el que pagás no puede ser menor al total del pedido.' } }
    }
    if (productRewardItem) items.push(productRewardItem)
    const publicCode = generatePublicCode()
    let referrerId = null
    let referralPointsAwarded = 0
    if (businessId && referralEnabled && referralPoints > 0 && referralCode) {
      const referrer = await findEligibleReferrer(client, referralCode, customerId)
      const previousOrders = await hasPreviousOrder(client, customerId, businessId)
      if (referrer && !previousOrders) {
        referrerId = referrer.id
        referralPointsAwarded = referralPoints
      }
    }
    const orderResult = await insertOrder(client, {
      customerId, businessId, total, subtotal, discountAmount, discountName, discountPointsSpent,
      discountRedemptionId, productRewardName, productRewardPointsSpent, productRewardRedemptionId, pointsAwarded,
      items, deliveryAddress, paymentMethod, customerNotes, fulfillmentType, publicCode, deliveryReference, deliveryFloor, deliveryApartment,
      cashPaymentAmount, deliveryLat, deliveryLng, referrerId, referralPointsAwarded, customerFirstName, customerLastName,
    })
    const customerResult = await findOrderCustomer(client, customerId)
    const updatedPoints = businessId
      ? await adjustPoints(client, customerId, businessId, pointsAwarded - discountPointsSpent - productRewardPointsSpent)
      : 0
    await client.query('COMMIT')
    transactionStarted = false
    return { status: 201, body: {
      order: {
        id: orderResult.id,
        createdAt: orderResult.createdAt,
        deliveryAddress,
        deliveryReference,
        deliveryFloor,
        deliveryApartment,
        deliveryLng,
        cashPaymentAmount,
        publicCode,
        fulfillmentType,
        paymentMethod,
        customerNotes,
        customerFirstName,
        customerLastName,
        total: orderResult.total,
        subtotal: orderResult.subtotal,
        discountAmount: orderResult.discountAmount,
        discountName,
        discountPointsSpent,
        productRewardName,
        productRewardPointsSpent,
        items: orderResult.items,
        pointsEarned: orderResult.points_awarded,
        bonusApplied,
      },
      user: publicCustomer(customerResult, updatedPoints),
    } }
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
