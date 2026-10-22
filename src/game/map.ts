import type { Vector2 } from '../types/index'
import { ZoneType } from './types'
import type { ZoneType as Zone } from './types'

export const WORLD_SIZE: Vector2 = { x: 1200, y: 800 }

interface District {
  zone: Zone
  points: Array<[number, number]>
  label: string
  labelAt: [number, number]
}

// Three bands that tile the whole world. The shared edges are kinked so the
// boundary reads as a city edge rather than a hard grid line.
export const DISTRICTS: District[] = [
  {
    zone: ZoneType.RESIDENTIAL,
    points: [[16, 16], [420, 16], [478, 400], [420, 784], [16, 784]],
    label: 'Permukiman',
    labelAt: [70, 92],
  },
  {
    zone: ZoneType.COMMERCIAL,
    points: [[420, 16], [780, 16], [838, 400], [780, 784], [420, 784], [478, 400]],
    label: 'Komersial',
    labelAt: [560, 92],
  },
  {
    zone: ZoneType.ACTIVITY_CENTER,
    points: [[780, 16], [1184, 16], [1184, 784], [780, 784], [838, 400]],
    label: 'Pusat aktivitas',
    labelAt: [880, 92],
  },
]

export const DISTRICT_COLOR: Record<Zone, string> = {
  residential: '#d7e6d5',
  commercial: '#e9e0cc',
  activity_center: '#f0dcc4',
}

export function pointInPolygon(x: number, y: number, points: Array<[number, number]>): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

export function zoneAt(position: Vector2): Zone {
  for (const district of DISTRICTS) {
    if (pointInPolygon(position.x, position.y, district.points)) return district.zone
  }
  return ZoneType.COMMERCIAL
}

export function clampToWorld(position: Vector2): Vector2 {
  return {
    x: Math.min(Math.max(position.x, 16), WORLD_SIZE.x - 16),
    y: Math.min(Math.max(position.y, 16), WORLD_SIZE.y - 16),
  }
}

export function randomPointInZone(zone: Zone, random: () => number): Vector2 {
  const district = DISTRICTS.find(d => d.zone === zone) ?? DISTRICTS[0]
  const xs = district.points.map(p => p[0])
  const ys = district.points.map(p => p[1])
  const minX = Math.min(...xs) + 24
  const maxX = Math.max(...xs) - 24
  const minY = Math.min(...ys) + 24
  const maxY = Math.max(...ys) - 24

  for (let attempt = 0; attempt < 40; attempt++) {
    const x = minX + random() * (maxX - minX)
    const y = minY + random() * (maxY - minY)
    if (pointInPolygon(x, y, district.points)) return { x, y }
  }

  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}
