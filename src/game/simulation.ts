import type { SimulationState, Stop, Route, Bus, Passenger, GameConfig, ZoneType, JourneyLeg } from './types'
import { ZONE_MULTIPLIER, MAX_BUSES_PER_ROUTE, MAX_STOP_QUEUE } from './types'
import { ZONE_SHAPES } from './shapes'
import { randomPointInZone, zoneAt, clampToWorld } from './map'
import { mulberry32, pickWeightedIndex } from './rng'

const DEFAULT_ACTIVE_CAP = 500
const BASE_DEMAND_RATE = 1 / 5
const BUS_SPEED = 30
const DWELL_TIME = 0.25
const MIN_ROUTE_STOPS = 2
const MAX_STEP = 0.25
const MAX_STOPS = 15
const FIRST_STOP_DELAY = 10
const GROWTH_INTERVAL_FACTOR = 3
const GROWTH_RETRY_LIMIT = 20

export interface RouteUpdate {
  name?: string
  color?: string
  stops?: string[]
  busCount?: number
}

export class Simulation {
  private state: SimulationState
  private config: GameConfig
  private random: () => number

  constructor(config: GameConfig) {
    this.config = config
    const seed = config.seed ?? 1
    this.random = mulberry32(seed)
    this.state = {
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
      seed,
      nextIds: { stop: 0, route: 0, bus: 0, passenger: 0 },
      growthEnabled: true,
      nextStopAt: FIRST_STOP_DELAY,
      stopsPlaced: { residential: 0, commercial: 0, activity_center: 0 },
      stopsSpawned: 0,
    }
  }

  getState(): SimulationState {
    return this.state
  }

  private get activeCap(): number {
    return this.config.maxActivePassengers ?? DEFAULT_ACTIVE_CAP
  }

  private nextId(kind: 'stop' | 'route' | 'bus'): string {
    const prefix = kind === 'stop' ? 's' : kind === 'route' ? 'r' : 'b'
    this.state.nextIds[kind] += 1
    return `${prefix}${this.state.nextIds[kind]}`
  }

  private bumpCounter(kind: 'stop' | 'route' | 'bus', id: string): void {
    const n = parseInt(id.replace(/\D/g, ''), 10)
    if (!Number.isNaN(n)) this.state.nextIds[kind] = Math.max(this.state.nextIds[kind], n)
  }

  addStop(stop: Stop): void {
    if (!stop.id) stop.id = this.nextId('stop')
    else this.bumpCounter('stop', stop.id)
    // Assign shape if not present (for manual stops)
    if (!stop.shape) {
      const shapes = ZONE_SHAPES[stop.zone]
      const idx = this.state.stopsPlaced[stop.zone] % shapes.length
      stop.shape = shapes[idx]
    }
    this.state.stops.push(stop)
    // Update zone count
    if (stop.zone === 'residential') this.state.stopsPlaced.residential++
    else if (stop.zone === 'commercial') this.state.stopsPlaced.commercial++
    else if (stop.zone === 'activity_center') this.state.stopsPlaced.activity_center++
  }

  canPlaceStop(position: { x: number; y: number }, ignoreStopId?: string): boolean {
    return !this.state.stops.some(stop => {
      if (stop.id === ignoreStopId) return false
      return (
        Math.hypot(stop.position.x - position.x, stop.position.y - position.y) <
        this.config.stopDistance
      )
    })
  }

  validateRoute(stopIds: string[]): string | null {
    if (stopIds.length < MIN_ROUTE_STOPS) return 'Rute butuh minimal 2 halte berbeda.'
    if (new Set(stopIds).size !== stopIds.length) return 'Halte tidak boleh berulang dalam satu rute.'
    const valid = new Set(this.state.stops.map(s => s.id))
    if (stopIds.some(id => !valid.has(id))) return 'Ada halte yang tidak dikenal.'
    return null
  }

  private resolveStops(stopIds: string[]): Stop[] {
    return stopIds
      .map(id => this.state.stops.find(s => s.id === id))
      .filter((s): s is Stop => s !== undefined)
  }

  createRoute(stopIds: string[], color: string): Route | string {
    const error = this.validateRoute(stopIds)
    if (error) return error

    this.state.nextIds.route += 1
    const route: Route = {
      id: `r${this.state.nextIds.route}`,
      name: `Rute ${this.state.nextIds.route}`,
      stops: this.resolveStops(stopIds),
      busCount: 0,
      color,
    }
    this.state.routes.push(route)
    this.spawnBuses(route, 1)
    return route
  }

  updateRoute(routeId: string, update: RouteUpdate): string | null {
    const route = this.state.routes.find(r => r.id === routeId)
    if (!route) return 'Rute tidak ditemukan.'

    if (update.stops) {
      const error = this.validateRoute(update.stops)
      if (error) return error
      route.pendingStops = this.resolveStops(update.stops)
    }
    if (update.name !== undefined) {
      const name = update.name.trim().slice(0, 32)
      if (name) route.name = name
    }
    if (update.color !== undefined) route.color = update.color
    if (update.busCount !== undefined) {
      route.pendingBusCount = Math.min(Math.max(Math.round(update.busCount), 1), MAX_BUSES_PER_ROUTE)
      if (!route.pendingStops) this.reconcileBuses(route)
    }
    return null
  }

  createStopAt(x: number, y: number): Stop | string {
    const position = clampToWorld({ x, y })
    if (!this.canPlaceStop(position)) return 'Terlalu dekat dengan halte lain (min 100 unit).'

    const zone = zoneAt(position)
    this.state.nextIds.stop += 1
    const stop: Stop = {
      id: `s${this.state.nextIds.stop}`,
      position,
      zone,
      name: `Halte ${this.state.nextIds.stop}`,
    }
    this.addStop(stop)
    return stop
  }

  deleteRoute(routeId: string): void {
    const route = this.state.routes.find(r => r.id === routeId)
    if (!route) return

    route.pendingStops = undefined
    route.pendingBusCount = undefined
    const routeBuses = this.state.buses.filter(b => b.routeId === routeId)
    if (routeBuses.length === 0) {
      this.state.routes = this.state.routes.filter(r => r.id !== routeId)
      return
    }
    routeBuses.forEach(bus => {
      bus.retiring = true
    })
  }

  private spawnBuses(route: Route, count: number): void {
    const pathLength = this.routePathLength(route.stops)
    const existing = this.state.buses.filter(b => b.routeId === route.id).length
    const total = existing + count

    for (let i = 0; i < count; i++) {
      const t = (existing + i) / total
      const spot = this.pointAlongRoute(route.stops, pathLength * t)
      const bus: Bus = {
        id: this.nextId('bus'),
        routeId: route.id,
        position: spot.position,
        currentStopIndex: spot.stopIndex,
        passengers: 0,
        capacity: this.config.defaultBusCapacity,
        direction: spot.direction,
      }
      this.state.buses.push(bus)
      if (t === 0) {
        bus.atStopTime = 0
        this.handleArrival(bus)
      }
    }
    route.busCount = this.state.buses.filter(b => b.routeId === route.id && !b.retiring).length
  }

  private reconcileBuses(route: Route): void {
    if (route.pendingStops) {
      route.stops = route.pendingStops
      route.pendingStops = undefined
      const size = route.stops.length
      this.state.buses
        .filter(b => b.routeId === route.id && !b.retiring)
        .forEach(bus => {
          bus.currentStopIndex = Math.min(bus.currentStopIndex, size - 1)
        })
    }

    if (route.pendingBusCount !== undefined) {
      const target = route.pendingBusCount
      route.pendingBusCount = undefined
      const active = this.state.buses.filter(b => b.routeId === route.id && !b.retiring)
      if (active.length < target) {
        this.spawnBuses(route, target - active.length)
      } else if (active.length > target) {
        active.slice(target).forEach(bus => {
          bus.retiring = true
        })
      }
      route.busCount = this.state.buses.filter(b => b.routeId === route.id && !b.retiring).length
    }
  }

  private routePathLength(stops: Stop[]): number {
    let total = 0
    for (let i = 1; i < stops.length; i++) {
      total += Math.hypot(
        stops[i].position.x - stops[i - 1].position.x,
        stops[i].position.y - stops[i - 1].position.y,
      )
    }
    return total
  }

  private pointAlongRoute(
    stops: Stop[],
    distance: number,
  ): { position: { x: number; y: number }; stopIndex: number; direction: 1 | -1 } {
    let remaining = distance
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1].position
      const b = stops[i].position
      const segment = Math.hypot(b.x - a.x, b.y - a.y)
      if (remaining <= segment && segment > 0) {
        const t = remaining / segment
        return {
          position: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
          stopIndex: i - 1,
          direction: 1,
        }
      }
      remaining -= segment
    }
    const last = stops[stops.length - 1]
    return { position: { ...last.position }, stopIndex: stops.length - 1, direction: -1 }
  }

  update(deltaTime: number): void {
    if (!this.state.isRunning) return

    const gameDelta = Math.min(deltaTime, MAX_STEP) * this.state.speed
    this.state.time += gameDelta

    this.growStops()
    this.materializeDeferred()
    this.spawnDemand(gameDelta)

    const routesById = new Map(this.state.routes.map(r => [r.id, r]))
    const arrived: Bus[] = []

    this.state.buses.forEach(bus => {
      const route = routesById.get(bus.routeId)
      if (!route || route.stops.length < MIN_ROUTE_STOPS) return
      this.advanceBus(bus, route, gameDelta, arrived)
    })
    arrived.forEach(bus => this.handleArrival(bus))

    this.state.passengers.forEach(passenger => {
      if (passenger.status === 'waiting') passenger.waitingTime += gameDelta
    })

    const activeBuses = this.state.buses.filter(b => {
      const route = routesById.get(b.routeId)
      return route && !b.retiring && route.stops.length > 1
    })
    if (activeBuses.length > 0) {
      const occupancy =
        activeBuses.reduce((sum, b) => sum + b.passengers / b.capacity, 0) / activeBuses.length
      this.state.occupancySum += occupancy
      this.state.occupancySamples += 1
    }
  }

  private growStops(): void {
    if (!this.state.growthEnabled) return
    if (this.state.time < this.state.nextStopAt) return
    if (this.state.stopsSpawned >= MAX_STOPS) {
      this.state.growthEnabled = false
      return
    }

    const zones: ZoneType[] = ['residential', 'commercial', 'activity_center']
    const zone = zones[Math.floor(this.random() * zones.length)]
    const shapes = ZONE_SHAPES[zone]
    const shape = shapes[this.state.stopsPlaced[zone] % shapes.length]
    const position = this.findSpawnPosition(zone)
    if (!position) {
      this.state.nextStopAt = this.state.time + FIRST_STOP_DELAY
      return
    }

    this.state.nextIds.stop += 1
    const stop: Stop = {
      id: `s${this.state.nextIds.stop}`,
      position,
      zone,
      name: `Halte ${this.state.nextIds.stop}`,
      shape,
    }
    this.state.stops.push(stop)
    this.state.stopsPlaced[zone] += 1
    this.state.stopsSpawned += 1
    this.state.nextStopAt =
      FIRST_STOP_DELAY * GROWTH_INTERVAL_FACTOR ** this.state.stopsSpawned
    if (this.state.stopsSpawned >= MAX_STOPS) this.state.growthEnabled = false
  }

  private findSpawnPosition(zone: ZoneType): { x: number; y: number } | null {
    for (let attempt = 0; attempt < GROWTH_RETRY_LIMIT; attempt++) {
      const candidate = randomPointInZone(zone, this.random)
      if (this.canPlaceStop(candidate)) return candidate
    }
    return null
  }

  private spawnDemand(gameDelta: number): void {
    if (this.state.stops.length < MIN_ROUTE_STOPS) return

    this.state.stops.forEach(stop => {
      const chance = BASE_DEMAND_RATE * ZONE_MULTIPLIER[stop.zone] * gameDelta
      if (this.random() >= chance) return
      if (this.waitingCountAt(stop.id) >= MAX_STOP_QUEUE) return

      const candidates = this.state.stops
        .filter(s => s.id !== stop.id)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
      if (candidates.length === 0) return

      const destination =
        candidates[pickWeightedIndex(candidates, s => ZONE_MULTIPLIER[s.zone], this.random)]
      this.state.totalDemand += 1

      if (this.activeCount() >= this.activeCap) {
        const key = `${stop.id}>${destination.id}`
        this.state.deferredDemand[key] = (this.state.deferredDemand[key] ?? 0) + 1
        return
      }
      this.createPassenger(stop.id, destination.id)
    })
  }

  private createPassenger(originId: string, destinationId: string): Passenger {
    this.state.nextIds.passenger += 1
    const passenger: Passenger = {
      id: `p${this.state.nextIds.passenger}`,
      originStopId: originId,
      destinationStopId: destinationId,
      waitingTime: 0,
      status: 'waiting',
      hasBoarded: false,
    }
    this.state.passengers.push(passenger)
    return passenger
  }

  previewJourney(originId: string, destinationId: string): JourneyLeg[] | null {
    return this.findJourney(originId, destinationId)
  }

  private findJourney(originId: string, destinationId: string): JourneyLeg[] | null {
    if (originId === destinationId) return null
    const exists = (id: string) => this.state.stops.some(s => s.id === id)
    if (!exists(originId) || !exists(destinationId)) return null

    type PathState = { stopId: string; legs: JourneyLeg[]; dist: number }
    const best = new Map<string, { legs: number; dist: number }>()
    const open: PathState[] = [{ stopId: originId, legs: [], dist: 0 }]
    best.set(originId, { legs: 0, dist: 0 })

    while (open.length > 0) {
      open.sort((a, b) => a.legs.length - b.legs.length || a.dist - b.dist)
      const current = open.shift()!
      if (current.stopId === destinationId) return current.legs

      for (const route of this.state.routes) {
        const fromIndex = route.stops.findIndex(s => s.id === current.stopId)
        if (fromIndex < 0) continue
        const lastLeg = current.legs[current.legs.length - 1]
        if (lastLeg?.routeId === route.id) continue

        route.stops.forEach((stop, i) => {
          if (i === fromIndex) return
          const legDistance = this.routeSegmentDistance(route.stops, fromIndex, i)
          const legs = [...current.legs, { routeId: route.id, alightStopId: stop.id }]
          const dist = current.dist + legDistance
          const seen = best.get(stop.id)
          if (
            seen &&
            (seen.legs < legs.length || (seen.legs === legs.length && seen.dist <= dist))
          ) {
            return
          }
          best.set(stop.id, { legs: legs.length, dist })
          open.push({ stopId: stop.id, legs, dist })
        })
      }
    }
    return null
  }

  private routeSegmentDistance(stops: Stop[], fromIndex: number, toIndex: number): number {
    const start = Math.min(fromIndex, toIndex)
    const end = Math.max(fromIndex, toIndex)
    let total = 0
    for (let i = start + 1; i <= end; i++) {
      total += Math.hypot(
        stops[i].position.x - stops[i - 1].position.x,
        stops[i].position.y - stops[i - 1].position.y,
      )
    }
    return total
  }

  private waitingCountAt(stopId: string): number {
    let count = 0
    this.state.passengers.forEach(p => {
      if (p.status === 'waiting' && p.originStopId === stopId) count += 1
    })
    return count
  }

  private activeCount(): number {
    let count = 0
    this.state.passengers.forEach(p => {
      if (p.status === 'waiting' || p.status === 'onboard') count += 1
    })
    return count
  }

  private deferredTotal(): number {
    return Object.values(this.state.deferredDemand).reduce((sum, n) => sum + n, 0)
  }

  private materializeDeferred(): void {
    const keys = Object.keys(this.state.deferredDemand).sort()
    for (const key of keys) {
      if (this.activeCount() >= this.activeCap) return
      const remaining = this.state.deferredDemand[key]
      if (!remaining) continue
      const [originId, destinationId] = key.split('>')
      const bothExist =
        this.state.stops.some(s => s.id === originId) &&
        this.state.stops.some(s => s.id === destinationId)
      if (!bothExist) {
        delete this.state.deferredDemand[key]
        continue
      }
      if (this.waitingCountAt(originId) >= MAX_STOP_QUEUE) continue
      this.createPassenger(originId, destinationId)
      if (remaining === 1) delete this.state.deferredDemand[key]
      else this.state.deferredDemand[key] = remaining - 1
    }
  }

  private advanceBus(bus: Bus, route: Route, gameDelta: number, arrived: Bus[]): void {
    if (bus.atStopTime !== undefined) {
      bus.atStopTime += gameDelta
      if (bus.atStopTime < DWELL_TIME) return
      bus.atStopTime = undefined
    }

    let direction = bus.direction ?? 1
    let nextIndex = bus.currentStopIndex + direction
    if (nextIndex < 0 || nextIndex >= route.stops.length) {
      direction = direction === 1 ? -1 : 1
      bus.direction = direction
      nextIndex = bus.currentStopIndex + direction
    }

    const nextStop = route.stops[nextIndex]
    if (!nextStop) return

    const dx = nextStop.position.x - bus.position.x
    const dy = nextStop.position.y - bus.position.y
    const distance = Math.hypot(dx, dy)
    const step = BUS_SPEED * gameDelta

    if (step >= distance) {
      bus.position = { ...nextStop.position }
      bus.currentStopIndex = nextIndex
      bus.atStopTime = 0
      arrived.push(bus)
      return
    }
    bus.position.x += (dx / distance) * step
    bus.position.y += (dy / distance) * step
  }

  private handleArrival(bus: Bus): void {
    const route = this.state.routes.find(r => r.id === bus.routeId)
    if (!route) {
      this.state.buses = this.state.buses.filter(b => b.id !== bus.id)
      return
    }

    if (!bus.retiring && (route.pendingStops || route.pendingBusCount !== undefined)) {
      this.reconcileBuses(route)
    }

    const currentStop = route.stops[bus.currentStopIndex]
    if (!currentStop) return

    this.alightPassengers(bus, currentStop)

    if (bus.retiring) {
      this.dropAllPassengers(bus, currentStop)
      if (bus.passengers === 0) this.removeBus(bus, route)
      return
    }

    this.dropUnreachablePassengers(bus, route, currentStop)
    this.boardPassengers(bus, route, currentStop)
  }

  private removeBus(bus: Bus, route: Route): void {
    this.state.buses = this.state.buses.filter(b => b.id !== bus.id)
    const remaining = this.state.buses.filter(b => b.routeId === route.id)
    route.busCount = remaining.length
    if (remaining.length === 0) {
      this.state.routes = this.state.routes.filter(r => r.id !== route.id)
    }
  }

  private alightPassengers(bus: Bus, currentStop: Stop): void {
    this.state.passengers.forEach(p => {
      if (p.status !== 'onboard' || p.busId !== bus.id) return
      const leg = p.legs?.[p.legIndex ?? 0]
      const alightStopId = leg ? leg.alightStopId : p.destinationStopId
      if (alightStopId !== currentStop.id) return
      bus.passengers -= 1
      const nextIndex = (p.legIndex ?? 0) + 1
      if (leg && p.legs && nextIndex < p.legs.length) {
        p.legIndex = nextIndex
        p.status = 'waiting'
        p.originStopId = currentStop.id
        p.waitingTime = 0
        p.hasBoarded = false
        p.busId = undefined
        return
      }
      p.status = 'served'
      p.busId = undefined
      p.hasBoarded = false
      this.state.servedCount += 1
    })
  }

  private dropAllPassengers(bus: Bus, currentStop: Stop): void {
    this.state.passengers.forEach(p => {
      if (p.status !== 'onboard' || p.busId !== bus.id) return
      p.status = 'waiting'
      p.originStopId = currentStop.id
      p.waitingTime = 0
      p.hasBoarded = false
      p.busId = undefined
      p.legs = undefined
      p.legIndex = 0
      bus.passengers -= 1
    })
  }

  private dropUnreachablePassengers(bus: Bus, route: Route, currentStop: Stop): void {
    this.state.passengers.forEach(p => {
      if (p.status !== 'onboard' || p.busId !== bus.id) return
      const leg = p.legs?.[p.legIndex ?? 0]
      const alightStopId = leg ? leg.alightStopId : p.destinationStopId
      if (route.stops.some(s => s.id === alightStopId)) return
      p.status = 'waiting'
      p.originStopId = currentStop.id
      p.waitingTime = 0
      p.hasBoarded = false
      p.busId = undefined
      p.legs = undefined
      p.legIndex = 0
      bus.passengers -= 1
    })
  }

  private boardPassengers(bus: Bus, route: Route, currentStop: Stop): void {
    // A bus that just arrived at a terminus departs the other way, so board
    // passengers heading in the direction it will leave in.
    let direction = bus.direction ?? 1
    const isTerminus =
      (direction === 1 && bus.currentStopIndex === route.stops.length - 1) ||
      (direction === -1 && bus.currentStopIndex === 0)
    if (isTerminus) direction = direction === 1 ? -1 : 1

    const queue = this.state.passengers
      .filter(p => p.status === 'waiting' && p.originStopId === currentStop.id && !p.busId)
      .map(p => {
        const legs = this.findJourney(currentStop.id, p.destinationStopId)
        if (!legs || legs.length === 0) return null
        return { passenger: p, legs, alightStopId: legs[0].alightStopId }
      })
      .filter(
        (entry): entry is { passenger: Passenger; legs: JourneyLeg[]; alightStopId: string } =>
          entry !== null,
      )
      .filter(({ alightStopId }) => {
        const destIndex = route.stops.findIndex(s => s.id === alightStopId)
        if (destIndex < 0) return false
        return direction === 1 ? destIndex > bus.currentStopIndex : destIndex < bus.currentStopIndex
      })
      .sort((a, b) => b.passenger.waitingTime - a.passenger.waitingTime)

    for (const { passenger, legs } of queue) {
      if (bus.passengers >= bus.capacity) break
      passenger.legs = legs
      passenger.legIndex = 0
      passenger.status = 'onboard'
      passenger.busId = bus.id
      passenger.hasBoarded = true
      this.state.boardedCount += 1
      this.state.boardedWaitSum += passenger.waitingTime
      bus.passengers += 1
    }
  }

  start(): void {
    this.state.isRunning = true
  }

  pause(): void {
    this.state.isRunning = false
  }

  setSpeed(speed: number): void {
    this.state.speed = speed
  }

  getStatistics() {
    const waiting = this.state.passengers.filter(p => p.status === 'waiting')
    const onboard = this.state.passengers.filter(p => p.status === 'onboard')
    const avgWait =
      this.state.boardedCount > 0 ? this.state.boardedWaitSum / this.state.boardedCount : null
    const longestWait = waiting.length > 0 ? Math.max(...waiting.map(p => p.waitingTime)) : null
    const serviceRate =
      this.state.totalDemand > 0 ? (this.state.servedCount / this.state.totalDemand) * 100 : null
    const utilization =
      this.state.occupancySamples > 0
        ? (this.state.occupancySum / this.state.occupancySamples) * 100
        : null

    return {
      totalPassengers: this.state.servedCount,
      totalDemand: this.state.totalDemand,
      waitingPassengers: waiting.length,
      onboardPassengers: onboard.length,
      deferredDemand: this.deferredTotal(),
      averageWaitingTime: avgWait,
      longestWait,
      serviceRate,
      busUtilization: utilization,
      totalBuses: this.state.buses.filter(b => !b.retiring).length,
      totalRoutes: this.state.routes.length,
      speed: this.state.speed,
      isRunning: this.state.isRunning,
      time: this.state.time,
    }
  }
}
