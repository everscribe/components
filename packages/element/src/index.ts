import { AuditTrailElement } from './AuditTrailElement.js'

export { AuditTrailElement } from './AuditTrailElement.js'
export type { Theme, DefaultTimeRange } from './AuditTrailElement.js'

// Auto-register on import. Idempotent — re-importing in another bundle
// won't throw. Skipped on the server where customElements is undefined.
if (typeof customElements !== 'undefined' && !customElements.get('audit-trail')) {
  customElements.define('audit-trail', AuditTrailElement)
}

declare global {
  interface HTMLElementTagNameMap {
    'audit-trail': AuditTrailElement
  }
}
