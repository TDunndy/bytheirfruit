// Billing switch. Off during the beta (2026-10-24): every claimed church gets
// the full dashboard free and no price or payment button is shown. Turning it
// back on restores the Payment Link redirect after a verified claim, the
// subscription gate on the dashboard and the price card (ADR-0003).
export const BILLING_ENABLED = false

const PAYMENT_LINK = 'https://buy.stripe.com/14A7sL0wA03Ggr9epO4ow00'

export function paymentUrl(email: string, userId: string): string {
  return `${PAYMENT_LINK}?prefilled_email=${encodeURIComponent(email)}&client_reference_id=${encodeURIComponent(userId)}`
}
