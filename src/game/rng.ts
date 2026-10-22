export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pickWeightedIndex<T>(
  items: T[],
  weight: (item: T) => number,
  random: () => number,
): number {
  const total = items.reduce((sum, item) => sum + weight(item), 0)
  let target = random() * total
  for (let i = 0; i < items.length; i++) {
    target -= weight(items[i])
    if (target < 0) return i
  }
  return items.length - 1
}
