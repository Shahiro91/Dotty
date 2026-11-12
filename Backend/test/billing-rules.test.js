import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeBilling } from '../src/modules/billing/billing.rules.js'

test('billing preserves due date, grace period and payment window boundaries', () => {
  const due = new Date('2026-03-20T12:00:00Z')
  const business = { plan: 'basic', subscriptionDueAt: due }
  assert.equal(describeBilling(business, due, 0).status, 'active')
  assert.equal(describeBilling(business, new Date(due.getTime() + 1), 0).status, 'suspended')
  assert.equal(describeBilling(business, new Date('2026-03-25T12:00:00Z'), 5).status, 'grace')
  assert.equal(describeBilling(business, new Date('2026-03-25T12:00:00.001Z'), 5).status, 'suspended')
  assert.equal(describeBilling(business, new Date('2026-03-10T12:00:00Z')).canPay, true)
  assert.equal(describeBilling(business, new Date('2026-03-10T11:59:59.999Z')).canPay, false)
  assert.equal(describeBilling(business, due).price, 15000)
})
