/** No look-alikes: 23 characters, 12,167 three-character codes a day. Same alphabet as security_codes.code in Postgres. */
export const CODE_ALPHABET = 'ACDEFHJKMNPRTUVWXY34679'

export function isSecurityCode(s: unknown): s is string {
  return typeof s === 'string' && /^[ACDEFHJKMNPRTUVWXY34679]{3,4}$/.test(s)
}

/** A random code; the server rejects collisions, the station retries. */
export function randomCode(length = 3, rng: () => number = Math.random): string {
  let out = ''
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length) % CODE_ALPHABET.length]
  return out
}

/**
 * The no-server fallback: a station-slot prefix (one alphabet character
 * assigned to the station) plus three characters, unique by construction
 * within the station as long as it does not repeat the suffix that day.
 */
export function offlineCode(slotPrefix: string, used: Set<string>, rng: () => number = Math.random): string {
  if (slotPrefix.length !== 1 || !CODE_ALPHABET.includes(slotPrefix)) throw new Error('slot prefix must be one alphabet character')
  for (let i = 0; i < 20_000; i++) {
    const c = slotPrefix + randomCode(3, rng)
    if (!used.has(c)) {
      used.add(c)
      return c
    }
  }
  throw new Error('offline codes exhausted')
}
