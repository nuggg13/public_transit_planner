import type { ZoneType } from './types'

export type StopShape =
  | 'circle'
  | 'square'
  | 'triangle'
  | 'parallelogram'
  | 'pentagon'
  | 'hexagon'
  | 'oval'
  | 'rhombus'
  | 'trapezoid'

export const ZONE_SHAPES: Record<ZoneType, StopShape[]> = {
  residential: ['circle', 'square', 'triangle'],
  commercial: ['parallelogram', 'pentagon', 'hexagon'],
  activity_center: ['oval', 'rhombus', 'trapezoid'],
}

export const SHAPE_LABEL: Record<StopShape, string> = {
  circle: 'Lingkaran',
  square: 'Persegi',
  triangle: 'Segitiga',
  parallelogram: 'Jajar genjang',
  pentagon: 'Segilima',
  hexagon: 'Segienam',
  oval: 'Oval',
  rhombus: 'Belah ketupat',
  trapezoid: 'Trapezium',
}

const SHAPE_SET = new Set<string>(Object.keys(SHAPE_LABEL))

export function isStopShape(value: unknown): value is StopShape {
  return typeof value === 'string' && SHAPE_SET.has(value)
}
