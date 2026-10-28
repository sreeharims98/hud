import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, SessionUsage } from 'claude-code'

import type { Snapshot } from '../types'

// Bump the tag when Snapshot's fields change: it declines what an earlier
// version stored, which outlives a reload.
const snapshot = atom({ plugin: 'hud', key: 'snapshot' } as const, null, { shape: 'snapshot-1' })
const effort = atom({ plugin: 'hud', key: 'effort' } as const, null)
const isHidden = atom({ plugin: 'hud', key: 'isHidden' } as const, false)

const SEP = ' · '

const shortModel = (raw: string) =>
  raw
    .replace(/^claude-/i, '')
    .replace(/\[.*?\]/g, '')
    .replace(/-(\d+)-(\d+)$/, ' $1.$2')
    .replace(/-/g, ' ')
    .trim()
    .toLowerCase()

const compact = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
    : n >= 1000
      ? `${Math.round(n / 1000)}k`
      : `${n}`

const tone = (pct: number) => (pct >= 85 ? 'error' : pct >= 60 ? 'warning' : 'success')

const until = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000))
  if (mins >= 1440) return `${Math.floor(mins / 1440)}d${Math.floor((mins % 1440) / 60)}h`
  if (mins >= 60) return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m`
  return `${mins}m`
}

const LIMIT_LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

async function capture($: EngineInterface, usage: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>) {
  const next: Snapshot = {
    model: shortModel(await $.session.model()),
    tokens: usage.context.tokens,
    window: usage.context.window,
    percent: usage.context.percent,
    limits: usage.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
    usd: usage.cost?.usd,
  }
  await update($, snapshot, () => next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hud', description: 'Show or hide the usage HUD on the hint line' })
    await capture($, await $.session.usage())

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await capture($, e)

    return next(e)
  })

  // Effort is only known per request; record what the main loop actually sends.
  // It streams, so the hook is a generator that forwards the stream untouched.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const level = e.effort === undefined ? null : String(e.effort)
      await update($, effort, () => level)
    }

    return yield* next(e)
  })

  // /model doesn't raise a measurement; refresh the name once a turn lands.
  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    await capture($, await $.session.usage())

    return ran
  })

  on('command.run', { command: 'hud' }, async $ => {
    const hidden = await update($, isHidden, v => !v)

    return { text: hidden ? 'HUD hidden. /hud to bring it back.' : 'HUD shown.' }
  })

  // Drawn on the hint line under the prompt: the engine's own line (mode pills,
  // shortcuts) stays on the left, live; the HUD sits flush right beside it.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const snap = await read($, snapshot)
    if (snap === null || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const level = await read($, effort)
    const pct = snap.percent ?? 0

    // What's left of the row once the engine's line and the margins are drawn.
    let room = (e.viewport?.columns ?? 120) - e.props.hint.length - 8

    // Each part with its width and rank; the lowest ranks drop first when the
    // row is short. Drawn in the order listed.
    const parts: { rank: number; text: string; node: RenderChildren }[] = []
    const add = (rank: number, text: string, node: RenderChildren) => parts.push({ rank, text, node })

    if (snap.model) {
      add(4, `◆ ${snap.model}`, (
        <Text>
          <Text color="claude">◆ </Text>
          <Text weight="medium">{snap.model}</Text>
        </Text>
      ))
    }
    if (level !== null) {
      add(3, `effort ${level}`, (
        <Text>
          <Text dimColor>effort </Text>
          <Text color="suggestion">{level}</Text>
        </Text>
      ))
    }
    const ctx = snap.percent === undefined ? '—' : `${pct}%`
    add(9, `ctx ${ctx}`, (
      <Text>
        <Text dimColor>ctx </Text>
        <Text color={tone(pct)} weight="medium">{ctx}</Text>
      </Text>
    ))
    if (snap.tokens !== undefined) {
      const tokens = `${compact(snap.tokens)}/${compact(snap.window)}`
      add(1, tokens, <Text dimColor>{tokens}</Text>)
    }
    for (const l of snap.limits) {
      const label = LIMIT_LABEL[l.kind] ?? l.kind
      const used = `${Math.round(l.percentUsed)}%`
      const reset = l.kind === 'five_hour' ? until(l.resetsAt, now) : ''
      add(l.kind === 'five_hour' ? 8 : 2, `${label} ${used}${reset ? ` ↻ ${reset}` : ''}`, (
        <Text>
          <Text dimColor>{label} </Text>
          <Text color={tone(l.percentUsed)}>{used}</Text>
          {reset && <Text dimColor> ↻ {reset}</Text>}
        </Text>
      ))
    }
    if (snap.usd !== undefined) {
      const usd = `$${snap.usd.toFixed(2)}`
      add(7, usd, <Text>{usd}</Text>)
    }

    const kept = new Set<number>()
    for (const i of parts.map((_, i) => i).sort((a, b) => parts[b]!.rank - parts[a]!.rank)) {
      const width = parts[i]!.text.length + SEP.length
      if (width <= room) {
        kept.add(i)
        room -= width
      }
    }
    const shown = parts.filter((_, i) => kept.has(i))

    return (
      // The engine refuses its own line under a Box with layout props, so the
      // outer Box stays bare and a growing spacer pushes the HUD flush right.
      <Box>
        {await next(e)}
        <Box flexGrow={1} minWidth={2} />
        {shown.length > 0 && (
          <Text wrap="truncate-start">
            {shown.map((p, i) => (
              <Text>
                {i > 0 && <Text dimColor>{SEP}</Text>}
                {p.node}
              </Text>
            ))}
          </Text>
        )}
      </Box>
    )
  })
}
