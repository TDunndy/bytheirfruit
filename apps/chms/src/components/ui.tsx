// Small presentational building blocks shared by every screen: icons, avatars,
// back links and the two custom controls (segmented control, switch). They hold
// no data logic; each one wraps a native element so keyboards and screen readers
// get the browser's own behaviour.
import Link from 'next/link'
import type { CSSProperties } from 'react'

// ----------------------------------------------------------------- icons --
// 24px grid, drawn with a 1.8px round stroke so every glyph has the same weight.
const ICONS = {
  people: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  groups: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1m1-6h1a5 5 0 0 1 5 5v1',
  events: 'M8 3v3m8-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  health: 'M20.8 5.6a5 5 0 0 0-7.6.6L12 7.4l-1.2-1.2a5 5 0 1 0-7.1 7.1L12 21.6l8.3-8.3a5 5 0 0 0 .5-7.7z',
  search: 'M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4.5-4.5',
  plus: 'M12 5v14M5 12h14',
  house: 'M4 10.5 12 4l8 6.5M6 9v10h12V9M10 19v-5h4v5',
  board: 'M7 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm10 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 21v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6m2 0v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6',
  planned: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 7.5V12l3 2',
  church: 'M12 2v4m-2-2h4M7 21v-8l5-4 5 4v8M4 21h16M10 21v-4h4v4',
  signout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3',
} as const

// Filled variants for the tab bar's selected tab (closed shapes, drawn with the same stroke).
const FILLED: Partial<Record<keyof typeof ICONS, string>> = {
  people: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1z',
  groups: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1zm15-6h1a5 5 0 0 1 5 5v1h-5v-1a6 6 0 0 0-1-5z',
  events: 'M8 3v3m8-3v3M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  health: 'M20.8 5.6a5 5 0 0 0-7.6.6L12 7.4l-1.2-1.2a5 5 0 1 0-7.1 7.1L12 21.6l8.3-8.3a5 5 0 0 0 .5-7.7z',
}

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 20, className, filled = false }: { name: IconName; size?: number; className?: string; filled?: boolean }) {
  const d = filled ? FILLED[name] ?? ICONS[name] : ICONS[name]
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  )
}

/** Disclosure chevron at the end of a tappable row. */
export function Chevron() {
  return (
    <svg className="chev" width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M1.5 1.5 6.5 7l-5 5.5" />
    </svg>
  )
}

/**
 * Destructive "remove" glyph: a white minus on a red disc, shown at the leading edge of a row
 * (as in a list's edit mode). For buttons that already carry an aria-label.
 */
export function RemoveGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="10" className="remove-disc" />
      <path d="M6.5 11h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Activity indicator that screen readers announce as "Loading". */
export function Spinner() {
  return <div className="spinner" role="status"><span className="sr-only">Loading</span></div>
}

// --------------------------------------------------------------- avatars --
/** Up to two initials: the first letter of the first and the last word. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = Array.from(words[0])[0] ?? ''
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] ?? '' : ''
  return (first + last).toUpperCase()
}

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'

/** Contact-style avatar: initials on a gray gradient. Decorative; the name is always next to it. */
export function Avatar({ name, size = 'md' }: { name: string; size?: AvatarSize }) {
  return <span className={`avatar avatar-${size}`} aria-hidden="true">{initials(name)}</span>
}

/** Rounded-square tile with a glyph, for rows that are not a person (a family, a board, a church). */
export function IconTile({ name }: { name: IconName }) {
  return <span className="icon-tile" aria-hidden="true"><Icon name={name} size={18} /></span>
}

/** App icon: the drop on a rounded square. */
export function AppIcon({ size = 28 }: { size?: number }) {
  return (
    <svg className="app-icon" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="7.2" className="app-icon-tile" />
      <path d="M16 6C16 6 10 13 10 18C10 21.3 12.7 24 16 24C19.3 24 22 21.3 22 18C22 13 16 6 16 6Z" className="app-icon-drop" />
    </svg>
  )
}

// ------------------------------------------------------------ navigation --
/** "‹ People": a back link in the accent color. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="back">
      <svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M9.5 2 2 10l7.5 8" />
      </svg>
      {label}
    </Link>
  )
}

// -------------------------------------------------------------- controls --
/**
 * Search field: filled, borderless, with a magnifying glass. Extra props go to the <input>.
 * The wrapper is a <label> so its padding (the 44px touch target on phones) focuses the input.
 */
export function SearchField({ className, ...input }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="search-field">
      <Icon name="search" size={17} />
      <input type="search" className={className} autoComplete="off" {...input} />
    </label>
  )
}

/**
 * Segmented control built on native radio buttons: Tab moves into the group,
 * arrow keys change the choice, and screen readers announce "radio, 2 of 5".
 */
export function SegmentedControl<T extends string>({ label, name, value, options, onChange }: {
  label: string
  name: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const style = { '--count': options.length, '--index': index } as CSSProperties
  return (
    <div className="segmented" role="radiogroup" aria-label={label} style={style}>
      <span className="segment-thumb" aria-hidden="true" />
      {options.map((o) => (
        <label key={o.value} className="segment">
          <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  )
}

/** On/off switch: a real checkbox with role="switch", labelled by the text beside it. */
export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="switch-label">
      <span>{label}</span>
      <span className="switch">
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch-track" aria-hidden="true" />
      </span>
    </label>
  )
}
