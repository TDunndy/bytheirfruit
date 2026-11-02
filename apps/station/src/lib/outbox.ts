// The outbox (principle 5): every action becomes a command with a device
// UUID, is applied to the screen at once, and is pushed in order to
// ingest() when the network allows. A replay answers 'duplicate', so a
// retry is always safe. Rejections land in a staff queue instead of
// blocking the rest.
import type { IngestResult } from './api'

export interface Command { id: string; op: 'guest.create' | 'session.start' | 'session.complete' | 'event' | 'alert.raise'; [k: string]: unknown }
export interface Entry { cmd: Command; queued_at: string; tries: number }
export interface Rejection { cmd: Command; queued_at: string; rejected_at: string; reason: string; detail?: string }
export interface OutboxState { pending: number; rejected: number; offline: boolean; flushing: boolean; lastSyncAt: string | null }

type Send = (cmds: Command[]) => Promise<{ results: IngestResult[]; rev: number }>
type Listener = (s: OutboxState) => void

interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void }

export class Outbox {
  private entries: Entry[]
  private rejections: Rejection[]
  private listeners = new Set<Listener>()
  private flushing = false
  private offline = false
  private lastSyncAt: string | null = null
  /** Called with alerts ingest() raised for an accepted command (duplicate_code, credential_block). */
  onAlerts: ((cmd: Command, alerts: string[]) => void) | null = null
  onRev: ((rev: number) => void) | null = null

  constructor(private store: Store, private key = 'btf-outbox') {
    this.entries = this.read<Entry[]>(`${key}:pending`) ?? []
    this.rejections = this.read<Rejection[]>(`${key}:rejected`) ?? []
  }

  private read<T>(k: string): T | null {
    try { const v = this.store.getItem(k); return v ? (JSON.parse(v) as T) : null } catch { return null }
  }
  private write() {
    try {
      this.store.setItem(`${this.key}:pending`, JSON.stringify(this.entries))
      this.store.setItem(`${this.key}:rejected`, JSON.stringify(this.rejections.slice(-200)))
    } catch { /* storage full or blocked: the queue lives in memory until the next write */ }
    this.emit()
  }
  private emit() { const s = this.state(); this.listeners.forEach((l) => l(s)) }

  state(): OutboxState {
    return { pending: this.entries.length, rejected: this.rejections.length, offline: this.offline, flushing: this.flushing, lastSyncAt: this.lastSyncAt }
  }
  subscribe(l: Listener): () => void { this.listeners.add(l); l(this.state()); return () => this.listeners.delete(l) }
  pending(): Entry[] { return [...this.entries] }
  rejected(): Rejection[] { return [...this.rejections] }
  clearRejection(id: string) { this.rejections = this.rejections.filter((r) => r.cmd.id !== id); this.write() }

  enqueue(cmds: Command[]) {
    const now = new Date().toISOString()
    for (const cmd of cmds) this.entries.push({ cmd, queued_at: now, tries: 0 })
    this.write()
  }

  /** Pushes the queue in order, at most 50 commands per call. Returns true when the queue is empty afterwards. */
  async flush(send: Send): Promise<boolean> {
    if (this.flushing) return this.entries.length === 0
    this.flushing = true
    this.emit()
    try {
      while (this.entries.length > 0) {
        const batch = this.entries.slice(0, 50)
        let res: { results: IngestResult[]; rev: number }
        try {
          res = await send(batch.map((e) => e.cmd))
        } catch (e) {
          // network or auth: keep everything, try again later
          this.offline = true
          for (const b of batch) b.tries += 1
          this.write()
          console.warn('outbox: send failed', e)
          return false
        }
        this.offline = false
        this.lastSyncAt = new Date().toISOString()
        if (this.onRev) this.onRev(res.rev)
        const byId = new Map(res.results.map((r) => [r.id, r]))
        let stop = false
        for (const entry of batch) {
          const r = byId.get(entry.cmd.id)
          if (!r || r.status === 'retry') { entry.tries += 1; stop = true; break }
          if (r.status === 'accepted' || r.status === 'duplicate') {
            this.entries = this.entries.filter((e) => e.cmd.id !== entry.cmd.id)
            if (r.status === 'accepted' && r.alerts && r.alerts.length > 0 && this.onAlerts) this.onAlerts(entry.cmd, r.alerts)
          } else {
            this.entries = this.entries.filter((e) => e.cmd.id !== entry.cmd.id)
            this.rejections.push({ cmd: entry.cmd, queued_at: entry.queued_at, rejected_at: new Date().toISOString(), reason: r.reason ?? 'rejected', detail: r.detail })
          }
        }
        this.write()
        if (stop) return false
      }
      return true
    } finally {
      this.flushing = false
      this.emit()
    }
  }
}
