import { describe, expect, it } from 'vitest'
import { Outbox, type Command } from './outbox'

function memory() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, map: m }
}
const cmd = (id: string, op: Command['op'] = 'event'): Command => ({ id, op })

describe('outbox', () => {
  it('drops accepted and duplicate commands, queues rejections, keeps retries in order', async () => {
    const store = memory()
    const box = new Outbox(store)
    box.enqueue([cmd('a'), cmd('b'), cmd('c'), cmd('d')])
    const sent: string[][] = []
    const done = await box.flush(async (cmds) => {
      sent.push(cmds.map((c) => c.id))
      return { rev: 7, results: cmds.map((c) => c.id === 'b' ? { id: c.id, op: c.op, status: 'rejected' as const, reason: 'unknown_room' }
        : c.id === 'c' ? { id: c.id, op: c.op, status: 'retry' as const } : { id: c.id, op: c.op, status: 'accepted' as const }) }
    })
    expect(done).toBe(false)
    expect(sent).toEqual([['a', 'b', 'c', 'd']])
    expect(box.pending().map((e) => e.cmd.id)).toEqual(['c', 'd'])
    expect(box.rejected().map((r) => r.reason)).toEqual(['unknown_room'])
    // persisted, so a reload picks the queue up
    const again = new Outbox(store)
    expect(again.pending().map((e) => e.cmd.id)).toEqual(['c', 'd'])
    expect(again.rejected().length).toBe(1)
  })

  it('keeps everything and reports offline when the send fails', async () => {
    const box = new Outbox(memory())
    box.enqueue([cmd('a')])
    const done = await box.flush(async () => { throw new Error('network') })
    expect(done).toBe(false)
    expect(box.state().offline).toBe(true)
    expect(box.pending().length).toBe(1)
    const ok = await box.flush(async (cmds) => ({ rev: 1, results: cmds.map((c) => ({ id: c.id, op: c.op, status: 'duplicate' as const })) }))
    expect(ok).toBe(true)
    expect(box.state().offline).toBe(false)
    expect(box.pending().length).toBe(0)
  })

  it('surfaces alerts raised for accepted commands', async () => {
    const box = new Outbox(memory())
    const seen: string[][] = []
    box.onAlerts = (_c, alerts) => seen.push(alerts)
    box.enqueue([cmd('a')])
    await box.flush(async (cmds) => ({ rev: 1, results: cmds.map((c) => ({ id: c.id, op: c.op, status: 'accepted' as const, alerts: ['duplicate_code'] })) }))
    expect(seen).toEqual([['duplicate_code']])
  })
})
