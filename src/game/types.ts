import type { Vector2 } from '../types/index'
import type { StopShape } from './shapes'

export type ZoneType = 'residential' | 'commercial' | 'activity_center'

export const ZoneType = {
  RESIDENTIAL: 'residential' as ZoneType,
  COMMERCIAL: 'commercial' as ZoneType,
  ACTIVITY_CENTER: 'activity_center' as ZoneType,
}

export const ZONE_MULTIPLIER: Record<ZoneType, number> = {
  residential: 0.8,
  commercial: 1.0,
  activity_center: 1.5,
}

export const ZONE_LABEL: Record<ZoneType, string> = {
  residential: 'Permukiman',
  commercial: 'Komersial',
  activity_center: 'Pusat aktivitas',
}

export const ROUTE_COLORS = ['#dc2626', '#2563eb', '#f59e0b', '#059669', '#7c3aed']

export const MAX_BUSES_PER_ROUTE = 10

export const MAX_STOP_QUEUE = 10

export interface Stop {
  id: string
  position: Vector2
  zone: ZoneType
  name: string
  shape?: StopShape
}

export interface Route {
  id: string
  name: string
  stops: Stop[]
  busCount: number
  color: string
  pendingStops?: Stop[]
  pendingBusCount?: number
}

export interface Bus {
  id: string
  routeId: string
  position: Vector2
  currentStopIndex: number
  passengers: number
  capacity: number
  atStopTime?: number
  direction?: 1 | -1
  retiring?: boolean
}

export interface JourneyLeg {
  routeId: string
  alightStopId: string
}

export interface Passenger {
  id: string
  originStopId: string
  destinationStopId: string
  legs?: JourneyLeg[]
  legIndex?: number
  waitingTime: number
  status: 'waiting' | 'onboard' | 'served'
  hasBoarded: boolean
  busId?: string
}

export interface IdCounters {
  stop: number
  route: number
  bus: number
  passenger: number
}

export interface SimulationState {
  stops: Stop[]
  routes: Route[]
  buses: Bus[]
  passengers: Passenger[]
  deferredDemand: Record<string, number>
  servedCount: number
  totalDemand: number
  boardedCount: number
  boardedWaitSum: number
  occupancySum: number
  occupancySamples: number
  isRunning: boolean
  speed: number
  time: number
  seed: number
  growthEnabled: boolean
  nextStopAt: number
  stopsPlaced: Record<ZoneType, number>
  stopsSpawned: number
  nextIds: IdCounters
}

export interface GameConfig {
  worldSize: Vector2
  stopDistance: number
  defaultBusCapacity: number
  seed?: number
  maxActivePassengers?: number
}

export type { Vector2 } from '../types/index'