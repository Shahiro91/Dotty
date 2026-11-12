import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildOrderItems } from '../src/modules/orders/order-items.service.js'

test('order lines validate required addon groups and calculate totals', () => {
  const product = { id: 1, name: 'Pizza', category: 'Pizzas', categoryId: 7, price: 1000, pointsPerUnit: 5 }
  const addon = { id: 2, name: 'Queso', category: 'Pizzas', productId: null, groupName: 'Extras', selectionMode: 'multiple', price: 250 }
  const input = {
    requestedItems: [{ id: 1, quantity: 2 }],
    productById: new Map([['1', product]]),
    addonById: new Map([['2', addon]]),
    businessId: 1,
    requiredTwoGroupsByProduct: new Map(),
    mustChooseGroupsByScope: new Map([['category:7', [{ productId: null, groupName: 'extras', label: 'Extras' }]]]),
  }
  assert.match(buildOrderItems(input).error, /Extras/)
  const result = buildOrderItems({ ...input, requestedItems: [{ id: 1, quantity: 2, addonIds: [2] }] })
  assert.equal(result.items[0].unitPrice, 1250)
  assert.equal(result.items[0].pointsPerUnit, 5)
  assert.equal(result.items[0].quantity, 2)
  assert.equal(result.items[0].addOns[0].id, 2)
  assert.match(buildOrderItems({ ...input, requestedItems: [{ id: 1, quantity: 0 }] }).error, /cantidades/)
})
