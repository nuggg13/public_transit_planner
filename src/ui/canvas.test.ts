import { describe, it, expect } from 'vitest'
import type { Stop, Route } from '../game/types'
import { computeSegmentOffsets } from './canvas'

const stop = (id: string, x: number, y: number): Stop => ({
  id,
  position: { x, y },
  zone: 'residential',
  name: id,
})

const route = (id: string, stops: Stop[]): Route => ({
  id,
  name: id,
  stops,
  busCount: 1,
  color: '#dc2626',
})

describe('computeSegmentOffsets', () => {
  it('rute tunggal tidak diberi offset', () => {
    const a = stop('A', 0, 0)
    const b = stop('B', 100, 0)
    const c = stop('C', 200, 0)
    const offsets = computeSegmentOffsets([route('r1', [a, b, c])]).get('r1')!
    expect(offsets).toHaveLength(2)
    expect(offsets[0].dx).toBeCloseTo(0, 5)
    expect(offsets[0].dy).toBeCloseTo(0, 5)
    expect(offsets[1].dx).toBeCloseTo(0, 5)
    expect(offsets[1].dy).toBeCloseTo(0, 5)
  })

  it('dua rute berbagi segmen digeser berlawanan arah', () => {
    const a = stop('A', 0, 0)
    const b = stop('B', 100, 0)
    const c = stop('C', 200, 0)
    const offsets = computeSegmentOffsets([route('r1', [a, b, c]), route('r2', [b, c])])
    expect(offsets.get('r1')![0].dx).toBeCloseTo(0, 5)
    expect(offsets.get('r1')![0].dy).toBeCloseTo(0, 5)
    expect(offsets.get('r1')![1].dx).toBeCloseTo(0, 5)
    expect(offsets.get('r1')![1].dy).toBeCloseTo(-3, 5)
    expect(offsets.get('r2')![0].dx).toBeCloseTo(0, 5)
    expect(offsets.get('r2')![0].dy).toBeCloseTo(3, 5)
  })

  it('tiga rute berbagi segmen tersebar rata', () => {
    const a = stop('A', 0, 0)
    const b = stop('B', 100, 0)
    const c = stop('C', 200, 0)
    const offsets = computeSegmentOffsets([
      route('r1', [a, b, c]),
      route('r2', [b, c]),
      route('r3', [b, c]),
    ])
    expect(offsets.get('r1')![1].dy).toBeCloseTo(-6, 5)
    expect(offsets.get('r2')![0].dy).toBeCloseTo(0, 5)
    expect(offsets.get('r3')![0].dy).toBeCloseTo(6, 5)
  })

  it('segmen vertikal digeser horizontal dan arah berlawanan tetap terpisah', () => {
    const a = stop('A', 100, 0)
    const b = stop('B', 100, 100)
    const offsets = computeSegmentOffsets([route('r1', [a, b]), route('r2', [b, a])])
    expect(offsets.get('r1')![0].dx).toBeCloseTo(3, 5)
    expect(offsets.get('r1')![0].dy).toBeCloseTo(0, 5)
    expect(offsets.get('r2')![0].dx).toBeCloseTo(-3, 5)
    expect(offsets.get('r2')![0].dy).toBeCloseTo(0, 5)
  })
})
