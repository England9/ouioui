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
    color: '#f2a7bd',
    points: 3,
    message: "You collected mostly Cherry Blossoms! Spring's elegant nectar is ready.",
  },
  tulip: {
    label: 'Tulip Tree Flowers',
    color: '#f5d76e',
    points: 2,
    message: 'You collected mostly Tulip Tree Flowers! Bright rooftop nectar for patisserie gold.',
  },
  chestnut: {
    label: 'Horse Chestnut Flowers',
    color: '#9fd4c2',
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
  state.playerW = Math.max(58, Math.min(86, state.w * 0.18))
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
    r = kind === 'cherry' ? 18 : 17
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
  const h = w * 0.55
  return { x, y, w, h, left: x - w / 2, right: x + w / 2, top: y - h * 0.35, bottom: y + h * 0.45 }
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

function drawFlower(e: Entity) {
  const { x, y, r, rot, kind } = e
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)

  if (kind === 'cherry') {
    for (let i = 0; i < 5; i++) {
      ctx.rotate((Math.PI * 2) / 5)
      ctx.beginPath()
      ctx.ellipse(0, -r * 0.45, r * 0.28, r * 0.48, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#f2a7bd'
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2)
    ctx.fillStyle = '#f7d6e2'
    ctx.fill()
  } else if (kind === 'tulip') {
    ctx.beginPath()
    ctx.moveTo(0, r * 0.55)
    ctx.bezierCurveTo(r * 0.9, r * 0.1, r * 0.7, -r * 0.7, 0, -r * 0.55)
    ctx.bezierCurveTo(-r * 0.7, -r * 0.7, -r * 0.9, r * 0.1, 0, r * 0.55)
    ctx.fillStyle = '#f5d76e'
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(0, r * 0.2)
    ctx.quadraticCurveTo(r * 0.2, -r * 0.1, 0, -r * 0.45)
    ctx.quadraticCurveTo(-r * 0.2, -r * 0.1, 0, r * 0.2)
    ctx.fillStyle = '#e8b84a'
    ctx.fill()
  } else {
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3)
      ctx.beginPath()
      ctx.ellipse(0, -r * 0.35, r * 0.2, r * 0.42, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#9fd4c2'
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2)
    ctx.fillStyle = '#dff3ea'
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
    ctx.moveTo(0, -r)
    ctx.bezierCurveTo(r * 0.7, -r * 0.2, r * 0.55, r * 0.5, 0, r)
    ctx.bezierCurveTo(-r * 0.55, r * 0.5, -r * 0.7, -r * 0.2, 0, -r)
    ctx.fillStyle = 'rgba(160, 196, 224, 0.85)'
    ctx.fill()
  } else if (kind === 'wind') {
    ctx.strokeStyle = 'rgba(200, 214, 228, 0.7)'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    for (let i = 0; i < 3; i++) {
      const yy = (i - 1) * 8
      ctx.beginPath()
      ctx.moveTo(-r, yy)
      ctx.bezierCurveTo(-r * 0.2, yy - 8, r * 0.2, yy + 8, r, yy)
      ctx.stroke()
    }
  } else {
    // wasp
    ctx.fillStyle = '#1a1a14'
    ctx.beginPath()
    ctx.ellipse(-r * 0.55, 0, r * 0.35, r * 0.2, -0.4, 0, Math.PI * 2)
    ctx.ellipse(r * 0.55, 0, r * 0.35, r * 0.2, 0.4, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(220, 230, 240, 0.45)'
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(0, 0, r * 0.55, r * 0.38, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#f0d27a'
    ctx.fill()
    ctx.fillStyle = '#1c1710'
    ctx.fillRect(-r * 0.18, -r * 0.35, r * 0.14, r * 0.7)
    ctx.fillRect(r * 0.05, -r * 0.35, r * 0.14, r * 0.7)
  }
  ctx.restore()
}

function drawPlayer(now: number) {
  const p = playerRect()
  const bob = Math.sin(state.beeBob) * 3
  const frozen = now < state.freezeUntil

  ctx.save()
  ctx.translate(p.x, p.y + bob)
  if (frozen) ctx.globalAlpha = 0.7

  // honeycomb / jar catcher
  const w = p.w
  const h = p.h
  ctx.beginPath()
  ctx.moveTo(-w * 0.48, -h * 0.15)
  ctx.lineTo(-w * 0.32, -h * 0.42)
  ctx.lineTo(w * 0.32, -h * 0.42)
  ctx.lineTo(w * 0.48, -h * 0.15)
  ctx.lineTo(w * 0.38, h * 0.42)
  ctx.lineTo(-w * 0.38, h * 0.42)
  ctx.closePath()
  ctx.fillStyle = frozen ? '#7a6540' : '#c9922e'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 236, 190, 0.45)'
  ctx.lineWidth = 2
  ctx.stroke()

  // honeycomb cells
  ctx.strokeStyle = 'rgba(60, 40, 10, 0.28)'
  ctx.lineWidth = 1.25
  for (let row = -1; row <= 1; row++) {
    for (let col = -2; col <= 2; col++) {
      const cx = col * 12 + (row % 2 ? 6 : 0)
      const cy = row * 10
      hex(cx, cy, 6)
    }
  }

  // honey glow in center
  ctx.beginPath()
  ctx.ellipse(0, h * 0.08, w * 0.18, h * 0.18, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 214, 120, 0.55)'
  ctx.fill()

  ctx.restore()
}

function hex(x: number, y: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6
    const px = x + Math.cos(a) * r
    const py = y + Math.sin(a) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.stroke()
}

function drawAmbient() {
  // subtle floating motes behind playfield
  ctx.save()
  ctx.globalAlpha = 0.12
  for (let i = 0; i < 12; i++) {
    const x = ((i * 97) % state.w) + Math.sin(state.beeBob + i) * 8
    const y = ((i * 53) % (state.h * 0.7)) + 40
    ctx.beginPath()
    ctx.arc(x, y, 1.5 + (i % 3), 0, Math.PI * 2)
    ctx.fillStyle = '#f0d27a'
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
