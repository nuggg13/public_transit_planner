import { describe, it, expect, beforeEach } from 'vitest'
import { Simulation } from './simulation'
import type { StopShape } from './shapes'
import { ZONE_SHAPES } from './shapes'
import type { Stop } from './types'
import { ZoneType } from './types'

function createSimulation(): Simulation {
  return new Simulation({
    worldSize: { x: 1200, y: 800 },
    stopDistance: 100,
    defaultBusCapacity: 20,
  })
}

describe('Simulation', () => {
  let sim: Simulation

  beforeEach(() => {
    sim = new Simulation({
      worldSize: { x: 1200, y: 800 },
      stopDistance: 100,
      defaultBusCapacity: 20,
    })
  })

  it('starts with empty state', () => {
    const state = sim.getState()
    expect(state.stops).toHaveLength(0)
    expect(state.routes).toHaveLength(0)
    expect(state.buses).toHaveLength(0)
    expect(state.passengers).toHaveLength(0)
    expect(state.isRunning).toBe(false)
    expect(state.speed).toBe(1)
    expect(state.time).toBe(0)
  })

  it('addStop adds a stop to state', () => {
    const stop: Stop = {
      id: 's1',
      position: { x: 100, y: 100 },
      zone: ZoneType.RESIDENTIAL,
      name: 'Stop 1',
    }

    sim.addStop(stop)

    const state = sim.getState()
    expect(state.stops).toHaveLength(1)
    expect(state.stops[0]).toEqual(stop)
  })

  it('createStopAt creates a stop at given coordinates', () => {
    const sim = createSimulation()
    const result = sim.createStopAt(100, 100)
    if (typeof result === 'string') throw new Error(result)
    const stop = result
    expect(stop.position.x).toBe(100)
    expect(stop.position.y).toBe(100)
    expect(stop.zone).toBe(ZoneType.RESIDENTIAL)
    expect(stop.name).toBe('Halte 1')
    expect(sim.getState().stops).toHaveLength(1)
    expect(sim.getState().stops[0]).toEqual(stop)
  })

  it('createStopAt rejects when too close to existing stop', () => {
    const sim = createSimulation()
    sim.addStop({ id: 's1', position: { x: 100, y: 100 }, zone: ZoneType.RESIDENTIAL, name: 'Halte 1' })
    const result = sim.createStopAt(150, 100)
    if (typeof result !== 'string') throw new Error('expected rejection')
    expect(result).toContain('Terlalu dekat')
    expect(sim.getState().stops).toHaveLength(1)
  })

  it('createRoute creates a route and buses when busCount > 0', () => {
    const stop1: Stop = { id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 's1' }
    const stop2: Stop = { id: 's2', position: { x: 100, y: 0 }, zone: ZoneType.COMMERCIAL, name: 's2' }
    sim.addStop(stop1)
    sim.addStop(stop2)

    const result = sim.createRoute(['s1', 's2'], '#ff0000')
    expect(typeof result).not.toBe('string')
    if (typeof result === 'string') throw new Error('Route creation failed')

    const route = result
    expect(route.id).toMatch(/^r\d+$/)
    expect(route.name).toBe('Rute 1')
    expect(route.stops).toHaveLength(2)
    expect(route.busCount).toBe(1) // createRoute spawns one bus

    // Now update the route to have 2 buses
    const err = sim.updateRoute(route.id, { busCount: 2 })
    expect(err).toBeNull()

    const state = sim.getState()
    expect(state.routes).toHaveLength(1)
    expect(state.buses).toHaveLength(2) // two buses created
    state.buses.forEach(bus => {
      expect(bus.routeId).toBe(route.id)
      expect(bus.capacity).toBe(20)
    })
  })

  it('start and pause control isRunning', () => {
    sim.start()
    expect(sim.getState().isRunning).toBe(true)

    sim.pause()
    expect(sim.getState().isRunning).toBe(false)
  })

  it('setSpeed changes simulation speed', () => {
    sim.setSpeed(4)
    expect(sim.getState().speed).toBe(4)
  })

  it('update advances time when running', () => {
    sim.start()
    sim.update(1) // single step is clamped to MAX_STEP (0.25 game minutes)
    expect(sim.getState().time).toBeCloseTo(0.25)

    sim.setSpeed(2)
    sim.update(1) // clamped step 0.25 × speed 2 = 0.5 game minutes
    expect(sim.getState().time).toBeCloseTo(0.75)

    // Frame-rate independent: many small steps accumulate the same total
    const steady = new Simulation({
      worldSize: { x: 1200, y: 800 },
      stopDistance: 100,
      defaultBusCapacity: 20,
    })
    steady.start()
    for (let i = 0; i < 60; i++) steady.update(1 / 60)
    expect(steady.getState().time).toBeCloseTo(1)
  })

  it('getStatistics returns correct counts', () => {
    const stats = sim.getStatistics()
    expect(stats.totalPassengers).toBe(0)
    expect(stats.waitingPassengers).toBe(0)
    expect(stats.onboardPassengers).toBe(0)
    expect(stats.deferredDemand).toBe(0)
    expect(stats.totalBuses).toBe(0)
    expect(stats.totalRoutes).toBe(0)
    expect(stats.averageWaitingTime).toBeNull()
    expect(stats.longestWait).toBeNull()
    expect(stats.serviceRate).toBeNull()
    expect(stats.busUtilization).toBeNull()
  })

  it('deleteRoute removes a bus-less route immediately', () => {
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 's1' })
    sim.addStop({ id: 's2', position: { x: 200, y: 0 }, zone: ZoneType.COMMERCIAL, name: 's2' })
    const res = sim.createRoute(['s1', 's2'], '#00ff00')
    if (typeof res === 'string') throw new Error('Route creation failed')

    sim.getState().buses = []
    sim.deleteRoute(res.id)

    expect(sim.getState().routes).toHaveLength(0)
    expect(sim.getState().stops).toHaveLength(2)
  })

  it('deleteRoute retires its buses and the route disappears once they drain', () => {
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 's1' })
    sim.addStop({ id: 's2', position: { x: 200, y: 0 }, zone: ZoneType.COMMERCIAL, name: 's2' })
    const res = sim.createRoute(['s1', 's2'], '#00ff00')
    if (typeof res === 'string') throw new Error('Route creation failed')

    sim.deleteRoute(res.id)

    const state = sim.getState()
    expect(state.routes).toHaveLength(1)
    expect(state.buses).toHaveLength(1)
    expect(state.buses.every(b => b.retiring)).toBe(true)

    sim.start()
    for (let i = 0; i < 10000; i++) sim.update(1 / 60)
    expect(state.routes).toHaveLength(0)
    expect(state.buses).toHaveLength(0)
  })

  it('validateRoute rejects invalid stop lists', () => {
    const s1: Stop = { id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 's1' }
    sim.addStop(s1)

    // Too few stops
    expect(sim.validateRoute(['s1'])).toBe('Rute butuh minimal 2 halte berbeda.')
    // Duplicate stops
    expect(sim.validateRoute(['s1', 's1'])).toBe('Halte tidak boleh berulang dalam satu rute.')
    // Non-existent stop
    expect(sim.validateRoute(['s1', 's99'])).toBe('Ada halte yang tidak dikenal.')
    // Valid route
    expect(sim.validateRoute(['s1', 's1'])).not.toBeNull() // actually duplicate, so error
    // We need two distinct stops
    const s2: Stop = { id: 's2', position: { x: 100, y: 0 }, zone: ZoneType.COMMERCIAL, name: 's2' }
    sim.addStop(s2)
    expect(sim.validateRoute(['s1', 's2'])).toBeNull()
  })

  it('canPlaceStop respects stopDistance', () => {
    const s1: Stop = { id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 's1' }
    sim.addStop(s1)

    // Too close
    expect(sim.canPlaceStop({ x: 10, y: 0 })).toBe(false) // within 100
    // Far enough
    expect(sim.canPlaceStop({ x: 200, y: 0 })).toBe(true)
  })

  it('deferred demand works when active cap is reached', () => {
    // Set a very low active cap for testing
    sim = new Simulation({
      worldSize: { x: 1200, y: 800 },
      stopDistance: 100,
      defaultBusCapacity: 20,
      maxActivePassengers: 2, // very low
    })

    // Add two stops close together to generate demand quickly
    const s1: Stop = { id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 's1' }
    const s2: Stop = { id: 's2', position: { x: 50, y: 0 }, zone: ZoneType.COMMERCIAL, name: 's2' } // close to trigger high demand rate? Actually zone multiplier doesn't affect the chance calculation directly, but we can just wait.
    sim.addStop(s1)
    sim.addStop(s2)

    // Create a route so that passengers can be spawned (otherwise spawnDemand returns early if <2 stops)
    sim.createRoute(['s1', 's2'], '#ff0000')

    // Run simulation for a while to generate passengers
    sim.start()
    // We'll run enough time to exceed the active cap
    // The demand rate is BASE_DEMAND_RATE * ZONE_MULTIPLIER * gameDelta
    // Let's just run for a large deltaTime and see if we get deferred demand.
    // Note: the update loop has a MAX_STEP of 0.25, so we need multiple steps.
    // We'll call update many times with a small deltaTime to simulate time passing.
    // But note: the random number generator is seeded, so we can't rely on it for deterministic results in this test.
    // Instead, we can test the mechanism by directly setting the state? Not ideal.

    // Given the complexity, we'll skip this test for now and rely on the fact that the mechanism is used in the game.
    // We'll just test that the deferredDemand map exists and can be updated.
    const state = sim.getState()
    expect(state.deferredDemand).toEqual({})
    // We can't easily trigger deferred demand without random, so we'll test the materializeDeferred function indirectly by checking that activeCount and deferredTotal are used.
    // We'll do a different test: set the deferredDemand manually and see if it gets materialized when cap is increased.
    // But note: deferredDemand is private.

    for (let i = 0; i < 2400; i++) sim.update(0.25)

    const stats = sim.getStatistics()
    expect(stats.totalDemand).toBeGreaterThan(2)
    expect(stats.waitingPassengers + stats.onboardPassengers).toBeLessThanOrEqual(2)
    expect(stats.deferredDemand).toBeGreaterThan(0)
    expect(stats.deferredDemand).toBe(
      stats.totalDemand - stats.totalPassengers - stats.waitingPassengers - stats.onboardPassengers,
    )
  })
})

describe('bus movement (GDD 6)', () => {
  it('moves at 30 world units per game minute', () => {
    const sim = createSimulation()
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'A' })
    sim.addStop({ id: 's2', position: { x: 600, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'B' })
    const route = sim.createRoute(['s1', 's2'], '#C2412D')
    if (typeof route === 'string') throw new Error('expected route')

    const bus = sim.getState().buses[0]
    bus.position = { x: 0, y: 0 }
    bus.currentStopIndex = 0
    bus.direction = 1
    bus.atStopTime = undefined

    sim.start()
    for (let i = 0; i < 60; i++) sim.update(1 / 60) // 1 game minute
    expect(bus.position.x).toBeCloseTo(30, 0)
  })

  it('reverses direction at both termini', () => {
    const sim = createSimulation()
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'A' })
    sim.addStop({ id: 's2', position: { x: 60, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'B' })
    const route = sim.createRoute(['s1', 's2'], '#C2412D')
    if (typeof route === 'string') throw new Error('expected route')

    const bus = sim.getState().buses[0]
    bus.position = { x: 0, y: 0 }
    bus.currentStopIndex = 0
    bus.direction = 1
    bus.atStopTime = undefined

    sim.start()
    let maxX = 0
    let reversed = false
    for (let i = 0; i < 2000; i++) {
      sim.update(1 / 60)
      maxX = Math.max(maxX, bus.position.x)
      if (bus.position.x < maxX - 5) reversed = true
    }
    expect(maxX).toBeCloseTo(60, 0)
    expect(reversed).toBe(true)
  })

  it('dwells 0.25 game minutes at a served stop', () => {
    const sim = createSimulation()
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'A' })
    sim.addStop({ id: 's2', position: { x: 1000, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'B' })
    const route = sim.createRoute(['s1', 's2'], '#C2412D')
    if (typeof route === 'string') throw new Error('expected route')

    const bus = sim.getState().buses[0]
    bus.position = { x: 0, y: 0 }
    bus.currentStopIndex = 0
    bus.direction = 1
    bus.atStopTime = undefined

    sim.start()
    // Walk until we see arrival at s2 (distance + small buffer for dwell start)
    let sawArrival = false
    for (let i = 0; i < 40 * 60; i++) {
      sim.update(1 / 60)
      if (bus.atStopTime !== undefined) {
        sawArrival = true
        break
      }
    }
    expect(sawArrival).toBe(true)
    const dwellStart = bus.position.x
    for (let i = 0; i < 5; i++) sim.update(1 / 60)
    expect(bus.position.x).toBeCloseTo(dwellStart, 0)
  })

  it('spreads spawned buses at distinct points on the route', () => {
    const sim = createSimulation()
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'A' })
    sim.addStop({ id: 's2', position: { x: 400, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'B' })
    sim.addStop({ id: 's3', position: { x: 800, y: 0 }, zone: ZoneType.ACTIVITY_CENTER, name: 'C' })
    const route = sim.createRoute(['s1', 's2', 's3'], '#C2412D')
    if (typeof route === 'string') throw new Error('expected route')

    sim.updateRoute(route.id, { busCount: 3 })
    const positions = sim.getState().buses.map(b => `${Math.round(b.position.x)}:${b.currentStopIndex}`)
    expect(new Set(positions).size).toBe(3)
  })
})

describe('boarding rules (GDD 8)', () => {
  it('boards only passengers whose destination lies ahead in the travel direction', () => {
    const sim = createSimulation()
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'A' })
    sim.addStop({ id: 's2', position: { x: 200, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'B' })
    sim.addStop({ id: 's3', position: { x: 400, y: 0 }, zone: ZoneType.ACTIVITY_CENTER, name: 'C' })
    const route = sim.createRoute(['s1', 's2', 's3'], '#C2412D')
    if (typeof route === 'string') throw new Error('expected route')

    const bus = sim.getState().buses[0]
    bus.position = { x: 200, y: 0 }
    bus.currentStopIndex = 1
    bus.direction = 1
    bus.atStopTime = undefined

    sim.getState().passengers.push({
      id: 'pFwd',
      originStopId: 's2',
      destinationStopId: 's3',
      waitingTime: 20,
      status: 'waiting',
      hasBoarded: false,
    })
    sim.getState().passengers.push({
      id: 'pBack',
      originStopId: 's2',
      destinationStopId: 's1',
      waitingTime: 30,
      status: 'waiting',
      hasBoarded: false,
    })

    sim.start()
    // Force an arrival at s2 by walking the bus back and forth once.
    bus.currentStopIndex = 0
    bus.position = { x: 0, y: 0 }
    for (let i = 0; i < 400; i++) sim.update(1 / 60)

    const fwd = sim.getState().passengers.find(p => p.id === 'pFwd')!
    const back = sim.getState().passengers.find(p => p.id === 'pBack')!
    expect(fwd.status).toBe('onboard')
    expect(back.status).toBe('waiting')
  })

  it('never exceeds bus capacity', () => {
    const sim = createSimulation()
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'A' })
    sim.addStop({ id: 's2', position: { x: 300, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'B' })
    const route = sim.createRoute(['s1', 's2'], '#C2412D')
    if (typeof route === 'string') throw new Error('expected route')

    const bus = sim.getState().buses[0]
    bus.capacity = 3
    bus.position = { x: 0.4, y: 0 }
    bus.currentStopIndex = 1
    bus.direction = -1
    bus.atStopTime = undefined

    for (let i = 0; i < 10; i++) {
      sim.getState().passengers.push({
        id: `p${i}`,
        originStopId: 's1',
        destinationStopId: 's2',
        waitingTime: 100 - i,
        status: 'waiting',
        hasBoarded: false,
      })
    }

    sim.start()
    for (let i = 0; i < 5; i++) sim.update(1 / 60)
    expect(bus.passengers).toBe(3)
  })

  it('boards longest-waiting passengers first', () => {
    const sim = createSimulation()
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'A' })
    sim.addStop({ id: 's2', position: { x: 300, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'B' })
    const route = sim.createRoute(['s1', 's2'], '#C2412D')
    if (typeof route === 'string') throw new Error('expected route')

    const bus = sim.getState().buses[0]
    bus.capacity = 1
    bus.position = { x: 0.4, y: 0 }
    bus.currentStopIndex = 1
    bus.direction = -1
    bus.atStopTime = undefined

    sim.getState().passengers.push(
      {
        id: 'short',
        originStopId: 's1',
        destinationStopId: 's2',
        waitingTime: 1,
        status: 'waiting',
        hasBoarded: false,
      },
      {
        id: 'long',
        originStopId: 's1',
        destinationStopId: 's2',
        waitingTime: 90,
        status: 'waiting',
        hasBoarded: false,
      },
    )

    sim.start()
    for (let i = 0; i < 5; i++) sim.update(1 / 60)

    const long = sim.getState().passengers.find(p => p.id === 'long')
    const short = sim.getState().passengers.find(p => p.id === 'short')
    expect(long?.status).toBe('onboard')
    expect(short?.status).toBe('waiting')
  })
})

describe('passenger lifecycle', () => {
  it('counts a passenger served exactly once across repeated dwell visits', () => {
    const sim = createSimulation()
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'A' })
    sim.addStop({ id: 's2', position: { x: 200, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'B' })
    const route = sim.createRoute(['s1', 's2'], '#C2412D')
    if (typeof route === 'string') throw new Error('expected route')

    const bus = sim.getState().buses[0]
    bus.position = { x: 0.4, y: 0 }
    bus.currentStopIndex = 1
    bus.direction = -1
    bus.atStopTime = undefined

    sim.getState().passengers.push({
      id: 'manualServed',
      originStopId: 's1',
      destinationStopId: 's2',
      waitingTime: 0,
      status: 'waiting',
      hasBoarded: false,
    })

    sim.start()
    for (let i = 0; i < 3000; i++) sim.update(1 / 60)

    const served = sim.getState().passengers.filter(p => p.id === 'manualServed')
    expect(served.length).toBe(1)
    expect(served[0].status).toBe('served')
    expect(sim.getState().servedCount).toBeGreaterThanOrEqual(1)
  })
})

describe('statistics semantics (GDD 9)', () => {
  it('average waiting time counts only passengers who boarded', () => {
    const sim = createSimulation()
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'A' })
    sim.addStop({ id: 's2', position: { x: 300, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'B' })
    sim.createRoute(['s1', 's2'], '#C2412D')

    const bus = sim.getState().buses[0]
    bus.capacity = 1
    bus.currentStopIndex = 1 // index of s2
    bus.direction = -1 // heading towards s1
    bus.position = { x: 0.4, y: 0 } // 0.4 units from s1 (at x=0) towards s2 (at x=300)
    bus.atStopTime = undefined

    sim.getState().passengers.push(
      {
        id: 'boarded',
        originStopId: 's1',
        destinationStopId: 's2',
        waitingTime: 999,
        status: 'waiting',
        hasBoarded: false,
      },
      {
        id: 'leftBehind',
        originStopId: 's1',
        destinationStopId: 's2',
        waitingTime: 12,
        status: 'waiting',
        hasBoarded: false,
      },
    )

    sim.start()
    for (let i = 0; i < 2; i++) sim.update(1 / 60)

    const stats = sim.getStatistics()
    expect(stats.averageWaitingTime).toBeCloseTo(999, 0)
    expect(stats.longestWait).toBeCloseTo(12, 0)
  })

  it('tracks bus utilization once buses operate', () => {
    const sim = createSimulation()
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'A' })
    sim.addStop({ id: 's2', position: { x: 300, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'B' })
    sim.createRoute(['s1', 's2'], '#C2412D')
    sim.start()
    for (let i = 0; i < 60; i++) sim.update(1 / 60)

    expect(sim.getStatistics().busUtilization).toBe(0)
  })
})

describe('stop growth (GDD 4.3)', () => {
  function growthTick(sim: Simulation): void {
    sim.start()
    const state = sim.getState()
    state.time = state.nextStopAt
    sim.update(0)
  }

  it('starts with empty stops and growth enabled', () => {
    const sim = createSimulation()
    const state = sim.getState()
    expect(state.stops).toHaveLength(0)
    expect(state.growthEnabled).toBe(true)
    expect(state.stopsSpawned).toBe(0)
    expect(state.nextStopAt).toBe(10)
    expect(state.stopsPlaced).toEqual({ residential: 0, commercial: 0, activity_center: 0 })
  })

  it('spawns no stop in the first 10 minutes', () => {
    const sim = createSimulation()
    sim.start()
    for (let i = 0; i < 9 * 60; i++) sim.update(1 / 60)
    expect(sim.getState().stops).toHaveLength(0)
  })

  it('spawns the first stop at minute 10 with a zone-matching shape', () => {
    const sim = createSimulation()
    sim.start()
    for (let i = 0; i < 11 * 60; i++) sim.update(1 / 60)
    const state = sim.getState()
    expect(state.stops).toHaveLength(1)
    const stop = state.stops[0]
    expect(ZONE_SHAPES[stop.zone]).toContain(stop.shape as StopShape)
    expect(stop.name).toMatch(/^Halte \d+$/)
    expect(state.nextStopAt).toBe(30)
  })

  it('triples the interval after every stop', () => {
    const sim = createSimulation()
    const state = sim.getState()
    const expected = [30, 90, 270, 810]
    expected.forEach(next => {
      growthTick(sim)
      expect(state.nextStopAt).toBe(next)
    })
    expect(state.stops).toHaveLength(4)
    expect(state.stopsSpawned).toBe(4)
  })

  it('places 15 stops, all shapes valid and spaced apart, then stops growing', () => {
    const sim = createSimulation()
    for (let i = 0; i < 15; i++) growthTick(sim)

    const state = sim.getState()
    expect(state.stops).toHaveLength(15)
    expect(state.stopsSpawned).toBe(15)
    expect(state.growthEnabled).toBe(false)

    state.stops.forEach(stop => {
      expect(ZONE_SHAPES[stop.zone]).toContain(stop.shape as StopShape)
    })
    for (let i = 0; i < state.stops.length; i++) {
      for (let j = i + 1; j < state.stops.length; j++) {
        const a = state.stops[i].position
        const b = state.stops[j].position
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(100)
      }
    }

    const nextStopAt = state.nextStopAt
    growthTick(sim)
    expect(state.stops).toHaveLength(15)
    expect(state.nextStopAt).toBe(nextStopAt)
  })

  it('assigns zone shapes in order as stops are placed', () => {
    const sim = createSimulation()
    for (let i = 0; i < 15; i++) growthTick(sim)
    const state = sim.getState()
    const zones = ['residential', 'commercial', 'activity_center'] as const
    zones.forEach(zone => {
      const stopsInZone = state.stops.filter(s => s.zone === zone)
      const shapes = ZONE_SHAPES[zone]
      const expectedShapes = stopsInZone.map((_, idx) => shapes[idx % shapes.length])
      expect(stopsInZone.map(s => s.shape)).toEqual(expectedShapes)
    })
  })
})

describe('passenger transit (GDD 7.5)', () => {
  it('plans a direct leg when one route serves origin and destination', () => {
    const sim = createSimulation()
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'Persegi' })
    sim.addStop({ id: 's2', position: { x: 300, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'Segitiga' })
    sim.addStop({ id: 's3', position: { x: 600, y: 0 }, zone: ZoneType.ACTIVITY_CENTER, name: 'Belah Ketupat' })
    const route = sim.createRoute(['s1', 's2', 's3'], '#C2412D')
    if (typeof route === 'string') throw new Error('expected route')

    const legs = sim.previewJourney('s1', 's3')
    expect(legs).not.toBeNull()
    expect(legs).toHaveLength(1)
    expect(legs?.[0]).toEqual({ routeId: route.id, alightStopId: 's3' })
  })

  it('plans one transfer at the shared stop between two routes', () => {
    const sim = createSimulation()
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'Persegi' })
    sim.addStop({ id: 's2', position: { x: 300, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'Segitiga' })
    sim.addStop({ id: 's3', position: { x: 600, y: 0 }, zone: ZoneType.ACTIVITY_CENTER, name: 'Belah Ketupat' })
    const r1 = sim.createRoute(['s1', 's2'], '#C2412D')
    if (typeof r1 === 'string') throw new Error('expected route')
    const r2 = sim.createRoute(['s2', 's3'], '#2F6F7A')
    if (typeof r2 === 'string') throw new Error('expected route')

    const legs = sim.previewJourney('s1', 's3')
    expect(legs).toEqual([
      { routeId: r1.id, alightStopId: 's2' },
      { routeId: r2.id, alightStopId: 's3' },
    ])
  })

  it('plans multi-transfer journeys across three routes', () => {
    const sim = createSimulation()
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'A' })
    sim.addStop({ id: 's2', position: { x: 300, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'B' })
    sim.addStop({ id: 's3', position: { x: 600, y: 0 }, zone: ZoneType.ACTIVITY_CENTER, name: 'C' })
    sim.addStop({ id: 's4', position: { x: 900, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'D' })
    const r1 = sim.createRoute(['s1', 's2'], '#C2412D')
    if (typeof r1 === 'string') throw new Error('expected route')
    const r2 = sim.createRoute(['s2', 's3'], '#2F6F7A')
    if (typeof r2 === 'string') throw new Error('expected route')
    const r3 = sim.createRoute(['s3', 's4'], '#E0A32E')
    if (typeof r3 === 'string') throw new Error('expected route')

    const legs = sim.previewJourney('s1', 's4')
    expect(legs).toEqual([
      { routeId: r1.id, alightStopId: 's2' },
      { routeId: r2.id, alightStopId: 's3' },
      { routeId: r3.id, alightStopId: 's4' },
    ])
  })

  it('prefers the transfer stop with the shorter total distance', () => {
    const sim = createSimulation()
    sim.addStop({ id: 'a', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'A' })
    sim.addStop({ id: 't1', position: { x: 300, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'T1' })
    sim.addStop({ id: 't2', position: { x: 300, y: 400 }, zone: ZoneType.COMMERCIAL, name: 'T2' })
    sim.addStop({ id: 'd', position: { x: 600, y: 0 }, zone: ZoneType.ACTIVITY_CENTER, name: 'D' })
    const rA = sim.createRoute(['a', 't1', 't2'], '#C2412D')
    if (typeof rA === 'string') throw new Error('expected route')
    sim.createRoute(['t1', 'd'], '#2F6F7A')
    sim.createRoute(['t2', 'd'], '#E0A32E')

    const legs = sim.previewJourney('a', 'd')
    expect(legs?.[0]).toEqual({ routeId: rA.id, alightStopId: 't1' })
  })

  it('returns null when no route path connects origin and destination', () => {
    const sim = createSimulation()
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'A' })
    sim.addStop({ id: 's2', position: { x: 300, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'B' })
    sim.addStop({ id: 's3', position: { x: 600, y: 0 }, zone: ZoneType.ACTIVITY_CENTER, name: 'C' })
    sim.addStop({ id: 's4', position: { x: 900, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'D' })
    sim.createRoute(['s1', 's2'], '#C2412D')
    sim.createRoute(['s3', 's4'], '#2F6F7A')

    expect(sim.previewJourney('s1', 's4')).toBeNull()
  })

  it('serves a transferring passenger end to end', () => {
    const sim = createSimulation()
    sim.getState().growthEnabled = false
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'Persegi' })
    sim.addStop({ id: 's2', position: { x: 300, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'Segitiga' })
    sim.addStop({ id: 's3', position: { x: 600, y: 0 }, zone: ZoneType.ACTIVITY_CENTER, name: 'Belah Ketupat' })
    sim.createRoute(['s1', 's2'], '#C2412D')
    sim.createRoute(['s2', 's3'], '#2F6F7A')

    sim.getState().passengers.push({
      id: 'tx',
      originStopId: 's1',
      destinationStopId: 's3',
      waitingTime: 0,
      status: 'waiting',
      hasBoarded: false,
    })

    sim.start()
    let sawTransfer = false
    for (let i = 0; i < 10000; i++) {
      sim.update(1 / 60)
      const p = sim.getState().passengers.find(x => x.id === 'tx')
      if (p?.status === 'waiting' && p.originStopId === 's2') sawTransfer = true
      if (p?.status === 'served') break
    }

    const p = sim.getState().passengers.find(x => x.id === 'tx')
    expect(sawTransfer).toBe(true)
    expect(p?.status).toBe('served')
    expect(sim.getState().servedCount).toBeGreaterThanOrEqual(1)
  })

  it('caps waiting passengers at 10 per stop', () => {
    const sim = createSimulation()
    sim.getState().growthEnabled = false
    sim.addStop({ id: 's1', position: { x: 0, y: 0 }, zone: ZoneType.RESIDENTIAL, name: 'A' })
    sim.addStop({ id: 's2', position: { x: 300, y: 0 }, zone: ZoneType.COMMERCIAL, name: 'B' })

    for (let i = 0; i < 12; i++) {
      sim.getState().passengers.push({
        id: `q${i}`,
        originStopId: 's1',
        destinationStopId: 's2',
        waitingTime: i,
        status: 'waiting',
        hasBoarded: false,
      })
    }
    sim.getState().deferredDemand['s1>s2'] = 1

    sim.start()
    for (let i = 0; i < 240; i++) sim.update(1 / 60)

    const state = sim.getState()
    const waitingAtS1 = state.passengers.filter(p => p.originStopId === 's1' && p.status === 'waiting')
    expect(waitingAtS1).toHaveLength(12)
    expect(state.deferredDemand['s1>s2']).toBe(1)

    state.passengers.slice(0, 4).forEach(p => (p.status = 'served'))
    for (let i = 0; i < 10; i++) sim.update(1 / 60)

    const after = sim.getState()
    const queue = after.passengers.filter(p => p.originStopId === 's1' && p.status === 'waiting')
    expect(queue.length).toBeLessThanOrEqual(10)
    expect(after.deferredDemand['s1>s2'] ?? 0).toBe(0)
  })
})