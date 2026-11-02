// The station's block of security codes for the day (allocate_codes). Drawn
// ahead of time so a pass can be issued while the Wi-Fi is down; held in
// localStorage; reconciled with the server's list at boot.
import { allocateCodes, heldCodes } from './api'

const KEY = 'btf-codes'
const LOW = 15
const DRAW = 40

interface Block { local_date: string; codes: string[] }

function read(): Block | null {
  try { const v = localStorage.getItem(KEY); return v ? (JSON.parse(v) as Block) : null } catch { return null }
}
function write(b: Block) { try { localStorage.setItem(KEY, JSON.stringify(b)) } catch { /* no storage */ } }

export class CodeBlock {
  private block: Block
  constructor(private stationId: string, private localDate: string) {
    const b = read()
    this.block = b && b.local_date === localDate ? b : { local_date: localDate, codes: [] }
  }
  count(): number { return this.block.codes.length }

  /** Syncs with the server's record of this station's unissued codes, then tops the block up. */
  async refresh(): Promise<void> {
    try {
      const server = await heldCodes(this.stationId, this.localDate)
      if (server.length > 0) this.block = { local_date: this.localDate, codes: server }
    } catch (e) { console.warn('codes: could not read the held block', e) }
    await this.topUp()
  }
  async topUp(): Promise<void> {
    if (this.block.codes.length >= LOW) { write(this.block); return }
    try {
      const fresh = await allocateCodes(this.localDate, DRAW)
      const have = new Set(this.block.codes)
      this.block = { local_date: this.localDate, codes: [...this.block.codes, ...fresh.filter((c) => !have.has(c))] }
    } catch (e) { console.warn('codes: could not draw a block', e) }
    write(this.block)
  }
  /** The next unused code, or null when the block is empty (the pass is then issued without a code and the label says so). */
  take(): string | null {
    const c = this.block.codes.shift() ?? null
    write(this.block)
    if (this.block.codes.length < LOW) void this.topUp()
    return c
  }
}
