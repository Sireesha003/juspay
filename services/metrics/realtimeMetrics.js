const counters = new Map()

export function incCounter(name, delta = 1) {
  counters.set(name, (counters.get(name) || 0) + delta)
}

export function snapshotCounters() {
  return Object.fromEntries(counters.entries())
}

export function resetCounters() {
  counters.clear()
}
