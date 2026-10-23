import { Simulation } from './game/simulation'
import type { Stop, Route } from './game/types'
import { ZONE_LABEL } from './game/types'
import { SHAPE_LABEL } from './game/shapes'
import { GameCanvas } from './ui/canvas'
import { InfoPanel } from './ui/panels'
import { WORLD_SIZE } from './game/map'

type ToolMode = 'select' | 'createRoute'

const STOP_PICK_RADIUS = 24

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const gameCanvas = new GameCanvas(canvas)
const panel = new InfoPanel('info-panel')
const toast = document.getElementById('toast')!

const hud = {
  served: document.getElementById('hud-served')!,
  waiting: document.getElementById('hud-waiting')!,
  avgWait: document.getElementById('hud-avgwait')!,
  rate: document.getElementById('hud-rate')!,
}

const simButtons = {
  toggle: document.getElementById('sim-toggle-btn')!,
  toggleLabel: document.getElementById('sim-toggle-label')!,
  speed1: document.getElementById('speed-1-btn')!,
  speed2: document.getElementById('speed-2-btn')!,
  speed4: document.getElementById('speed-4-btn')!,
}

const simulation = new Simulation({
  worldSize: WORLD_SIZE,
  stopDistance: 100,
  defaultBusCapacity: 20,
  seed: Math.floor(Math.random() * 0xffffffff),
})

let tool: ToolMode = 'select'
let appendRouteId: string | null = null
let selectedStopId: string | null = null
let selectedRouteId: string | null = null
let draftStopIds: string[] = []
let hoverStopId: string | null = null
let pointer: { x: number; y: number } | null = null

let toastTimer = 0
function notify(message: string): void {
  toast.textContent = message
  toast.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3200)
}

function stopAt(x: number, y: number): Stop | undefined {
  return simulation
    .getState()
    .stops.find(stop => Math.hypot(stop.position.x - x, stop.position.y - y) <= STOP_PICK_RADIUS)
}

function routeById(id: string | null): Route | undefined {
  if (!id) return undefined
  return simulation.getState().routes.find(route => route.id === id)
}

function nextRouteColor(): string {
  const used = new Set(simulation.getState().routes.map(route => route.color))
  const free = ['#dc2626', '#2563eb', '#f59e0b', '#059669', '#7c3aed'].find(color => !used.has(color))
  return free ?? '#7c3aed'
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.textContent = label
  el.className = `panel-btn ${className}`.trim()
  el.addEventListener('click', onClick)
  return el
}

function setTool(next: ToolMode): void {
  tool = next
  appendRouteId = null
  draftStopIds = []
  render()
}

function appendStopToRoute(routeId: string, stopId: string): void {
  const route = routeById(routeId)
  if (!route) return
  if (route.stops.some(stop => stop.id === stopId)) {
    notify(`${route.name} sudah melayani halte itu.`)
    return
  }
  const error = simulation.updateRoute(routeId, { stops: [...route.stops.map(stop => stop.id), stopId] })
  if (error) notify(error)
}

function updateHud(): void {
  const stats = simulation.getStatistics()
  hud.served.textContent = String(stats.totalPassengers)
  hud.waiting.textContent = String(stats.waitingPassengers)
  hud.avgWait.textContent =
    stats.averageWaitingTime === null ? '—' : `${stats.averageWaitingTime.toFixed(1)} mnt`
  hud.rate.textContent = stats.serviceRate === null ? '—' : `${stats.serviceRate.toFixed(0)}%`
}

render()

function render(): void {
  const state = simulation.getState()
  const stats = simulation.getStatistics()
  const selectedRoute = routeById(selectedRouteId)
  const selectedStop = state.stops.find(stop => stop.id === selectedStopId)

  updateHud()

  simButtons.toggle.dataset.running = String(stats.isRunning)
  simButtons.toggleLabel.textContent = stats.isRunning ? 'Jeda' : 'Jalankan'
  simButtons.speed1.setAttribute('aria-pressed', String(stats.speed === 1))
  simButtons.speed2.setAttribute('aria-pressed', String(stats.speed === 2))
  simButtons.speed4.setAttribute('aria-pressed', String(stats.speed === 4))

  panel.clear()

  const service = panel.createSection('Kondisi layanan')
  service.appendChild(panel.createStatRow('Terlayani', String(stats.totalPassengers)))
  service.appendChild(panel.createStatRow('Permintaan', String(stats.totalDemand)))
  service.appendChild(panel.createStatRow('Menunggu', String(stats.waitingPassengers)))
  service.appendChild(panel.createStatRow('Di bus', String(stats.onboardPassengers)))
  service.appendChild(panel.createStatRow('Rata-rata tunggu', stats.averageWaitingTime === null ? '—' : `${stats.averageWaitingTime.toFixed(1)} mnt`))
  service.appendChild(panel.createStatRow('Tunggu terlama', stats.longestWait === null ? '—' : `${stats.longestWait.toFixed(1)} mnt`))
  service.appendChild(panel.createStatRow('Tingkat layanan', stats.serviceRate === null ? '—' : `${stats.serviceRate.toFixed(0)}%`))
  service.appendChild(panel.createStatRow('Utilisasi bus', stats.busUtilization === null ? '—' : `${stats.busUtilization.toFixed(0)}%`))
  service.appendChild(panel.createStatRow('Tertunda', String(stats.deferredDemand)))
  service.appendChild(panel.createStatRow('Waktu', `${Math.floor(stats.time)} mnt`))
  panel.appendChild(service)

  const tools = panel.createSection('Alat peta')
  tools.appendChild(
    panel.createButtonRow([
      button('Pilih', tool === 'select' ? 'is-active' : '', () => setTool('select')),
      button('Rute', tool === 'createRoute' ? 'is-active' : '', () => setTool('createRoute')),
    ]),
  )
  tools.appendChild(
    panel.createNote(
      tool === 'select'
        ? appendRouteId
          ? `Menambah halte ke ${routeById(appendRouteId)?.name}. Klik halte yang sudah ada di peta. Klik "Tambah halte" lagi untuk selesai.`
          : 'Klik halte atau garis rute untuk melihat detailnya. Halte baru muncul otomatis saat simulasi berjalan.'
          : 'Klik halte yang sudah ada secara berurutan untuk menyusun rute, lalu buat.',
    ),
  )
  panel.appendChild(tools)

  if (tool === 'createRoute') {
    const draft = panel.createSection(`Rute baru (${draftStopIds.length} halte)`)
    if (draftStopIds.length > 0) {
      draft.appendChild(
        panel.createOrderList(
          draftStopIds.map(id => ({
            id,
            name: state.stops.find(s => s.id === id)?.name ?? id,
          })),
          (id, delta) => {
            const index = draftStopIds.indexOf(id)
            const target = index + delta
            if (index < 0 || target < 0 || target >= draftStopIds.length) return
            draftStopIds.splice(index, 1)
            draftStopIds.splice(target, 0, id)
            render()
          },
          id => {
            draftStopIds = draftStopIds.filter(value => value !== id)
            render()
          },
          (fromIndex, toIndex) => {
            const [moved] = draftStopIds.splice(fromIndex, 1)
            draftStopIds.splice(toIndex, 0, moved)
            render()
          },
        ),
      )
    }
    if (draftStopIds.length >= 2) {
      draft.appendChild(
        button('Buat rute', '', () => {
          const result = simulation.createRoute(draftStopIds, nextRouteColor())
          if (typeof result === 'string') {
            notify(result)
            return
          }
          selectedRouteId = result.id
          selectedStopId = null
          draftStopIds = []
          setTool('select')
          notify(`Rute ${result.name} dibuat.`)
        }),
      )
    }
    panel.appendChild(draft)
  }

  if (selectedRoute) {
    const routeSection = panel.createSection(`Rute ${selectedRoute.name}`)
    const nameInput = panel.createField(routeSection, `route-name-${selectedRoute.id}`, 'Nama rute', selectedRoute.name)
    nameInput.addEventListener('change', () => {
      const error = simulation.updateRoute(selectedRoute.id, { name: nameInput.value })
      if (error) notify(error)
      render()
    })

    routeSection.appendChild(
      panel.createSwatches(selectedRoute.color, color => {
        const error = simulation.updateRoute(selectedRoute.id, { color })
        if (error) notify(error)
        render()
      }),
    )

    routeSection.appendChild(
      panel.createStepper(selectedRoute.busCount, 1, 10, value => {
        const error = simulation.updateRoute(selectedRoute.id, { busCount: value })
        if (error) notify(error)
        render()
      }),
    )

    routeSection.appendChild(
      panel.createOrderList(
        selectedRoute.stops.map(stop => ({ id: stop.id, name: stop.name })),
        (id, delta) => {
          const stops = [...selectedRoute.stops]
          const index = stops.findIndex(stop => stop.id === id)
          const target = index + delta
          if (index < 0 || target < 0 || target >= stops.length) return
          const [moved] = stops.splice(index, 1)
          stops.splice(target, 0, moved)
          const error = simulation.updateRoute(selectedRoute.id, { stops: stops.map(stop => stop.id) })
          if (error) notify(error)
          render()
        },
        id => {
          const stops = selectedRoute.stops.filter(stop => stop.id !== id)
          const error = simulation.updateRoute(selectedRoute.id, { stops: stops.map(stop => stop.id) })
          if (error) notify(error)
          render()
        },
        (fromIndex, toIndex) => {
          const stops = [...selectedRoute.stops]
          const [moved] = stops.splice(fromIndex, 1)
          stops.splice(toIndex, 0, moved)
          const error = simulation.updateRoute(selectedRoute.id, { stops: stops.map(stop => stop.id) })
          if (error) notify(error)
          render()
        },
      ),
    )

    routeSection.appendChild(
      button('Tambah halte', appendRouteId === selectedRoute.id ? 'is-active' : '', () => {
        const active = appendRouteId === selectedRoute.id
        setTool('select')
        appendRouteId = active ? null : selectedRoute.id
        selectedStopId = null
        render()
      }),
    )

    routeSection.appendChild(
      button('Hapus rute', 'danger', () => {
        if (!confirm(`Hapus ${selectedRoute.name}?`)) return
        simulation.deleteRoute(selectedRoute.id)
        selectedRouteId = null
        appendRouteId = null
        render()
      }),
    )

    const hasPending = selectedRoute.pendingStops !== undefined || selectedRoute.pendingBusCount !== undefined
    const hasRetiringBuses = state.buses.some(b => b.routeId === selectedRoute.id && b.retiring)
    if (hasPending) {
      routeSection.appendChild(panel.createNote('Perubahan berlaku saat bus tiba di halte berikutnya.'))
    }
    if (hasRetiringBuses) {
      routeSection.appendChild(panel.createNote('Bus berlebih sedang ditarik. Berhenti di halte berikutnya.'))
    }

    panel.appendChild(routeSection)
  }

  if (selectedStop) {
    const stopSection = panel.createSection(`Halte ${selectedStop.name}`)
    const serving = state.routes.filter(route => route.stops.some(stop => stop.id === selectedStop.id))
    stopSection.appendChild(panel.createStatRow('Zona', ZONE_LABEL[selectedStop.zone]))
    stopSection.appendChild(
      panel.createStatRow('Bentuk', selectedStop.shape ? SHAPE_LABEL[selectedStop.shape] : '—'),
    )
    stopSection.appendChild(panel.createStatRow('Dilayani rute', serving.length ? serving.map(r => r.name).join(', ') : '—'))
    stopSection.appendChild(
      panel.createStatRow(
        'Menunggu',
        String(state.passengers.filter(p => p.status === 'waiting' && p.originStopId === selectedStop.id).length),
      ),
    )
    panel.appendChild(stopSection)
  }

  draw()
}

function draw(): void {
  gameCanvas.draw({
    state: simulation.getState(),
    selectedStopId: selectedStopId ?? undefined,
    selectedRouteId: selectedRouteId ?? undefined,
    draftRouteStopIds: draftStopIds,
    hoverStopId: hoverStopId ?? undefined,
  })
}

function toWorld(event: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * WORLD_SIZE.x,
    y: ((event.clientY - rect.top) / rect.height) * WORLD_SIZE.y,
  }
}

canvas.addEventListener('mousemove', event => {
  pointer = toWorld(event)
  hoverStopId = stopAt(pointer.x, pointer.y)?.id ?? null
})

canvas.addEventListener('mouseleave', () => {
  pointer = null
  hoverStopId = null
})

canvas.addEventListener('click', event => {
  const point = toWorld(event)
  const hit = stopAt(point.x, point.y)

  if (hit) {
    if (tool === 'createRoute') {
      selectedStopId = hit.id
      selectedRouteId = null
      if (!draftStopIds.includes(hit.id)) draftStopIds.push(hit.id)
      render()
      return
    }
    if (appendRouteId) {
      appendStopToRoute(appendRouteId, hit.id)
      render()
      return
    }
    selectedStopId = hit.id
    selectedRouteId = null
    render()
    return
  }

  const routeHit = simulation.getState().routes.find(route => {
    if (route.stops.length < 2) return false
    return route.stops.some((stop, index) => {
      const next = route.stops[index + 1]
      if (!next) return false
      const dx = next.position.x - stop.position.x
      const dy = next.position.y - stop.position.y
      const lengthSq = dx * dx + dy * dy || 1
      const t = Math.max(0, Math.min(1, ((point.x - stop.position.x) * dx + (point.y - stop.position.y) * dy) / lengthSq))
      return Math.hypot(stop.position.x + dx * t - point.x, stop.position.y + dy * t - point.y) <= 10
    })
  })

  if (routeHit && !appendRouteId) {
    selectedRouteId = routeHit.id
    selectedStopId = null
    render()
    return
  }

  if (appendRouteId) {
    notify('Halte yang ditambahkan ke rute harus halte yang sudah ada di peta.')
  }

  selectedStopId = null
  selectedRouteId = null
  render()
})

simButtons.toggle.addEventListener('click', () => {
  if (simulation.getState().isRunning) simulation.pause()
  else simulation.start()
  render()
})

simButtons.speed1.addEventListener('click', () => {
  simulation.setSpeed(1)
  render()
})

simButtons.speed2.addEventListener('click', () => {
  simulation.setSpeed(2)
  render()
})

simButtons.speed4.addEventListener('click', () => {
  simulation.setSpeed(4)
  render()
})

let panelPointerDown = false
let panelReleasedAt = -Infinity
panel.container.addEventListener('pointerdown', () => {
  panelPointerDown = true
})
window.addEventListener('pointerup', () => {
  panelPointerDown = false
  panelReleasedAt = performance.now()
})
window.addEventListener('pointercancel', () => {
  panelPointerDown = false
  panelReleasedAt = performance.now()
})

const PANEL_RELEASE_GRACE_MS = 300

function panelIsBusy(): boolean {
  if (panelPointerDown) return true
  if (performance.now() - panelReleasedAt < PANEL_RELEASE_GRACE_MS) return true
  return panel.container.contains(document.activeElement)
}

let frames = 0
function loop(): void {
  simulation.update(1 / 60)
  updateHud()
  draw()
  frames += 1
  // Jangan rebuild panel saat user sedang menekan atau mengetik di panel: elemen
  // yang sedang diklik akan hilang sebelum 'click' selesai, jadi aksi terlewat.
  if (frames % 10 === 0 && !panelIsBusy()) render()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)