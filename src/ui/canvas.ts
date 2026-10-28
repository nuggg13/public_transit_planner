import type { SimulationState, Stop, Bus, Passenger, Route } from '../game/types'
import { MAX_STOP_QUEUE } from '../game/types'
import type { StopShape } from '../game/shapes'
import { ZONE_SHAPES } from '../game/shapes'
import {
  DISTRICTS,
  DISTRICT_BORDER_COLOR,
  DISTRICT_COLOR,
  DISTRICT_LABEL_COLOR,
  WORLD_SIZE,
} from '../game/map'

const LANE_SPREAD = 6

export interface SegmentOffset {
  dx: number
  dy: number
}

const segmentKey = (a: Stop, b: Stop) => [a.id, b.id].sort().join('|')

/**
 * Offset tegak lurus per segmen untuk tiap rute, supaya rute yang melewati
 * segmen halte yang sama tampil berdampingan alih-alih saling menutupi.
 */
export function computeSegmentOffsets(routes: Route[]): Map<string, SegmentOffset[]> {
  const sharedSegments = new Map<string, string[]>()
  routes.forEach(route => {
    route.stops.slice(1).forEach((stop, index) => {
      const key = segmentKey(route.stops[index], stop)
      const routeIds = sharedSegments.get(key) ?? []
      if (!routeIds.includes(route.id)) routeIds.push(route.id)
      sharedSegments.set(key, routeIds)
    })
  })

  const result = new Map<string, SegmentOffset[]>()
  routes.forEach(route => {
    const offsets = route.stops.slice(1).map((stop, index) => {
      const start = route.stops[index]
      const dx = stop.position.x - start.position.x
      const dy = stop.position.y - start.position.y
      const length = Math.hypot(dx, dy)
      if (!length) return { dx: 0, dy: 0 }

      const routeIds = sharedSegments.get(segmentKey(start, stop)) ?? []
      const lane = routeIds.indexOf(route.id)
      const offset = routeIds.length > 1 ? (lane - (routeIds.length - 1) / 2) * LANE_SPREAD : 0
      const direction = start.id < stop.id ? 1 : -1
      return {
        dx: (-dy / length) * offset * direction,
        dy: (dx / length) * offset * direction,
      }
    })
    result.set(route.id, offsets)
  })
  return result
}

const INK = '#1c1917'
const PAPER = '#ffffff'
const SHELL = '#f4efe6'
const QUEUE = '#991b1b'

interface DrawArgs {
  state: SimulationState
  selectedStopId?: string
  selectedRouteId?: string
  draftRouteStopIds: string[]
  hoverStopId?: string
}

const AVENUES: Array<{ points: Array<[number, number]>; width: number }> = [
  {
    points: [
      [0, 300],
      [300, 285],
      [620, 312],
      [900, 288],
      [1200, 305],
    ],
    width: 26,
  },
  {
    points: [
      [0, 560],
      [320, 585],
      [640, 552],
      [960, 580],
      [1200, 560],
    ],
    width: 22,
  },
  {
    points: [
      [430, 0],
      [418, 210],
      [446, 440],
      [424, 620],
      [440, 800],
    ],
    width: 20,
  },
  {
    points: [
      [806, 0],
      [822, 190],
      [800, 430],
      [828, 610],
      [812, 800],
    ],
    width: 20,
  },
]

export class GameCanvas {
  private ctx: CanvasRenderingContext2D
  private dotGrid: CanvasPattern | null
  private args: DrawArgs = {
    state: {
      stops: [],
      routes: [],
      buses: [],
      passengers: [],
      deferredDemand: {},
      servedCount: 0,
      totalDemand: 0,
      boardedCount: 0,
      boardedWaitSum: 0,
      occupancySum: 0,
      occupancySamples: 0,
      isRunning: false,
      speed: 1,
      time: 0,
      seed: 1,
      growthEnabled: true,
      nextStopAt: 10,
      stopsPlaced: { residential: 0, commercial: 0, activity_center: 0 },
      stopsSpawned: 0,
      nextIds: { stop: 0, route: 0, bus: 0, passenger: 0 },
    },
    draftRouteStopIds: [],
  }

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    const patternCanvas = document.createElement('canvas')
    patternCanvas.width = 20
    patternCanvas.height = 20
    const patternContext = patternCanvas.getContext('2d')
    if (patternContext) {
      patternContext.fillStyle = 'rgba(28, 25, 23, 0.12)'
      patternContext.beginPath()
      patternContext.arc(2, 2, 1, 0, Math.PI * 2)
      patternContext.fill()
    }
    this.dotGrid = patternContext ? this.ctx.createPattern(patternCanvas, 'repeat') : null
  }

  private traceDistrict(points: Array<[number, number]>): void {
    const ctx = this.ctx
    const radius = 16
    ctx.beginPath()
    points.forEach(([x, y], index) => {
      const [prevX, prevY] = points[(index + points.length - 1) % points.length]
      const [nextX, nextY] = points[(index + 1) % points.length]
      const prevLength = Math.hypot(prevX - x, prevY - y)
      const nextLength = Math.hypot(nextX - x, nextY - y)
      const insetPrev = Math.min(radius, prevLength / 2)
      const insetNext = Math.min(radius, nextLength / 2)
      const startX = x + ((prevX - x) / prevLength) * insetPrev
      const startY = y + ((prevY - y) / prevLength) * insetPrev
      const endX = x + ((nextX - x) / nextLength) * insetNext
      const endY = y + ((nextY - y) / nextLength) * insetNext
      if (index === 0) ctx.moveTo(startX, startY)
      else ctx.lineTo(startX, startY)
      ctx.quadraticCurveTo(x, y, endX, endY)
    })
    ctx.closePath()
  }

  private traceShape(shape: StopShape, cx: number, cy: number, r: number): void {
    const ctx = this.ctx
    const cos30 = Math.cos(Math.PI / 6)
    const sin30 = Math.sin(Math.PI / 6)
    const cos45 = Math.cos(Math.PI / 4)
    switch (shape) {
      case 'circle':
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        break
      case 'square':
        ctx.beginPath()
        ctx.rect(cx - r, cy - r, r * 2, r * 2)
        return
      case 'triangle':
        ctx.beginPath()
        ctx.moveTo(cx, cy - r)
        ctx.lineTo(cx + r * cos30, cy + r * sin30)
        ctx.lineTo(cx - r * cos30, cy + r * sin30)
        ctx.closePath()
        return
      case 'parallelogram':
        ctx.beginPath()
        ctx.moveTo(cx - r * cos45, cy - r * 0.6)
        ctx.lineTo(cx + r, cy)
        ctx.lineTo(cx - r * cos45, cy + r * 0.6)
        ctx.lineTo(cx - r * 1.8, cy)
        ctx.closePath()
        return
      case 'pentagon':
        for (let i = 0; i < 5; i++) {
          const theta = Math.PI / 2 + (i * 2 * Math.PI) / 5
          const px = cx + r * Math.cos(theta)
          const py = cy + r * Math.sin(theta)
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        return
      case 'hexagon':
        for (let i = 0; i < 6; i++) {
          const theta = Math.PI / 2 + (i * 2 * Math.PI) / 6
          const px = cx + r * Math.cos(theta)
          const py = cy + r * Math.sin(theta)
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        return
      case 'oval':
        ctx.beginPath()
        ctx.ellipse(cx, cy, r * 1.35, r * 0.9, 0, 0, Math.PI * 2)
        return
      case 'rhombus':
        ctx.beginPath()
        ctx.moveTo(cx, cy - r)
        ctx.lineTo(cx + r * 0.75, cy)
        ctx.lineTo(cx, cy + r)
        ctx.lineTo(cx - r * 0.75, cy)
        ctx.closePath()
        return
      case 'trapezoid':
        ctx.beginPath()
        ctx.moveTo(cx - r * 0.5, cy - r * 0.75)
        ctx.lineTo(cx + r * 0.8, cy - r * 0.75)
        ctx.lineTo(cx + r * 0.5, cy + r * 0.8)
        ctx.lineTo(cx - r * 0.8, cy + r * 0.8)
        ctx.closePath()
        return
    }
  }

  private drawCityMap(): void {
    const ctx = this.ctx

    DISTRICTS.forEach(district => {
      this.traceDistrict(district.points)
      ctx.fillStyle = DISTRICT_COLOR[district.zone]
      ctx.fill()
    })

    if (this.dotGrid) {
      ctx.fillStyle = this.dotGrid
      ctx.fillRect(0, 0, WORLD_SIZE.x, WORLD_SIZE.y)
    }

    DISTRICTS.forEach(district => {
      this.traceDistrict(district.points)
      ctx.strokeStyle = DISTRICT_BORDER_COLOR[district.zone]
      ctx.lineWidth = 1.5
      ctx.stroke()
    })

    AVENUES.forEach(({ points, width }) => {
      ctx.beginPath()
      ctx.moveTo(points[0][0], points[0][1])
      points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y))
      ctx.strokeStyle = '#57534e'
      ctx.lineWidth = width + 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
      ctx.strokeStyle = PAPER
      ctx.lineWidth = width
      ctx.stroke()
      ctx.strokeStyle = '#d6cbbe'
      ctx.lineWidth = 1
      ctx.setLineDash([8, 10])
      ctx.stroke()
      ctx.setLineDash([])
    })
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'

    ctx.font = '600 12px system-ui, "Segoe UI", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    DISTRICTS.forEach(district => {
      const [x, y] = district.labelAt
      ctx.fillStyle = DISTRICT_LABEL_COLOR[district.zone]
      ctx.fillText(district.label.toUpperCase(), x, y)
    })
  }

  private traceRoute(stops: Stop[]): void {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.moveTo(stops[0].position.x, stops[0].position.y)
    stops.slice(1).forEach(s => ctx.lineTo(s.position.x, s.position.y))
  }

  private drawRoutes(): void {
    const routes = this.args.state.routes.filter(route => route.stops.length >= 2)
    const offsetsByRoute = computeSegmentOffsets(routes)

    const traceOffsetRoute = (route: Route) => {
      this.ctx.beginPath()
      route.stops.slice(1).forEach((stop, index) => {
        const start = route.stops[index]
        const offset = offsetsByRoute.get(route.id)?.[index] ?? {
          dx: 0,
          dy: 0,
        }
        const startX = start.position.x + offset.dx
        const startY = start.position.y + offset.dy
        const stopX = stop.position.x + offset.dx
        const stopY = stop.position.y + offset.dy

        if (index === 0) this.ctx.moveTo(startX, startY)
        else this.ctx.lineTo(startX, startY)
        this.ctx.lineTo(stopX, stopY)
      })
    }

    const strokeRoute = (route: Route, color: string, lineWidth: number) => {
      traceOffsetRoute(route)
      this.ctx.strokeStyle = color
      this.ctx.lineWidth = lineWidth
      this.ctx.lineCap = 'round'
      this.ctx.lineJoin = 'round'
      this.ctx.stroke()
    }

    this.ctx.lineJoin = 'round'
    routes.forEach(route => {
      const selected = route.id === this.args.selectedRouteId
      strokeRoute(route, PAPER, selected ? 9 : 7)
    })
    routes.forEach(route => {
      const selected = route.id === this.args.selectedRouteId
      strokeRoute(route, route.color, selected ? 5 : 3)
    })
    routes.forEach(route => {
      if (!route.pendingStops || route.pendingStops.length < 2) return
      this.traceRoute(route.pendingStops)
      this.ctx.strokeStyle = INK
      this.ctx.lineWidth = 2
      this.ctx.lineCap = 'round'
      this.ctx.setLineDash([6, 6])
      this.ctx.stroke()
      this.ctx.setLineDash([])
    })
    this.ctx.lineCap = 'butt'
    this.ctx.lineJoin = 'miter'
  }

  private drawDraftRoute(): void {
    const ids = this.args.draftRouteStopIds
    if (ids.length < 2) return
    const stops = ids
      .map(id => this.args.state.stops.find(s => s.id === id))
      .filter((s): s is Stop => s !== undefined)
    if (stops.length < 2) return
    this.traceRoute(stops)
    this.ctx.strokeStyle = INK
    this.ctx.lineWidth = 3
    this.ctx.setLineDash([9, 7])
    this.ctx.stroke()
    this.ctx.setLineDash([])
  }

  private drawQueues(state: SimulationState): void {
    const byStop = new Map<string, Passenger[]>()
    state.passengers.forEach(p => {
      if (p.status !== 'waiting') return
      const queue = byStop.get(p.originStopId)
      if (queue) queue.push(p)
      else byStop.set(p.originStopId, [p])
    })

    const ctx = this.ctx
    ctx.save()
    ctx.font = '600 10px system-ui, "Segoe UI", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'

    byStop.forEach((queue, stopId) => {
      const stop = state.stops.find(s => s.id === stopId)
      if (!stop) return
      const shown = Math.min(MAX_STOP_QUEUE, queue.length)
      const columns = 5
      const gapX = 22
      const gapY = 20
      const startX = stop.position.x - ((columns - 1) * gapX) / 2
      for (let i = 0; i < shown; i++) {
        const p = queue[i]
        const dest = state.stops.find(s => s.id === p.destinationStopId)
        const shape = dest?.shape ?? ZONE_SHAPES[dest?.zone ?? stop.zone][0]
        const x = startX + (i % columns) * gapX
        const y = stop.position.y + 34 + Math.floor(i / columns) * gapY
        this.traceShape(shape, x, y, 9)
        ctx.fillStyle = PAPER
        ctx.fill()
        this.traceShape(shape, x, y, 6)
        ctx.fillStyle = QUEUE
        ctx.fill()
      }
      if (queue.length > shown) {
        ctx.fillStyle = QUEUE
        ctx.fillText(`+${queue.length - shown}`, startX + columns * gapX, stop.position.y + 40)
      }
    })

    ctx.restore()
  }

  private drawStop(stop: Stop): void {
    const { x, y } = stop.position
    const ctx = this.ctx
    const selected = stop.id === this.args.selectedStopId
    const hovered = stop.id === this.args.hoverStopId
    const inDraft = this.args.draftRouteStopIds.includes(stop.id)
    const radius = selected ? 16 : 14
    const shape = stop.shape ?? ZONE_SHAPES[stop.zone][0]

    this.traceShape(shape, x, y, radius)
    ctx.fillStyle = PAPER
    ctx.fill()
    ctx.strokeStyle = INK
    ctx.lineWidth = 2.5
    ctx.stroke()

    this.traceShape(shape, x, y, radius * 0.55)
    ctx.fillStyle = QUEUE
    ctx.fill()

    if (selected || hovered || inDraft) {
      this.traceShape(shape, x, y, radius + 5)
      ctx.strokeStyle = selected ? QUEUE : INK
      ctx.lineWidth = selected ? 3 : 1.5
      ctx.stroke()
    }

    ctx.font = '11px system-ui, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    const width = ctx.measureText(stop.name).width
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)'
    ctx.fillRect(x - width / 2 - 4, y - radius - 22, width + 8, 14)
    ctx.fillStyle = INK
    ctx.fillText(stop.name, x, y - radius - 9)
  }

  private drawBus(bus: Bus): void {
    const route = this.args.state.routes.find(r => r.id === bus.routeId)
    const ctx = this.ctx
    const { x, y } = bus.position
    const angle = bus.direction === -1 ? Math.PI : 0

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    if (bus.retiring) ctx.globalAlpha = 0.45

    // ponytail: ukuran statis bus dan badge angka; jadikan dinamis jika ada fitur zoom
    ctx.beginPath()
    ctx.roundRect(-18, -10, 36, 20, 4)
    ctx.fillStyle = PAPER
    ctx.fill()

    ctx.beginPath()
    ctx.roundRect(-16, -8, 32, 16, 3)
    ctx.fillStyle = route?.color ?? INK
    ctx.fill()

    // Front indicator (triangle)
    ctx.beginPath()
    ctx.moveTo(16, 0)
    ctx.lineTo(8, -6)
    ctx.lineTo(8, 6)
    ctx.closePath()
    ctx.fillStyle = PAPER
    ctx.fill()

    ctx.restore()

    // Larger, more visible passenger count
    ctx.font = '700 14px Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const text = String(bus.passengers)
    const tw = ctx.measureText(text).width
    ctx.beginPath()
    ctx.roundRect(x - tw / 2 - 4, y - 9, tw + 8, 18, 3)
    ctx.fillStyle = 'rgba(239, 234, 224, 0.95)'
    ctx.fill()
    ctx.fillStyle = INK
    ctx.fillText(text, x, y)
  }

  draw(args: DrawArgs): void {
    this.args = args

    this.ctx.fillStyle = SHELL
    this.ctx.fillRect(0, 0, WORLD_SIZE.x, WORLD_SIZE.y)

    this.drawCityMap()
    this.drawQueues(args.state)
    this.drawRoutes()
    this.drawDraftRoute()
    args.state.stops.forEach(stop => this.drawStop(stop))
    args.state.buses.forEach(bus => this.drawBus(bus))
  }
}
