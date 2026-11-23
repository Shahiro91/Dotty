import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readCategoryOrder } from '../src/modules/catalog/categories.schema.js'

test('category order requires an array of unique, valid names', () => {
  assert.deepEqual(readCategoryOrder({ categories: ['Pizzas', 'Bebidas'] }), ['Pizzas', 'Bebidas'])
  for (const categories of [null, 'Pizzas', ['Pizzas', 'Pizzas'], [''], [' Pizzas'], [1], ['a'.repeat(61)]]) {
    assert.equal(readCategoryOrder({ categories }), null)
  }
})
