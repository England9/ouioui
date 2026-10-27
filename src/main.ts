type FlowerKind = 'cherry' | 'tulip' | 'chestnut'
type ObstacleKind = 'rain' | 'wind' | 'wasp'
type EntityKind = FlowerKind | ObstacleKind

interface Entity {
  id: number
  kind: EntityKind
  x: number
  y: number
  vx: number
  vy: number
  r: number
  rot: number
  spin: number
  wobble: number
  life: number
}

interface Counts {
  cherry: number
  tulip: number
  chestnut: number
  hits: number
}

type Phase = 'title' | 'playing' | 'result'

const ROUND_MS = 15_000
const PLAYER_Y_RATIO = 0.86
const MAX_JAR = 24

const FLOWER_META: Record<
  FlowerKind,
  { label: string; color: string; points: number; message: string }
> = {
  cherry: {
    label: 'Cherry Blossoms',
    color: '#f4a0b8',
    points: 3,
    message: "You collected mostly Cherry Blossoms! Spring's elegant nectar is ready.",
  },
  tulip: {
    label: 'Tulip Tree Flowers',
    color: '#f6cf45',
    points: 2,
    message: 'You collected mostly Tulip Tree Flowers! Bright rooftop nectar for patisserie gold.',
  },
  chestnut: {
    label: 'Horse Chestnut Flowers',
    color: '#7ec9a0',
    points: 2,
    message: 'You collected mostly Horse Chestnut Flowers! Soft urban nectar, ginza-smooth.',
  },
}

const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const ctx = canvas.getContext('2d')!
const hud = document.querySelector<HTMLElement>('#hud')!
const timerEl = document.querySelector<HTMLElement>('#timer')!
const scoreEl = document.querySelector<HTMLElement>('#score')!
const jarFill = document.querySelector<HTMLElement>('#jarFill')!
const titlePanel = document.querySelector<HTMLElement>('#titlePanel')!
const resultPanel = document.querySelector<HTMLElement>('#resultPanel')!
const resultTitle = document.querySelector<HTMLElement>('#resultTitle')!
const resultCopy = document.querySelector<HTMLElement>('#resultCopy')!
const tallyEl = document.querySelector<HTMLElement>('#tally')!
const freezeFlash = document.querySelector<HTMLElement>('#freezeFlash')!
const startBtn = document.querySelector<HTMLButtonElement>('#startBtn')!
const replayBtn = document.querySelector<HTMLButtonElement>('#replayBtn')!
const ctaPrimary = document.querySelector<HTMLAnchorElement>('#ctaPrimary')!

const state = {
  phase: 'title' as Phase,
  w: 1,
  h: 1,
  dpr: 1,
  playerX: 0.5,
  playerTarget: 0.5,
  playerW: 72,
  entities: [] as Entity[],
  nextId: 1,
  spawnAcc: 0,
  score: 0,
  counts: { cherry: 0, tulip: 0, chestnut: 0, hits: 0 } as Counts,
  caught: 0,
  startedAt: 0,
  remaining: ROUND_MS,
  freezeUntil: 0,
  pointerId: null as number | null,
  dragging: false,
  keys: new Set<string>(),
  lastTs: 0,
  beeBob: 0,
}

function resize() {
  const rect = canvas.getBoundingClientRect()
  state.dpr = Math.min(window.devicePixelRatio || 1, 2)
  state.w = Math.max(1, Math.floor(rect.width))
  state.h = Math.max(1, Math.floor(rect.height))
  canvas.width = Math.floor(state.w * state.dpr)
  canvas.height = Math.floor(state.h * state.dpr)
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0)
  state.playerW = Math.max(52, Math.min(78, state.w * 0.16))
}

function resetRound() {
  state.entities = []
  state.nextId = 1
  state.spawnAcc = 0
  state.score = 0
  state.caught = 0
  state.counts = { cherry: 0, tulip: 0, chestnut: 0, hits: 0 }
  state.playerX = 0.5
  state.playerTarget = 0.5
  state.freezeUntil = 0
  state.remaining = ROUND_MS
  state.startedAt = performance.now()
  updateHud()
}

function setPhase(phase: Phase) {
  state.phase = phase
  titlePanel.hidden = phase !== 'title'
  resultPanel.hidden = phase !== 'result'
  hud.hidden = phase !== 'playing'
}

function updateHud() {
  timerEl.textContent = (Math.max(0, state.remaining) / 1000).toFixed(1)
  scoreEl.textContent = String(state.score)
  const fill = Math.min(100, (state.caught / MAX_JAR) * 100)
  jarFill.style.height = `${fill}%`
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function pickFlower(): FlowerKind {
  const roll = Math.random()
  if (roll < 0.38) return 'cherry'
  if (roll < 0.7) return 'tulip'
  return 'chestnut'
}

function pickObstacle(): ObstacleKind {
  const roll = Math.random()
  if (roll < 0.4) return 'rain'
  if (roll < 0.7) return 'wind'
  return 'wasp'
}

function spawnEntity(now: number) {
  const elapsed = now - state.startedAt
  const difficulty = Math.min(1, elapsed / ROUND_MS)
  const obstacleChance = 0.22 + difficulty * 0.2
  const isObstacle = Math.random() < obstacleChance
  const kind: EntityKind = isObstacle ? pickObstacle() : pickFlower()

  const baseSpeed = 140 + difficulty * 160
  let r = 16
  let vy = baseSpeed + rand(-20, 40)
  let vx = rand(-30, 30)
  let spin = rand(-1.5, 1.5)

  if (kind === 'rain') {
    r = 8
    vy = baseSpeed * 1.35 + rand(20, 80)
    vx = rand(-10, 10)
  } else if (kind === 'wind') {
    r = 22
    vy = baseSpeed * 0.55 + rand(-10, 20)
    vx = (Math.random() < 0.5 ? -1 : 1) * rand(80, 150)
    spin = rand(-3, 3)
  } else if (kind === 'wasp') {
    r = 15
    vy = baseSpeed * 0.9 + rand(0, 50)
    vx = rand(-90, 90)
    spin = rand(-4, 4)
  } else {
    r = kind === 'cherry' ? 22 : kind === 'tulip' ? 21 : 20
  }

  state.entities.push({
    id: state.nextId++,
    kind,
    x: rand(0.08, 0.92) * state.w,
    y: -r - rand(8, 60),
    vx,
    vy,
    r,
    rot: rand(0, Math.PI * 2),
    spin,
    wobble: rand(0, Math.PI * 2),
    life: 1,
  })
}

function playerRect() {
  const x = state.playerX * state.w
  const y = state.h * PLAYER_Y_RATIO
  const w = state.playerW
  const h = w * 1.35
  return {
    x,
    y,
    w,
    h,
    left: x - w * 0.4,
    right: x + w * 0.4,
    top: y - h * 0.52,
    bottom: y + h * 0.5,
  }
}

function hitTest(e: Entity) {
  const p = playerRect()
  return e.x > p.left && e.x < p.right && e.y > p.top && e.y < p.bottom
}

function onCatchFlower(kind: FlowerKind) {
  state.counts[kind] += 1
  state.caught += 1
  state.score += FLOWER_META[kind].points
  updateHud()
}

function onHitObstacle(kind: ObstacleKind, now: number) {
  state.counts.hits += 1
  const penalty = kind === 'wasp' ? 4 : kind === 'wind' ? 2 : 1
  state.score = Math.max(0, state.score - penalty)
  const freezeMs = kind === 'wasp' ? 700 : kind === 'wind' ? 450 : 280
  state.freezeUntil = Math.max(state.freezeUntil, now + freezeMs)
  freezeFlash.classList.add('on')
  window.setTimeout(() => freezeFlash.classList.remove('on'), freezeMs)
  updateHud()
}

function endRound() {
  setPhase('result')
  const { cherry, tulip, chestnut } = state.counts
  const total = cherry + tulip + chestnut
  let dominant: FlowerKind | null = null
  if (total > 0) {
    const ranked: FlowerKind[] = ['cherry', 'tulip', 'chestnut']
    ranked.sort((a, b) => state.counts[b] - state.counts[a])
    dominant = ranked[0]
  }

  if (!dominant) {
    resultTitle.textContent = 'A quiet rooftop'
    resultCopy.textContent =
      'The bees still hum above Ginza. Try again for cherry, tulip tree, and chestnut nectar.'
  } else {
    resultTitle.textContent = `${FLOWER_META[dominant].label}`
    resultCopy.textContent = FLOWER_META[dominant].message
  }

  tallyEl.innerHTML = (['cherry', 'tulip', 'chestnut'] as FlowerKind[])
    .map(
      (k) =>
        `<li><span><span class="dot" style="background:${FLOWER_META[k].color}"></span>${FLOWER_META[k].label}</span><strong>${state.counts[k]}</strong></li>`,
    )
    .join('')

  // Alternate dessert partner emphasis by dominant flower
  if (dominant === 'chestnut') {
    ctaPrimary.href = 'https://www.mikasakaikan.co.jp/'
  } else {
    ctaPrimary.href = 'https://www.henri-charpentier.com/eng/shop/ginza-maison/'
  }
}

function update(dt: number, now: number) {
  if (state.phase !== 'playing') return

  state.remaining = Math.max(0, ROUND_MS - (now - state.startedAt))
  timerEl.textContent = (state.remaining / 1000).toFixed(1)

  if (state.remaining <= 0) {
    endRound()
    return
  }

  const frozen = now < state.freezeUntil
  const moveSpeed = frozen ? 0.55 : 2.4

  if (state.keys.has('ArrowLeft') || state.keys.has('a')) {
    state.playerTarget -= 0.9 * dt
  }
  if (state.keys.has('ArrowRight') || state.keys.has('d')) {
    state.playerTarget += 0.9 * dt
  }
  state.playerTarget = Math.max(0.08, Math.min(0.92, state.playerTarget))
  state.playerX += (state.playerTarget - state.playerX) * Math.min(1, moveSpeed * dt)
  state.beeBob += dt * 4

  const elapsed = now - state.startedAt
  const difficulty = Math.min(1, elapsed / ROUND_MS)
  const spawnEvery = Math.max(0.28, 0.72 - difficulty * 0.35)
  state.spawnAcc += dt
  while (state.spawnAcc >= spawnEvery) {
    state.spawnAcc -= spawnEvery
    spawnEntity(now)
  }

  for (const e of state.entities) {
    e.wobble += dt * 3
    e.rot += e.spin * dt
    if (e.kind === 'wasp') {
      e.vx += Math.sin(e.wobble * 2.2) * 40 * dt
    }
    if (e.kind === 'wind') {
      e.x += e.vx * dt
      e.y += e.vy * dt
    } else if (e.kind === 'cherry' || e.kind === 'tulip' || e.kind === 'chestnut') {
      e.x += e.vx * dt + Math.sin(e.wobble) * 18 * dt
      e.y += e.vy * dt
    } else {
      e.x += e.vx * dt
      e.y += e.vy * dt
    }
  }

  const keep: Entity[] = []
  for (const e of state.entities) {
    if (e.y - e.r > state.h + 40 || e.x < -80 || e.x > state.w + 80) continue
    if (!frozen && hitTest(e)) {
      if (e.kind === 'cherry' || e.kind === 'tulip' || e.kind === 'chestnut') {
        onCatchFlower(e.kind)
      } else {
        onHitObstacle(e.kind, now)
      }
      continue
    }
    keep.push(e)
  }
  state.entities = keep
}

function drawStemLeaf(r: number) {
  ctx.strokeStyle = '#4f8a4a'
  ctx.lineWidth = Math.max(1.5, r * 0.12)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, r * 0.15)
  ctx.lineTo(0, r * 0.95)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, r * 0.55)
  ctx.quadraticCurveTo(r * 0.45, r * 0.4, r * 0.55, r * 0.7)
  ctx.quadraticCurveTo(r * 0.2, r * 0.7, 0, r * 0.6)
  ctx.fillStyle = '#6fad68'
  ctx.fill()
}

function drawFlower(e: Entity) {
  const { x, y, r, rot, kind } = e
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot * 0.35)

  if (kind === 'cherry') {
    drawStemLeaf(r)
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2
      const px = Math.cos(a) * r * 0.38
      const py = Math.sin(a) * r * 0.38 - r * 0.05
      ctx.beginPath()
      ctx.ellipse(px, py, r * 0.34, r * 0.42, a, 0, Math.PI * 2)
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r * 0.42)
      grad.addColorStop(0, '#ffe2ea')
      grad.addColorStop(0.55, '#f4a0b8')
      grad.addColorStop(1, '#e8789a')
      ctx.fillStyle = grad
      ctx.fill()
      // petal notch
      ctx.beginPath()
      ctx.moveTo(px + Math.cos(a) * r * 0.1, py + Math.sin(a) * r * 0.1)
      ctx.lineTo(px + Math.cos(a) * r * 0.42, py + Math.sin(a) * r * 0.42 - r * 0.08)
      ctx.lineTo(px + Math.cos(a + 0.4) * r * 0.42, py + Math.sin(a + 0.4) * r * 0.42)
      ctx.fillStyle = 'rgba(255,255,255,0.28)'
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(0, -r * 0.05, r * 0.2, 0, Math.PI * 2)
    ctx.fillStyle = '#ffd36a'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(0, -r * 0.05, r * 0.08, 0, Math.PI * 2)
    ctx.fillStyle = '#c47e0c'
    ctx.fill()
  } else if (kind === 'tulip') {
    // tulip-tree cup: bright yellow petals + orange center
    drawStemLeaf(r)
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i - Math.PI / 4
      ctx.save()
      ctx.rotate(a)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.bezierCurveTo(r * 0.55, -r * 0.15, r * 0.5, -r * 0.75, 0, -r * 0.85)
      ctx.bezierCurveTo(-r * 0.5, -r * 0.75, -r * 0.55, -r * 0.15, 0, 0)
      const g = ctx.createLinearGradient(0, 0, 0, -r)
      g.addColorStop(0, '#f8df6a')
      g.addColorStop(0.55, '#f6cf45')
      g.addColorStop(1, '#efb020')
      ctx.fillStyle = g
      ctx.fill()
      ctx.restore()
    }
    ctx.beginPath()
    ctx.arc(0, -r * 0.08, r * 0.22, 0, Math.PI * 2)
    ctx.fillStyle = '#e07a2f'
    ctx.fill()
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5
      ctx.beginPath()
      ctx.arc(Math.cos(a) * r * 0.12, -r * 0.08 + Math.sin(a) * r * 0.12, r * 0.05, 0, Math.PI * 2)
      ctx.fillStyle = '#7a3d12'
      ctx.fill()
    }
  } else {
    // horse chestnut: creamy white/blush petals with yellow freckles + mint accents
    drawStemLeaf(r)
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2
      const px = Math.cos(a) * r * 0.32
      const py = Math.sin(a) * r * 0.32 - r * 0.02
      ctx.beginPath()
      ctx.ellipse(px, py, r * 0.3, r * 0.4, a, 0, Math.PI * 2)
      ctx.fillStyle = i % 2 === 0 ? '#fff7f0' : '#e8f7ee'
      ctx.fill()
      ctx.strokeStyle = 'rgba(126, 201, 160, 0.55)'
      ctx.lineWidth = 1
      ctx.stroke()
      // freckle blotch
      ctx.beginPath()
      ctx.ellipse(px * 0.7, py * 0.7, r * 0.1, r * 0.08, a, 0, Math.PI * 2)
      ctx.fillStyle = '#f0c85a'
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(0, -r * 0.02, r * 0.18, 0, Math.PI * 2)
    ctx.fillStyle = '#7ec9a0'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(0, -r * 0.02, r * 0.08, 0, Math.PI * 2)
    ctx.fillStyle = '#3f7a58'
    ctx.fill()
  }
  ctx.restore()
}

function drawObstacle(e: Entity) {
  const { x, y, r, rot, kind } = e
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)

  if (kind === 'rain') {
    ctx.beginPath()
    ctx.moveTo(0, -r * 1.1)
    ctx.bezierCurveTo(r * 0.75, -r * 0.2, r * 0.6, r * 0.55, 0, r)
    ctx.bezierCurveTo(-r * 0.6, r * 0.55, -r * 0.75, -r * 0.2, 0, -r * 1.1)
    const g = ctx.createLinearGradient(0, -r, 0, r)
    g.addColorStop(0, 'rgba(180, 220, 255, 0.95)')
    g.addColorStop(1, 'rgba(70, 140, 210, 0.9)')
    ctx.fillStyle = g
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(-r * 0.15, -r * 0.2, r * 0.15, r * 0.28, -0.4, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fill()
  } else if (kind === 'wind') {
    ctx.strokeStyle = 'rgba(90, 140, 170, 0.75)'
    ctx.lineWidth = 2.8
    ctx.lineCap = 'round'
    for (let i = 0; i < 3; i++) {
      const yy = (i - 1) * 9
      ctx.beginPath()
      ctx.moveTo(-r * 1.1, yy)
      ctx.bezierCurveTo(-r * 0.2, yy - 10, r * 0.25, yy + 10, r * 1.15, yy)
      ctx.stroke()
    }
    // leaf tumble
    ctx.rotate(0.4)
    ctx.beginPath()
    ctx.ellipse(r * 0.55, -4, r * 0.28, r * 0.14, 0.5, 0, Math.PI * 2)
    ctx.fillStyle = '#8fbf6a'
    ctx.fill()
  } else {
    // wasp
    ctx.beginPath()
    ctx.ellipse(-r * 0.6, -r * 0.05, r * 0.38, r * 0.22, -0.5, 0, Math.PI * 2)
    ctx.ellipse(r * 0.55, -r * 0.08, r * 0.36, r * 0.2, 0.45, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(120, 140, 160, 0.45)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.beginPath()
    ctx.ellipse(0, 0, r * 0.58, r * 0.4, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#f6cf45'
    ctx.fill()
    ctx.fillStyle = '#2a2418'
    ctx.fillRect(-r * 0.22, -r * 0.38, r * 0.16, r * 0.76)
    ctx.fillRect(r * 0.05, -r * 0.38, r * 0.16, r * 0.76)
    ctx.beginPath()
    ctx.arc(-r * 0.35, -r * 0.05, r * 0.12, 0, Math.PI * 2)
    ctx.fillStyle = '#1c1710'
    ctx.fill()
  }
  ctx.restore()
}

function drawHoneyBottle(w: number, h: number, fillRatio: number, frozen: boolean) {
  // Classic squeeze/pour honey bottle: tall neck + shoulders + rounded body + screw cap
  const mouthTop = -h * 0.58
  const neckTop = -h * 0.4
  const shoulder = -h * 0.18
  const bodyBottom = h * 0.5

  ctx.beginPath()
  ctx.ellipse(0, h * 0.55, w * 0.4, h * 0.07, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(60, 90, 50, 0.16)'
  ctx.fill()

  // bottle silhouette
  ctx.beginPath()
  ctx.moveTo(-w * 0.14, mouthTop)
  ctx.lineTo(w * 0.14, mouthTop)
  ctx.lineTo(w * 0.15, neckTop)
  ctx.quadraticCurveTo(w * 0.18, -h * 0.28, w * 0.36, shoulder)
  ctx.quadraticCurveTo(w * 0.5, -h * 0.02, w * 0.46, h * 0.22)
  ctx.quadraticCurveTo(w * 0.42, bodyBottom, 0, bodyBottom + h * 0.04)
  ctx.quadraticCurveTo(-w * 0.42, bodyBottom, -w * 0.46, h * 0.22)
  ctx.quadraticCurveTo(-w * 0.5, -h * 0.02, -w * 0.36, shoulder)
  ctx.quadraticCurveTo(-w * 0.18, -h * 0.28, -w * 0.15, neckTop)
  ctx.closePath()

  const glass = ctx.createLinearGradient(-w * 0.5, 0, w * 0.5, 0)
  glass.addColorStop(0, frozen ? 'rgba(175, 185, 165, 0.8)' : 'rgba(255, 255, 255, 0.62)')
  glass.addColorStop(0.4, frozen ? 'rgba(220, 210, 160, 0.45)' : 'rgba(255, 252, 235, 0.28)')
  glass.addColorStop(1, frozen ? 'rgba(155, 165, 140, 0.75)' : 'rgba(210, 230, 245, 0.5)')
  ctx.fillStyle = glass
  ctx.fill()
  ctx.strokeStyle = 'rgba(90, 70, 30, 0.45)'
  ctx.lineWidth = 2.2
  ctx.stroke()

  ctx.save()
  ctx.clip()
  const fillH = (bodyBottom - neckTop) * Math.min(1, Math.max(0.2, fillRatio))
  const honeyTop = bodyBottom - fillH
  const honey = ctx.createLinearGradient(0, honeyTop, 0, bodyBottom)
  honey.addColorStop(0, '#ffe58f')
  honey.addColorStop(0.4, '#f0b429')
  honey.addColorStop(1, '#b8720c')
  ctx.fillStyle = honey
  ctx.fillRect(-w * 0.55, honeyTop, w * 1.1, bodyBottom - honeyTop + 8)
  ctx.beginPath()
  ctx.ellipse(0, honeyTop, w * 0.36, 5, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
  ctx.fill()
  ctx.restore()

  // shine
  ctx.beginPath()
  ctx.moveTo(-w * 0.26, -h * 0.08)
  ctx.quadraticCurveTo(-w * 0.3, h * 0.12, -w * 0.24, h * 0.32)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.stroke()

  // screw cap (gold)
  const capY = mouthTop - h * 0.02
  ctx.beginPath()
  ctx.roundRect(-w * 0.2, capY - h * 0.08, w * 0.4, h * 0.12, 4)
  const cap = ctx.createLinearGradient(0, capY - h * 0.08, 0, capY + h * 0.04)
  cap.addColorStop(0, '#ffe28a')
  cap.addColorStop(0.5, '#e8a820')
  cap.addColorStop(1, '#a86a0c')
  ctx.fillStyle = cap
  ctx.fill()
  ctx.strokeStyle = 'rgba(90, 60, 10, 0.4)'
  ctx.lineWidth = 1.2
  ctx.stroke()
  // cap ridges
  ctx.strokeStyle = 'rgba(90, 60, 10, 0.25)'
  for (let i = 0; i < 3; i++) {
    const yy = capY - h * 0.06 + i * h * 0.03
    ctx.beginPath()
    ctx.moveTo(-w * 0.16, yy)
    ctx.lineTo(w * 0.16, yy)
    ctx.stroke()
  }

  // paper label
  ctx.fillStyle = 'rgba(255, 248, 238, 0.92)'
  ctx.beginPath()
  ctx.roundRect(-w * 0.24, h * 0.02, w * 0.48, h * 0.18, 4)
  ctx.fill()
  ctx.strokeStyle = 'rgba(196, 126, 12, 0.5)'
  ctx.stroke()
  ctx.fillStyle = '#c47e0c'
  ctx.font = `700 ${Math.max(9, w * 0.15)}px Figtree, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('HONEY', 0, h * 0.11)
}

function drawPlayer(now: number) {
  const p = playerRect()
  const bob = Math.sin(state.beeBob) * 2.5
  const frozen = now < state.freezeUntil
  const fillRatio = Math.min(1, state.caught / MAX_JAR)

  ctx.save()
  ctx.translate(p.x, p.y + bob)
  if (frozen) ctx.globalAlpha = 0.75
  drawHoneyBottle(p.w, p.h, Math.max(0.22, fillRatio), frozen)
  ctx.restore()
}

function drawAmbient() {
  ctx.save()
  for (let i = 0; i < 10; i++) {
    const x = ((i * 97 + state.beeBob * 12) % (state.w + 40)) - 20
    const y = ((i * 53) % (state.h * 0.55)) + 50
    ctx.globalAlpha = 0.18 + (i % 3) * 0.05
    ctx.beginPath()
    ctx.ellipse(x, y, 10 + (i % 3) * 4, 4, 0.2 * i, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
  }
  // soft pollen dots
  ctx.globalAlpha = 0.22
  for (let i = 0; i < 14; i++) {
    const x = ((i * 71) % state.w) + Math.sin(state.beeBob + i) * 10
    const y = ((i * 43) % (state.h * 0.65)) + 30
    ctx.beginPath()
    ctx.arc(x, y, 1.4 + (i % 2), 0, Math.PI * 2)
    ctx.fillStyle = i % 2 ? '#f6cf45' : '#f4a0b8'
    ctx.fill()
  }
  ctx.restore()
}

function draw(now: number) {
  ctx.clearRect(0, 0, state.w, state.h)
  if (state.phase === 'title') {
    drawAmbient()
    return
  }

  drawAmbient()
  for (const e of state.entities) {
    if (e.kind === 'cherry' || e.kind === 'tulip' || e.kind === 'chestnut') drawFlower(e)
    else drawObstacle(e)
  }
  if (state.phase === 'playing' || state.phase === 'result') {
    drawPlayer(now)
  }
}

function frame(ts: number) {
  if (!state.lastTs) state.lastTs = ts
  const dt = Math.min(0.033, (ts - state.lastTs) / 1000)
  state.lastTs = ts
  update(dt, ts)
  draw(ts)
  requestAnimationFrame(frame)
}

function pointerToNorm(clientX: number) {
  const rect = canvas.getBoundingClientRect()
  return Math.max(0.08, Math.min(0.92, (clientX - rect.left) / rect.width))
}

function onPointerDown(ev: PointerEvent) {
  if (state.phase !== 'playing') return
  state.pointerId = ev.pointerId
  state.dragging = true
  state.playerTarget = pointerToNorm(ev.clientX)
  canvas.setPointerCapture(ev.pointerId)
}

function onPointerMove(ev: PointerEvent) {
  if (!state.dragging || ev.pointerId !== state.pointerId) return
  state.playerTarget = pointerToNorm(ev.clientX)
}

function onPointerUp(ev: PointerEvent) {
  if (ev.pointerId !== state.pointerId) return
  state.dragging = false
  state.pointerId = null
}

function startGame() {
  resetRound()
  setPhase('playing')
  state.lastTs = 0
}

startBtn.addEventListener('click', startGame)
replayBtn.addEventListener('click', startGame)

canvas.addEventListener('pointerdown', onPointerDown)
canvas.addEventListener('pointermove', onPointerMove)
canvas.addEventListener('pointerup', onPointerUp)
canvas.addEventListener('pointercancel', onPointerUp)

window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(e.key)) {
    e.preventDefault()
    state.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key)
  }
  if ((e.key === 'Enter' || e.key === ' ') && state.phase !== 'playing') {
    e.preventDefault()
    startGame()
  }
})
window.addEventListener('keyup', (e) => {
  state.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key)
})

window.addEventListener('resize', resize)
resize()
setPhase('title')
requestAnimationFrame(frame)
