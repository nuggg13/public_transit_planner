export class InfoPanel {
  container: HTMLElement

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!
  }

  clear(): void {
    this.container.innerHTML = ''
  }

  appendChild(element: HTMLElement): void {
    this.container.appendChild(element)
  }

  createSection(title: string): HTMLElement {
    const section = document.createElement('div')
    section.className = 'panel-section'

    const header = document.createElement('h3')
    header.textContent = title
    section.appendChild(header)

    return section
  }

  createStatRow(label: string, value: string, key?: string): HTMLElement {
    const row = document.createElement('div')
    row.className = 'stat-row'

    const labelEl = document.createElement('span')
    labelEl.className = 'stat-label'
    labelEl.textContent = label

    const valueEl = document.createElement('span')
    valueEl.className = 'stat-value'
    if (key) valueEl.dataset.statKey = key
    valueEl.textContent = value

    row.appendChild(labelEl)
    row.appendChild(valueEl)

    return row
  }

  updateStat(key: string, value: string): void {
    const valueEl = this.container.querySelector<HTMLElement>(`[data-stat-key="${key}"]`)
    if (valueEl) valueEl.textContent = value
  }

  createButtonRow(buttons: HTMLElement[]): HTMLElement {
    const row = document.createElement('div')
    row.className = 'button-row row-3'
    buttons.forEach(button => row.appendChild(button))
    return row
  }

  createWideRow(buttons: HTMLElement[]): HTMLElement {
    const row = document.createElement('div')
    row.className = 'button-row row-2'
    buttons.forEach(button => row.appendChild(button))
    return row
  }

  createNote(text: string): HTMLElement {
    const note = document.createElement('p')
    note.className = 'panel-note'
    note.textContent = text
    return note
  }

  createField(parent: HTMLElement, id: string, label: string, value: string): HTMLInputElement {
    const wrap = document.createElement('div')

    const labelEl = document.createElement('label')
    labelEl.className = 'field-label'
    labelEl.textContent = label
    labelEl.htmlFor = id
    wrap.appendChild(labelEl)

    const input = document.createElement('input')
    input.id = id
    input.className = 'text-input'
    input.type = 'text'
    input.value = value
    input.maxLength = 32
    wrap.appendChild(input)

    parent.appendChild(wrap)
    return input
  }

  createSwatches(selected: string, onSelect: (color: string) => void): HTMLElement {
    const wrap = document.createElement('div')

    const labelEl = document.createElement('span')
    labelEl.className = 'field-label'
    labelEl.textContent = 'Warna rute'
    wrap.appendChild(labelEl)

    const row = document.createElement('div')
    row.className = 'swatch-row'
    ROUTE_PALETTE.forEach(color => {
      const swatch = document.createElement('button')
      swatch.type = 'button'
      swatch.className = 'swatch'
      swatch.style.background = color
      swatch.setAttribute('aria-label', `Pilih warna ${color}`)
      swatch.setAttribute('aria-pressed', color === selected ? 'true' : 'false')
      swatch.addEventListener('click', () => onSelect(color))
      row.appendChild(swatch)
    })
    wrap.appendChild(row)
    return wrap
  }

  createStepper(
    value: number,
    min: number,
    max: number,
    onChange: (next: number) => void,
  ): HTMLElement {
    const wrap = document.createElement('div')

    const labelEl = document.createElement('span')
    labelEl.className = 'field-label'
    labelEl.textContent = 'Jumlah bus (1-10)'
    wrap.appendChild(labelEl)

    const row = document.createElement('div')
    row.className = 'stepper'

    const output = document.createElement('output')
    output.textContent = String(value)

    const apply = (next: number): void => {
      const clamped = Math.min(max, Math.max(min, next))
      output.textContent = String(clamped)
      onChange(clamped)
    }

    const minus = document.createElement('button')
    minus.type = 'button'
    minus.className = 'order-btn'
    minus.textContent = '−'
    minus.setAttribute('aria-label', 'Kurangi bus')
    minus.addEventListener('click', () => apply(Number(output.textContent) - 1))

    const plus = document.createElement('button')
    plus.type = 'button'
    plus.className = 'order-btn'
    plus.textContent = '+'
    plus.setAttribute('aria-label', 'Tambah bus')
    plus.addEventListener('click', () => apply(Number(output.textContent) + 1))

    row.appendChild(minus)
    row.appendChild(output)
    row.appendChild(plus)
    wrap.appendChild(row)
    return wrap
  }

  createOrderList(
    items: { id: string; name: string }[],
    onMove: (id: string, delta: -1 | 1) => void,
    onRemove: (id: string) => void,
    onReorder?: (fromIndex: number, toIndex: number) => void,
  ): HTMLElement {
    const list = document.createElement('ol')
    list.className = 'stop-order'

    let draggedItemId: string | null = null
    let dropTargetId: string | null = null

    const clearDragState = (): void => {
      draggedItemId = null
      dropTargetId = null
      list.querySelectorAll('li').forEach(el => {
        el.classList.remove('is-dragging', 'drag-over')
      })
    }

    const markDropTarget = (target: HTMLElement): void => {
      list.querySelectorAll('li').forEach(el => el.classList.remove('drag-over'))
      target.classList.add('drag-over')
      dropTargetId = target.dataset.id ?? null
    }

    items.forEach((item, index) => {
      const li = document.createElement('li')
      li.draggable = true
      li.dataset.id = item.id
      li.dataset.index = String(index)

      li.addEventListener('dragstart', e => {
        draggedItemId = item.id
        dropTargetId = null
        li.classList.add('is-dragging')
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', item.id)
        }
      })

      li.addEventListener('dragend', () => {
        clearDragState()
      })

      li.addEventListener('dragover', e => {
        e.preventDefault()
        if (draggedItemId !== null) markDropTarget(li)
      })

      li.addEventListener('dragleave', e => {
        const relatedTarget = e.relatedTarget
        if (!(relatedTarget instanceof Node) || !li.contains(relatedTarget)) {
          if (dropTargetId === item.id) {
            li.classList.remove('drag-over')
          }
        }
      })

      li.addEventListener('drop', e => {
        e.preventDefault()
        const sourceId = draggedItemId ?? e.dataTransfer?.getData('text/plain') ?? null
        const sourceIndex = items.findIndex(current => current.id === sourceId)
        const targetId = dropTargetId ?? item.id
        const targetIndex = items.findIndex(current => current.id === targetId)
        const shouldReorder =
          sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex && onReorder
        clearDragState()
        if (shouldReorder) {
          onReorder(sourceIndex, targetIndex)
        }
      })

      const order = document.createElement('span')
      order.className = 'order-index'
      order.textContent = String(index + 1)
      li.appendChild(order)

      const name = document.createElement('span')
      name.className = 'order-name'
      name.textContent = item.name
      li.appendChild(name)

      const up = document.createElement('button')
      up.type = 'button'
      up.className = 'order-btn'
      up.textContent = '▲'
      up.disabled = index === 0
      up.setAttribute('aria-label', `Naikkan ${item.name}`)
      up.addEventListener('click', () => onMove(item.id, -1))
      li.appendChild(up)

      const down = document.createElement('button')
      down.type = 'button'
      down.className = 'order-btn'
      down.textContent = '▼'
      down.disabled = index === items.length - 1
      down.setAttribute('aria-label', `Turunkan ${item.name}`)
      down.addEventListener('click', () => onMove(item.id, 1))
      li.appendChild(down)

      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'order-btn'
      remove.textContent = '×'
      remove.disabled = items.length <= 2
      remove.setAttribute('aria-label', `Keluarkan ${item.name}`)
      remove.addEventListener('click', () => onRemove(item.id))
      li.appendChild(remove)

      list.appendChild(li)
    })

    return list
  }
}

const ROUTE_PALETTE = ['#dc2626', '#2563eb', '#f59e0b', '#059669', '#7c3aed']
