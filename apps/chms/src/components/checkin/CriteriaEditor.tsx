'use client'

import { isCriteria, type Criteria, type Rule } from '@btf/core'
import { RemoveGlyph, SegmentedControl, Switch } from '../ui'

const KINDS: { value: Rule['kind']; label: string }[] = [
  { value: 'age_months', label: 'Age in months' },
  { value: 'age_years', label: 'Age in years' },
  { value: 'grade', label: 'Grade' },
  { value: 'birthdate', label: 'Born between' },
  { value: 'gender', label: 'Gender' },
  { value: 'tag', label: 'Tag' },
  { value: 'custom_field', label: 'Custom field' },
]
export const GRADES: { value: number; label: string }[] = [
  { value: -1, label: 'Pre-K' }, { value: 0, label: 'K' },
  ...Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}` })),
]

function blank(kind: Rule['kind']): Rule {
  switch (kind) {
    case 'age_months': return { kind, min: 0, min_inclusive: true, max: 12, max_inclusive: false, measured_on: 'occurrence' }
    case 'age_years': return { kind, min: 3, min_inclusive: true, max: 4, max_inclusive: false, measured_on: 'occurrence' }
    case 'grade': return { kind, min: 0, min_inclusive: true, max: 0, max_inclusive: true }
    case 'birthdate': return { kind, min: '2020-01-01', min_inclusive: true, max: '2020-12-31', max_inclusive: true }
    case 'gender': return { kind, value: 'female' }
    case 'tag': return { kind, value: 'guest' }
    case 'custom_field': return { kind, key: '', value: true }
  }
}

/** The criteria in words, for lists and labels. */
export function describeCriteria(c: unknown): string {
  if (!isCriteria(c)) return 'Invalid criteria'
  if (c.manual_only) return 'Staff picks'
  const parts = c.rules.map(describeRule)
  return parts.join(c.match === 'any' ? ' or ' : '; ')
}

function bound(r: { min?: number | string; max?: number | string; min_inclusive?: boolean; max_inclusive?: boolean }, fmt: (v: number | string) => string): string {
  const lo = r.min !== undefined ? `${r.min_inclusive ? 'from' : 'over'} ${fmt(r.min)}` : ''
  const hi = r.max !== undefined ? `${r.max_inclusive ? 'to' : 'under'} ${fmt(r.max)}` : ''
  return [lo, hi].filter(Boolean).join(' ')
}

export function describeRule(r: Rule): string {
  switch (r.kind) {
    case 'age_months': return `${bound(r, (v) => `${v} months`)} (${r.measured_on === 'cutoff' ? 'at the cutoff' : 'on the service date'})`
    case 'age_years': return `${bound(r, (v) => `${v} years`)} (${r.measured_on === 'cutoff' ? 'at the cutoff' : 'on the service date'})`
    case 'grade': return `grade ${bound(r, (v) => GRADES.find((g) => g.value === v)?.label ?? String(v))}`
    case 'birthdate': return `born ${bound(r, (v) => String(v))}`
    case 'gender': return r.value === 'female' ? 'girls' : 'boys'
    case 'tag': return `tagged ${r.value}`
    case 'custom_field': return `${r.key} = ${String(r.value)}`
  }
}

export function CriteriaEditor({ value, onChange, fields }: { value: Criteria; onChange: (c: Criteria) => void; fields: { key: string; label: string }[] }) {
  const rules = value.rules
  const set = (i: number, r: Rule) => onChange({ ...value, rules: rules.map((x, j) => (j === i ? r : x)) })
  const remove = (i: number) => onChange({ ...value, rules: rules.filter((_, j) => j !== i) })
  const manual = value.manual_only === true
  return (
    <fieldset>
      <legend className="group-head">Who lands here</legend>
      <div className="group">
        <div className="field"><Switch label="Staff picks (no automatic match)" checked={manual} onChange={(on) => onChange({ ...value, manual_only: on, rules: on ? [] : rules })} /></div>
        {!manual && rules.length > 1 && (
          <div className="field"><span>Match</span>
            <SegmentedControl label="Match" name="match" value={value.match ?? 'all'} options={[{ value: 'all', label: 'All rules' }, { value: 'any', label: 'Any rule' }]} onChange={(m) => onChange({ ...value, match: m })} />
          </div>
        )}
      </div>
      {!manual && (
        <ul className="group rules">
          {rules.map((r, i) => (
            <li key={i} className="cell rule">
              <button type="button" className="remove-btn" aria-label={`Remove rule ${i + 1}: ${describeRule(r)}`} onClick={() => remove(i)}><RemoveGlyph /></button>
              <div className="rule-body">
                <select className="popup" aria-label="Rule kind" value={r.kind} onChange={(e) => set(i, blank(e.target.value as Rule['kind']))}>
                  {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
                <RuleFields rule={r} onChange={(x) => set(i, x)} fields={fields} />
              </div>
            </li>
          ))}
          <li className="cell">
            <select className="row-select action" aria-label="Add a rule" value="" onChange={(e) => e.target.value && onChange({ ...value, rules: [...rules, blank(e.target.value as Rule['kind'])] })}>
              <option value="">Add a rule…</option>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </li>
        </ul>
      )}
    </fieldset>
  )
}

function RuleFields({ rule, onChange, fields }: { rule: Rule; onChange: (r: Rule) => void; fields: { key: string; label: string }[] }) {
  if (rule.kind === 'age_months' || rule.kind === 'age_years') {
    const unit = rule.kind === 'age_months' ? 'months' : 'years'
    return (
      <div className="rule-row">
        <select className="popup" aria-label="Lower bound" value={rule.min === undefined ? 'none' : rule.min_inclusive ? 'from' : 'after'}
          onChange={(e) => onChange(withLower(rule, e.target.value, 0))}>
          <option value="none">Any age</option><option value="from">From</option><option value="after">Over</option>
        </select>
        {rule.min !== undefined && <input type="number" min={0} aria-label={`Lower ${unit}`} value={rule.min} onChange={(e) => onChange({ ...rule, min: Number(e.target.value) })} />}
        <select className="popup" aria-label="Upper bound" value={rule.max === undefined ? 'none' : rule.max_inclusive ? 'to' : 'under'}
          onChange={(e) => onChange(withUpper(rule, e.target.value, 12))}>
          <option value="none">No limit</option><option value="to">To</option><option value="under">Under</option>
        </select>
        {rule.max !== undefined && <input type="number" min={0} aria-label={`Upper ${unit}`} value={rule.max} onChange={(e) => onChange({ ...rule, max: Number(e.target.value) })} />}
        <span className="muted">{unit}</span>
        <select className="popup" aria-label="Measured on" value={rule.measured_on} onChange={(e) => onChange({ ...rule, measured_on: e.target.value as 'occurrence' | 'cutoff' })}>
          <option value="occurrence">on the service date</option><option value="cutoff">at the cutoff</option>
        </select>
      </div>
    )
  }
  if (rule.kind === 'grade') {
    return (
      <div className="rule-row">
        <span className="muted">From</span>
        <select className="popup" aria-label="Lowest grade" value={rule.min ?? 'none'} onChange={(e) => onChange(e.target.value === 'none' ? strip(rule, 'min') : { ...rule, min: Number(e.target.value), min_inclusive: true })}>
          <option value="none">Any</option>{GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <span className="muted">to</span>
        <select className="popup" aria-label="Highest grade" value={rule.max ?? 'none'} onChange={(e) => onChange(e.target.value === 'none' ? strip(rule, 'max') : { ...rule, max: Number(e.target.value), max_inclusive: true })}>
          <option value="none">Any</option>{GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </div>
    )
  }
  if (rule.kind === 'birthdate') {
    return (
      <div className="rule-row">
        <input type="date" aria-label="Born on or after" value={rule.min ?? ''} data-empty={!rule.min} onChange={(e) => onChange(e.target.value ? { ...rule, min: e.target.value, min_inclusive: true } : strip(rule, 'min'))} />
        <span className="muted">and</span>
        <input type="date" aria-label="Born on or before" value={rule.max ?? ''} data-empty={!rule.max} onChange={(e) => onChange(e.target.value ? { ...rule, max: e.target.value, max_inclusive: true } : strip(rule, 'max'))} />
      </div>
    )
  }
  if (rule.kind === 'gender') {
    return (
      <select className="popup" aria-label="Gender" value={rule.value} onChange={(e) => onChange({ ...rule, value: e.target.value as 'male' | 'female' })}>
        <option value="female">Girls</option><option value="male">Boys</option>
      </select>
    )
  }
  if (rule.kind === 'tag') {
    return <input aria-label="Tag" value={rule.value} placeholder="Tag" onChange={(e) => onChange({ ...rule, value: e.target.value })} />
  }
  return (
    <div className="rule-row">
      <select className="popup" aria-label="Field" value={rule.key} onChange={(e) => onChange({ ...rule, key: e.target.value })}>
        <option value="">Field…</option>{fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <span className="muted">equals</span>
      <input aria-label="Value" value={String(rule.value)} onChange={(e) => onChange({ ...rule, value: parse(e.target.value) })} />
    </div>
  )
}

type Ranged = Extract<Rule, { kind: 'age_months' | 'age_years' }>
function withLower(r: Ranged, mode: string, dflt: number): Ranged {
  if (mode === 'none') return strip(r, 'min') as Ranged
  return { ...r, min: r.min ?? dflt, min_inclusive: mode === 'from' }
}
function withUpper(r: Ranged, mode: string, dflt: number): Ranged {
  if (mode === 'none') return strip(r, 'max') as Ranged
  return { ...r, max: r.max ?? dflt, max_inclusive: mode === 'to' }
}
function strip<R extends Rule>(r: R, side: 'min' | 'max'): R {
  const copy = { ...r } as Record<string, unknown>
  delete copy[side]
  delete copy[`${side}_inclusive`]
  return copy as R
}
function parse(v: string): string | number | boolean {
  if (v === 'true') return true
  if (v === 'false') return false
  if (v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return v
}
