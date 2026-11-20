import { isVipPlan } from '../billing/billing.rules.js'

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
