import { isVipPlan } from '../billing/billing.rules.js'

export function businessSlug(name, suffix) {
  const base = name.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'local'
  return `${base.slice(0, 120 - suffix.length)}${suffix}`
}

export function slugMatchesBusinessName(name, slug) {
  const suffixes = ['', slug.match(/-\d+$/)?.[0], slug.match(/-\d+-\d+$/)?.[0]]
  return suffixes.some((suffix) => suffix !== undefined && businessSlug(name, suffix) === slug)
}

function getBuenosAiresWeekday() {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
  }).format(new Date())
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday]
}

export function isAvailableToday(days) {
  return !Array.isArray(days) || days.length === 0 || days.includes(getBuenosAiresWeekday())
}

export function hasDoublePointsToday(plan, days) {
  return isVipPlan(plan) && days.includes(getBuenosAiresWeekday())
}
