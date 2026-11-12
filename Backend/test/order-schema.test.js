import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readOrderInput } from '../src/modules/orders/order.schema.js'

test('order input preserves validation and normalized delivery values', () => {
  const body = {
    businessSlug: 'pizza', items: [{ id: 1, quantity: 1, addonIds: ['2'] }],
    customerFirstName: ' Ana ', customerLastName: ' Perez ',
    fulfillmentType: 'delivery', deliveryAddress: ' Calle 123 ',
    deliveryLat: '-34.5', deliveryLng: '-58.4', paymentMethod: 'cash', cashPaymentAmount: '1500',
    referralCode: ' abcdef0123 ',
  }
  const input = readOrderInput(body)
  assert.equal(input.error, undefined)
  assert.deepEqual(input.requestedAddonIds, [2])
  assert.equal(input.customerFirstName, 'Ana')
  assert.equal(input.deliveryAddress, 'Calle 123')
  assert.equal(input.deliveryLat, -34.5)
  assert.equal(input.cashPaymentAmount, 1500)
  assert.equal(input.referralCode, 'ABCDEF0123')
  assert.match(readOrderInput({ ...body, items: [{ id: 1, addonIds: [2, '2'] }] }).error, /agregados/)
  assert.match(readOrderInput({ ...body, discountRewardId: 1, productRewardId: 2 }).error, /canje/)
  assert.match(readOrderInput({ ...body, deliveryLat: 91 }).error, /delivery/)
  assert.match(readOrderInput({ ...body, customerFirstName: '' }).error, /nombre/)
})
