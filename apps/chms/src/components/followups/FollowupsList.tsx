'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useSession } from '@/components/Session'
import { PersonPicker } from '@/components/PersonPicker'
import { IconTile, SegmentedControl, Spinner } from '@/components/ui'
import { errorMessage } from '@/lib/people'
import { arrivedText, assigneeText, closeTask, fmtDate, listTasks, reassignTask, taskContext, type Task, type TaskContext } from '@/lib/followups'

export function FollowupsList() {
  const { org, can } = useSession()
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [ctx, setCtx] = useState<TaskContext | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    if (!org) return
    try {
      const t = await listTasks(org.id, tab)
      setTasks(t); setCtx(await taskContext(org.id, t)); setError('')
    } catch (e) { setError(errorMessage(e)) }
  }, [org, tab])
  useEffect(() => { load() }, [load])
  const act = async (fn: () => Promise<unknown>, done: string) => { setStatus(''); try { await fn(); await load(); setStatus(done) } catch (e) { setError(errorMessage(e)) } }

  if (!org) return null
  const count = tasks ? `${tasks.length} ${tab === 'open' ? 'open' : 'closed'}` : 'Loading…'
  return (
    <section>
      <header className="page-head">
        <div className="page-title"><h1>Follow-ups</h1><p className="page-sub">{count}</p></div>
      </header>
      <p className="sr-only" role="status">{status}</p>
      <div className="toolbar"><div className="toolbar-row">
        <SegmentedControl label="Status" name="task-status" value={tab} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]} onChange={setTab} />
      </div></div>
      {error && <p className="error" role="alert">{error}</p>}
      {!tasks || !ctx ? <Spinner /> : tasks.length === 0 ? (
        <div className="card empty"><p className="muted">{tab === 'open' ? 'Nothing to follow up. A new family’s first check-in opens a task here for the right director.' : 'No closed follow-ups yet.'}</p></div>
      ) : (
        <ul className="group">
          {tasks.map((t) => <TaskRow key={t.id} task={t} ctx={ctx} orgId={org.id} canReassign={can('checkin.manage')} onAct={act} />)}
        </ul>
      )}
      <p className="group-foot">Routed by the child&apos;s room or age to that area&apos;s director, otherwise to the church&apos;s default assignee (Check-in → Settings).</p>
    </section>
  )
}

function TaskRow({ task: t, ctx, orgId, canReassign, onAct }: { task: Task; ctx: TaskContext; orgId: string; canReassign: boolean; onAct: (fn: () => Promise<unknown>, done: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [reassigning, setReassigning] = useState(false)
  const family = t.subject_household_id ? ctx.householdName.get(t.subject_household_id) : null
  const person = t.subject_person_id ? ctx.personName.get(t.subject_person_id) : null
  const title = t.kind === 'manual' ? t.title ?? 'Task' : family ?? person ?? 'A family'
  const kids = t.subject_household_id ? ctx.children.get(t.subject_household_id) ?? [] : []
  const href = t.subject_household_id ? `/households/view?id=${t.subject_household_id}` : t.subject_person_id ? `/people/view?id=${t.subject_person_id}` : null
  const overdue = t.status === 'open' && t.due_on && t.due_on < new Date().toISOString().slice(0, 10)
  return (
    <li className="cell task-row">
      <IconTile name="tasks" />
      <span className="cell-text">
        <span className="cell-title">
          {href ? <Link href={href}>{title}</Link> : title}
          {t.kind === 'first_visit' && <span className="chip chip-tint" style={{ marginLeft: 8 }}>First visit</span>}
          {t.area_id && <span className="chip" style={{ marginLeft: 8 }}>{ctx.areaName.get(t.area_id) ?? 'Area'}</span>}
          {overdue && <span className="chip chip-warn" style={{ marginLeft: 8 }}>Due {fmtDate(t.due_on!)}</span>}
        </span>
        <span className="cell-sub">
          {kids.length > 0 && <>{kids.map((k) => `${k.name}${k.age !== null ? ` (${k.age})` : ''}`).join(', ')} · </>}
          {arrivedText(t, ctx)} · {assigneeText(t, ctx)}
          {t.status !== 'open' && <> · {t.status === 'done' ? 'Done' : 'Dismissed'}{t.closed_by_person_id ? ` by ${ctx.personName.get(t.closed_by_person_id) ?? 'someone'}` : ''}{t.close_note ? ` · ${t.close_note}` : ''}</>}
        </span>
        {open && t.status === 'open' && (
          <span className="task-actions">
            <input className="task-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional): called, visited, invited to…" maxLength={2000} aria-label="Note" />
            <span className="row">
              <button className="btn btn-filled btn-small" onClick={() => onAct(() => closeTask(t.id, 'done', note.trim() || null), 'Marked done')}>Done</button>
              <button className="btn btn-tinted btn-small" onClick={() => onAct(() => closeTask(t.id, 'dismissed', note.trim() || null), 'Dismissed')}>Dismiss</button>
              {canReassign && <button className="btn btn-plain btn-small" onClick={() => setReassigning((r) => !r)}>Reassign</button>}
            </span>
            {reassigning && (
              <span className="row">
                <select className="popup" aria-label="Assign to a role" value={t.assignee_role_id ?? ''} onChange={(e) => e.target.value && onAct(() => reassignTask(t.id, { roleId: e.target.value }), 'Reassigned')}>
                  <option value="">A role…</option>{ctx.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <PersonPicker orgId={orgId} placeholder="Or a person" onPick={(p) => onAct(() => reassignTask(t.id, { personId: p.id }), 'Reassigned')} />
              </span>
            )}
          </span>
        )}
      </span>
      {t.status === 'open' && <button className="btn btn-plain btn-small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Close' : 'Work it'}</button>}
    </li>
  )
}
