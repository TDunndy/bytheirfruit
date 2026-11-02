// A big phone keypad: digits, backspace, and an optional action key.
export function Keypad({ onDigit, onBackspace, onClear, action, onAction, disabled }: {
  onDigit: (d: string) => void
  onBackspace: () => void
  onClear?: () => void
  action?: string
  onAction?: () => void
  disabled?: boolean
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  return (
    <div className="keypad" role="group" aria-label="Keypad">
      {keys.map((k) => <button key={k} type="button" className="key" onClick={() => onDigit(k)} disabled={disabled}>{k}</button>)}
      <button type="button" className="key soft" onClick={onClear} disabled={disabled || !onClear}>Clear</button>
      <button type="button" className="key" onClick={() => onDigit('0')} disabled={disabled}>0</button>
      {action ? <button type="button" className="key soft" onClick={onAction} disabled={disabled}>{action}</button>
        : <button type="button" className="key soft" onClick={onBackspace} disabled={disabled} aria-label="Backspace">⌫</button>}
    </div>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <span className="spacer" />
          <button type="button" className="btn btn-plain" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}
