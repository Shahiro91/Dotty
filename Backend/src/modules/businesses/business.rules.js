function getBuenosAiresWeekday() {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
  }).format(new Date())
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday]
}

export function hasDoublePointsToday(plan, days) {
  return plan === 'vip' && days.includes(getBuenosAiresWeekday())
}
