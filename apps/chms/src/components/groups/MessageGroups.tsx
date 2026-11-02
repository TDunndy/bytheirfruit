'use client'

// Email / Text buttons: pull the addresses (logged in Postgres), open the
// leader's own mail or Messages app, or copy the list. Church-sent messages
// arrive with Phase 3 and will use the same resolver.
import { useState } from 'react'
import { errorMessage } from '@/lib/people'
import { groupContacts, mailtoLink, smsLink, type GroupContact } from '@/lib/groups'

export function MessageGroups({ groupIds, title, compact = false }: { groupIds: string[]; title: string; compact?: boolean }) {
  const [channel, setChannel] = useState<'email' | 'sms' | null>(null)
  const [contacts, setContacts] = useState<GroupContact[] | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const pull = async (c: 'email' | 'sms') => {
    setChannel(c); setContacts(null); setError(''); setCopied(false)
    try { setContacts(await groupContacts(groupIds, c)) } catch (e) { setError(errorMessage(e)) }
  }
  const values = contacts?.map((x) => x.value) ?? []
  const link = channel === 'email' ? mailtoLink(values, title) : smsLink(values, '')
  const copy = () => { navigator.clipboard?.writeText(values.join(channel === 'email' ? ', ' : ', ')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }

  return (
    <div className="stack">
      <div className="row">
        <button type="button" className={`btn btn-tinted${compact ? ' btn-small' : ''}`} disabled={groupIds.length === 0} onClick={() => pull('email')}>Email {groupIds.length > 1 ? 'groups' : 'group'}</button>
        <button type="button" className={`btn btn-tinted${compact ? ' btn-small' : ''}`} disabled={groupIds.length === 0} onClick={() => pull('sms')}>Text {groupIds.length > 1 ? 'groups' : 'group'}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {channel && contacts && (
        <div className="card" role="region" aria-label={channel === 'email' ? 'Email addresses' : 'Phone numbers'}>
          {contacts.length === 0 ? <p className="muted">Nobody in {groupIds.length > 1 ? 'these groups' : 'this group'} has {channel === 'email' ? 'an email address' : 'a mobile number'} on file.</p> : (
            <>
              <p className="muted small">{contacts.length} {channel === 'email' ? (contacts.length === 1 ? 'address' : 'addresses') : (contacts.length === 1 ? 'number' : 'numbers')} · children are reached through their parents · opens your own {channel === 'email' ? 'mail app with everyone in BCC' : 'Messages app'}.</p>
              <div className="row" style={{ margin: '8px 0 12px' }}>
                <a className="btn btn-filled" href={link}>{channel === 'email' ? 'Open mail' : 'Open Messages'}</a>
                <button type="button" className="btn btn-tinted" onClick={copy}>{copied ? 'Copied' : 'Copy list'}</button>
                <button type="button" className="btn btn-plain" onClick={() => setChannel(null)}>Close</button>
              </div>
              <ul className="chips">{contacts.map((c) => <li key={c.value} className="chip" title={c.display_name}>{c.display_name}{c.for_person_id !== c.person_id ? ' (parent)' : ''}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
