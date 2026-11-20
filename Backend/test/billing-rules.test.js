import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeBilling, isVipPlan, PLAN_LABELS, PLAN_PRICES } from '../src/modules/billing/billing.rules.js'

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

test('VIP PLUS has its monthly price and inherits VIP features', () => {
  assert.equal(PLAN_PRICES.vip_plus, 35000)
  assert.equal(PLAN_LABELS.vip_plus, 'VIP PLUS')
  assert.equal(describeBilling({ plan: 'vip_plus', subscriptionDueAt: new Date('2026-03-20T12:00:00Z') }).price, 35000)
  assert.equal(isVipPlan('vip_plus'), true)
  assert.equal(isVipPlan('vip'), true)
  assert.equal(isVipPlan('basic'), false)
})
