import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { DistinctValues } from '../hooks/useDistinctValues.js'
import { useNLP, type NLPErrorReason } from '../hooks/useNLP.js'
import type { EmbedClaims } from '@everscribe/components-core'

export type TimeRangePreset = '24h' | '7d' | '30d' | 'custom' | 'all'
export type FilterTab = 'ai' | 'filters' | 'query'

export interface FilterValues {
  range: TimeRangePreset
  // since / before are only meaningful when range === 'custom'.
  // Stored as datetime-local strings (YYYY-MM-DDTHH:mm) — the parent
  // converts to ISO before sending to the API.
  since?: string
  before?: string
  action?: string
  actor?: string
  actorType?: string
  tenantId?: string
  targetType?: string
  targetId?: string
  resultStatus?: string
  originIP?: string
  // q is the DSL query — set from the Query tab (user input) or
  // the AI tab (model-translated). Active filter chips parse this.
  q?: string
  // NLP echo fields — set when the AI tab produced the current q.
  // Render the "Translated to:" banner from these.
  nlpQ?: string
  nlpExplanation?: string
  nlpUnsupported?: string[]
}

export interface FiltersPanelProps {
  value: FilterValues
  onChange: (next: FilterValues) => void
  distinct: DistinctValues
  claims: EmbedClaims | null
  apiBase: string
  token: string | null
  tokenEndpoint?: string
  onTokenExpired?: () => Promise<string>
}

const TIME_PRESETS: ReadonlyArray<{ key: TimeRangePreset; label: string }> = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'custom', label: 'Custom' },
  { key: 'all', label: 'All' },
]

// pickInitialTab figures out which tab to show on first render. NLP
// echo wins (the user just submitted a NL query); then DSL (they
// were composing one); then column filters; else AI when available.
function pickInitialTab(v: FilterValues, claims: EmbedClaims | null): FilterTab {
  if (v.nlpQ && claims?.allow_nlp) return 'ai'
  if (v.q && claims?.allow_dsl_input) return 'query'
  if (hasAnyColumnFilter(v)) return 'filters'
  if (claims?.allow_nlp) return 'ai'
  return 'filters'
}

export function FiltersPanel({
  value,
  onChange,
  distinct,
  claims,
  apiBase,
  token,
  tokenEndpoint,
  onTokenExpired,
}: FiltersPanelProps) {
  const allowNLP = !!claims?.allow_nlp
  const allowDSL = !!claims?.allow_dsl_input

  const [activeTab, setActiveTab] = useState<FilterTab>(() =>
    pickInitialTab(value, claims),
  )

  // Re-sync the active tab when the AI banner appears (user just
  // submitted a NL query) so the explanation lands in the right tab.
  useEffect(() => {
    if (value.nlpQ && allowNLP) setActiveTab('ai')
  }, [value.nlpQ, allowNLP])

  return (
    <div className="audit-trail-filter-panel">
      <div className="audit-trail-filter-modes" role="tablist" aria-label="Filter mode">
        {allowNLP && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ai'}
            className={tabClass(activeTab === 'ai')}
            onClick={() => setActiveTab('ai')}
          >
            AI
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'filters'}
          className={tabClass(activeTab === 'filters')}
          onClick={() => setActiveTab('filters')}
        >
          Filters
        </button>
        {allowDSL && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'query'}
            className={tabClass(activeTab === 'query')}
            onClick={() => setActiveTab('query')}
          >
            Query
          </button>
        )}
      </div>

      {activeTab === 'ai' && allowNLP && (
        <AITabPanel
          value={value}
          onChange={onChange}
          apiBase={apiBase}
          token={token}
          tokenEndpoint={tokenEndpoint}
          onTokenExpired={onTokenExpired}
        />
      )}
      {activeTab === 'filters' && (
        <FiltersTabPanel value={value} onChange={onChange} distinct={distinct} />
      )}
      {activeTab === 'query' && allowDSL && (
        <QueryTabPanel value={value} onChange={onChange} />
      )}
    </div>
  )
}

function tabClass(active: boolean): string {
  return active
    ? 'audit-trail-filter-mode audit-trail-filter-mode-selected'
    : 'audit-trail-filter-mode'
}

// ============================================================
// AI tab
// ============================================================

interface AITabProps {
  value: FilterValues
  onChange: (next: FilterValues) => void
  apiBase: string
  token: string | null
  tokenEndpoint?: string
  onTokenExpired?: () => Promise<string>
}

function AITabPanel({
  value,
  onChange,
  apiBase,
  token,
  tokenEndpoint,
  onTokenExpired,
}: AITabProps) {
  const [draft, setDraft] = useState(value.nlpQ ?? '')
  const nlp = useNLP({ apiBase, token, tokenEndpoint, onTokenExpired })

  // When the NLP call lands successfully, fold the translated DSL
  // into the FilterValues so the parent refetches with it applied.
  // Track which result we last applied so we don't re-apply on
  // unrelated re-renders.
  const lastAppliedRef = useRef<string | null>(null)
  useEffect(() => {
    if (nlp.state.phase !== 'ready') return
    const sig = nlp.state.query + '|' + (nlp.state.result.dsl ?? '')
    if (lastAppliedRef.current === sig) return
    lastAppliedRef.current = sig
    onChange({
      ...value,
      q: nlp.state.result.dsl || undefined,
      nlpQ: nlp.state.query,
      nlpExplanation: nlp.state.result.explanation,
      nlpUnsupported: nlp.state.result.unsupported,
    })
  }, [nlp.state, onChange, value])

  const isBusy = nlp.state.phase === 'loading'
  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      void nlp.submit(draft)
    },
    [draft, nlp],
  )

  return (
    <form className="audit-trail-nlp-form" onSubmit={handleSubmit}>
      <label className="audit-trail-nlp-label" htmlFor="audit-trail-nlp-input">
        Ask in plain English
        <span className="audit-trail-badge audit-trail-badge-info" title="Beta">
          Beta
        </span>
      </label>
      <input
        id="audit-trail-nlp-input"
        type="text"
        className="audit-trail-nlp-input"
        placeholder="e.g. failed logins last 24 hours"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={500}
        aria-label="Natural-language filter query"
        disabled={isBusy}
      />

      {value.q && value.nlpQ && (
        <div className="audit-trail-nlp-banner">
          <p>
            <strong>Translated to:</strong>{' '}
            <code className="audit-trail-nlp-translated">{value.q}</code>
          </p>
        </div>
      )}

      {nlp.state.phase === 'error' && (
        <div className="audit-trail-error">{nlpErrorMessage(nlp.state.error)}</div>
      )}

      {value.nlpUnsupported && value.nlpUnsupported.length > 0 && (
        <div className="audit-trail-error audit-trail-nlp-unsupported">
          <ul>
            {value.nlpUnsupported.map((u, i) => (
              <li key={i}>Couldn&apos;t apply: {u}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="audit-trail-filter-actions">
        <button
          type="submit"
          className="audit-trail-button audit-trail-button-secondary"
          disabled={!draft.trim() || isBusy}
        >
          {isBusy ? (
            <>
              <span className="audit-trail-button-spinner" /> Translating&hellip;
            </>
          ) : (
            'Search'
          )}
        </button>
      </div>
    </form>
  )
}

function nlpErrorMessage(reason: NLPErrorReason): string {
  switch (reason) {
    case 'not_configured':
      return "Natural-language filtering isn't configured on this server."
    case 'not_allowed':
      return 'This embed token does not permit natural-language queries.'
    case 'rate_limited':
      return "You've hit the per-hour limit. Try again in a few minutes."
    case 'provider_busy':
      return 'The natural-language service is busy right now. Try again in a moment.'
    case 'bad_request':
      return "That query couldn't be processed. Try rephrasing."
    default:
      return "Couldn't process that query. Try simpler terms."
  }
}

// ============================================================
// Filters tab
// ============================================================

interface FiltersTabProps {
  value: FilterValues
  onChange: (next: FilterValues) => void
  distinct: DistinctValues
}

function FiltersTabPanel({ value, onChange, distinct }: FiltersTabProps) {
  // Local draft state for every column filter. Nothing commits until
  // the user clicks "Add filters" — mirroring the dashboard's
  // explicit-submit UX. Time-range presets are the one exception:
  // they apply immediately because they're a view selector, not a
  // filter.
  const [draftSince, setDraftSince] = useState(value.since ?? '')
  const [draftBefore, setDraftBefore] = useState(value.before ?? '')
  const [draftAction, setDraftAction] = useState(value.action ?? '')
  const [draftActorType, setDraftActorType] = useState(value.actorType ?? '')
  const [draftTargetType, setDraftTargetType] = useState(value.targetType ?? '')
  const [draftResultStatus, setDraftResultStatus] = useState(value.resultStatus ?? '')
  const [draftActor, setDraftActor] = useState(value.actor ?? '')
  const [draftTargetID, setDraftTargetID] = useState(value.targetId ?? '')
  const [draftOriginIP, setDraftOriginIP] = useState(value.originIP ?? '')

  // Re-sync drafts when the applied state changes externally (chip
  // removal, AI-tab clearing, parent reset).
  useEffect(() => {
    setDraftSince(value.since ?? '')
    setDraftBefore(value.before ?? '')
    setDraftAction(value.action ?? '')
    setDraftActorType(value.actorType ?? '')
    setDraftTargetType(value.targetType ?? '')
    setDraftResultStatus(value.resultStatus ?? '')
    setDraftActor(value.actor ?? '')
    setDraftTargetID(value.targetId ?? '')
    setDraftOriginIP(value.originIP ?? '')
  }, [
    value.since,
    value.before,
    value.action,
    value.actorType,
    value.targetType,
    value.resultStatus,
    value.actor,
    value.targetId,
    value.originIP,
  ])

  // Add-filters button is enabled only when the live drafts differ
  // from what's already applied. Compare each draft's normalized
  // value (empty string → undefined) to the applied value.
  const norm = (s: string) => (s === '' ? undefined : s)
  const dirty =
    norm(draftAction) !== value.action ||
    norm(draftActorType) !== value.actorType ||
    norm(draftTargetType) !== value.targetType ||
    norm(draftResultStatus) !== value.resultStatus ||
    norm(draftActor) !== value.actor ||
    norm(draftTargetID) !== value.targetId ||
    norm(draftOriginIP) !== value.originIP ||
    (value.range === 'custom' &&
      (norm(draftSince) !== value.since ||
        norm(draftBefore) !== value.before))

  const handleApply = () => {
    // Filters-tab actions start clean: commit the column drafts and
    // strip any AI carry-over or DSL query the user might have
    // started in the AI / Query tabs.
    onChange({
      ...value,
      action: norm(draftAction),
      actorType: norm(draftActorType),
      targetType: norm(draftTargetType),
      resultStatus: norm(draftResultStatus),
      actor: norm(draftActor),
      targetId: norm(draftTargetID),
      originIP: norm(draftOriginIP),
      since: value.range === 'custom' ? norm(draftSince) : value.since,
      before: value.range === 'custom' ? norm(draftBefore) : value.before,
      q: undefined,
      nlpQ: undefined,
      nlpExplanation: undefined,
      nlpUnsupported: undefined,
    })
  }

  const handlePresetClick = (range: TimeRangePreset) => {
    // Time-range presets apply immediately. They don't clear NLP /
    // DSL state because they're a view selector, not a filter.
    if (range === 'custom') {
      onChange({ ...value, range })
      return
    }
    onChange({ ...value, range, since: undefined, before: undefined })
  }

  return (
    <div className="audit-trail-filter-tab-panel">
      <div
        className="audit-trail-filter-tabs"
        role="tablist"
        aria-label="Time range"
      >
        {TIME_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={value.range === p.key}
            className={
              value.range === p.key
                ? 'audit-trail-filter-tab audit-trail-filter-tab-selected'
                : 'audit-trail-filter-tab'
            }
            onClick={() => handlePresetClick(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {value.range === 'custom' && (
        <div className="audit-trail-filter-row">
          <label className="audit-trail-filter-field">
            <span className="audit-trail-filter-field-label">From</span>
            <input
              type="datetime-local"
              className="audit-trail-filter-input"
              value={draftSince}
              onChange={(e) => setDraftSince(e.target.value)}
            />
          </label>
          <label className="audit-trail-filter-field">
            <span className="audit-trail-filter-field-label">To</span>
            <input
              type="datetime-local"
              className="audit-trail-filter-input"
              value={draftBefore}
              onChange={(e) => setDraftBefore(e.target.value)}
            />
          </label>
        </div>
      )}

      <div className="audit-trail-filter-row">
        <select
          className="audit-trail-filter-select"
          aria-label="Action"
          value={draftAction}
          onChange={(e) => setDraftAction(e.target.value)}
        >
          <option value="">All actions</option>
          {distinct.actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <select
          className="audit-trail-filter-select"
          aria-label="Actor type"
          value={draftActorType}
          onChange={(e) => setDraftActorType(e.target.value)}
        >
          <option value="">All actor types</option>
          {distinct.actorTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          className="audit-trail-filter-select"
          aria-label="Target type"
          value={draftTargetType}
          onChange={(e) => setDraftTargetType(e.target.value)}
        >
          <option value="">All target types</option>
          {distinct.targetTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {distinct.resultStatuses.length > 0 && (
          <select
            className="audit-trail-filter-select"
            aria-label="Result"
            value={draftResultStatus}
            onChange={(e) => setDraftResultStatus(e.target.value)}
          >
            <option value="">All results</option>
            {distinct.resultStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="audit-trail-filter-row">
        <input
          type="text"
          className="audit-trail-filter-input audit-trail-filter-actor-input"
          placeholder="Actor (id, name, email)"
          value={draftActor}
          onChange={(e) => setDraftActor(e.target.value)}
        />
        <input
          type="text"
          className="audit-trail-filter-input"
          placeholder="Target ID"
          value={draftTargetID}
          onChange={(e) => setDraftTargetID(e.target.value)}
        />
        <input
          type="text"
          className="audit-trail-filter-input"
          placeholder="Origin IP"
          value={draftOriginIP}
          onChange={(e) => setDraftOriginIP(e.target.value)}
        />
      </div>

      <div className="audit-trail-filter-actions">
        <button
          type="button"
          className="audit-trail-button audit-trail-button-secondary"
          disabled={!dirty}
          onClick={handleApply}
        >
          Add filters
        </button>
      </div>

      <MetadataFilterSection
        value={value}
        onChange={onChange}
        distinct={distinct}
      />
    </div>
  )
}

// ============================================================
// Metadata / changed-field filter section. Lives inside the
// Filters tab. The user composes a single DSL clause via picker
// inputs and clicks Add filter to apply — which replaces q
// (and strips any AI carry-over), mirroring the dashboard's
// "Filters tab starts clean" behavior.
// ============================================================

type AddFilterVariant = 'metadata' | 'change-field' | 'change-before' | 'change-after'
type MetadataOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'

interface MetadataFilterSectionProps {
  value: FilterValues
  onChange: (next: FilterValues) => void
  distinct: DistinctValues
}

function MetadataFilterSection({
  value,
  onChange,
  distinct,
}: MetadataFilterSectionProps) {
  const [variant, setVariant] = useState<AddFilterVariant>('metadata')
  const [mdKey, setMdKey] = useState('')
  const [mdOp, setMdOp] = useState<MetadataOperator>('eq')
  const [mdValue, setMdValue] = useState('')
  const [mdValue2, setMdValue2] = useState('')
  const [cfField, setCfField] = useState('')
  const [cbField, setCbField] = useState('')
  const [cbValue, setCbValue] = useState('')
  const [caField, setCaField] = useState('')
  const [caValue, setCaValue] = useState('')

  const compiled = compileMetaClause({
    variant,
    mdKey,
    mdOp,
    mdValue,
    mdValue2,
    cfField,
    cbField,
    cbValue,
    caField,
    caValue,
  })

  const submittable = compiled.dsl !== null
  // Surface only the "between" hint while composing — other compile
  // errors (missing field, etc.) are just "you haven't filled in X yet"
  // and would be noisy while typing.
  const showError =
    !submittable && compiled.error && /Both bounds/.test(compiled.error)

  const handleAdd = () => {
    if (!compiled.dsl) return
    // Filters-tab actions start clean: replace q with just this
    // clause and strip any AI echo.
    onChange({
      ...value,
      q: compiled.dsl,
      nlpQ: undefined,
      nlpExplanation: undefined,
      nlpUnsupported: undefined,
    })
  }

  return (
    <div className="audit-trail-add-filter-inline">
      <h3 className="audit-trail-add-filter-heading">Metadata and Changed Fields</h3>

      <label className="audit-trail-add-filter-row">
        <span className="audit-trail-add-filter-label">Filter type</span>
        <select
          value={variant}
          onChange={(e) => setVariant(e.target.value as AddFilterVariant)}
        >
          <option value="metadata">Metadata key/value</option>
          <option value="change-field">Change: a field changed</option>
          <option value="change-before">Change: previous value (before)</option>
          <option value="change-after">Change: new value (after)</option>
        </select>
      </label>

      {variant === 'metadata' && (
        <>
          <label className="audit-trail-add-filter-row">
            <span className="audit-trail-add-filter-label">Key</span>
            <input
              type="text"
              list="audit-trail-mdk-key-list"
              placeholder="e.g. environment"
              value={mdKey}
              onChange={(e) => setMdKey(e.target.value)}
            />
            <datalist id="audit-trail-mdk-key-list">
              {distinct.metadataKeys.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.observed_type} · {k.event_count}
                </option>
              ))}
            </datalist>
          </label>
          <label className="audit-trail-add-filter-row">
            <span className="audit-trail-add-filter-label">Operator</span>
            <select
              value={mdOp}
              onChange={(e) => setMdOp(e.target.value as MetadataOperator)}
            >
              <option value="eq">equals</option>
              <option value="neq">not equal</option>
              <option value="contains">contains</option>
              <option value="gt">greater than</option>
              <option value="gte">greater or equal</option>
              <option value="lt">less than</option>
              <option value="lte">less or equal</option>
              <option value="between">between</option>
            </select>
          </label>
          <label className="audit-trail-add-filter-row">
            <span className="audit-trail-add-filter-label">Value</span>
            <input
              type="text"
              placeholder="e.g. prod"
              value={mdValue}
              onChange={(e) => setMdValue(e.target.value)}
            />
          </label>
          {mdOp === 'between' && (
            <label className="audit-trail-add-filter-row">
              <span className="audit-trail-add-filter-label">Upper bound</span>
              <input
                type="text"
                placeholder="e.g. 1000"
                value={mdValue2}
                onChange={(e) => setMdValue2(e.target.value)}
              />
            </label>
          )}
        </>
      )}

      {variant === 'change-field' && (
        <label className="audit-trail-add-filter-row">
          <span className="audit-trail-add-filter-label">Field</span>
          <input
            type="text"
            list="audit-trail-cf-field-list"
            placeholder="e.g. email"
            value={cfField}
            onChange={(e) => setCfField(e.target.value)}
          />
          <datalist id="audit-trail-cf-field-list">
            {distinct.changeFields.map((c) => (
              <option key={c.field} value={c.field}>
                {c.event_count} events
              </option>
            ))}
          </datalist>
        </label>
      )}

      {variant === 'change-before' && (
        <>
          <label className="audit-trail-add-filter-row">
            <span className="audit-trail-add-filter-label">Field</span>
            <input
              type="text"
              list="audit-trail-cf-field-list"
              placeholder="e.g. role"
              value={cbField}
              onChange={(e) => setCbField(e.target.value)}
            />
          </label>
          <label className="audit-trail-add-filter-row">
            <span className="audit-trail-add-filter-label">Previous value</span>
            <input
              type="text"
              placeholder="e.g. user"
              value={cbValue}
              onChange={(e) => setCbValue(e.target.value)}
            />
          </label>
        </>
      )}

      {variant === 'change-after' && (
        <>
          <label className="audit-trail-add-filter-row">
            <span className="audit-trail-add-filter-label">Field</span>
            <input
              type="text"
              list="audit-trail-cf-field-list"
              placeholder="e.g. role"
              value={caField}
              onChange={(e) => setCaField(e.target.value)}
            />
          </label>
          <label className="audit-trail-add-filter-row">
            <span className="audit-trail-add-filter-label">New value</span>
            <input
              type="text"
              placeholder="e.g. admin"
              value={caValue}
              onChange={(e) => setCaValue(e.target.value)}
            />
          </label>
        </>
      )}

      {showError && (
        <p className="audit-trail-add-filter-error">{compiled.error}</p>
      )}

      <div className="audit-trail-filter-actions audit-trail-add-filter-actions">
        <button
          type="button"
          className="audit-trail-button audit-trail-button-secondary"
          disabled={!submittable}
          onClick={handleAdd}
        >
          Add filter
        </button>
      </div>
    </div>
  )
}

interface MetaCompileInput {
  variant: AddFilterVariant
  mdKey: string
  mdOp: MetadataOperator
  mdValue: string
  mdValue2: string
  cfField: string
  cbField: string
  cbValue: string
  caField: string
  caValue: string
}

interface MetaCompileResult {
  dsl: string | null
  error?: string
}

// compileMetaClause mirrors the dashboard's app.js DSL builder. Returns
// `{ dsl: null, error }` while required fields are empty so the Add
// button stays disabled; only `between` surfaces its error inline
// because it's the one rule where a partially-filled state is a real
// composition mistake rather than "still typing".
function compileMetaClause(i: MetaCompileInput): MetaCompileResult {
  switch (i.variant) {
    case 'metadata': {
      const key = i.mdKey.trim()
      if (!key) return { dsl: null, error: 'Key is required' }
      const path = 'metadata.' + quoteKeyIfNeeded(key)
      const v1 = i.mdValue
      const v2 = i.mdValue2
      switch (i.mdOp) {
        case 'eq':
          return { dsl: `${path}:${quoteIfNeeded(v1)}` }
        case 'neq':
          return { dsl: `${path}:!${quoteIfNeeded(v1)}` }
        case 'contains':
          return { dsl: `${path}:~${quoteIfNeeded(v1)}` }
        case 'gt':
          return { dsl: `${path}:>${quoteIfNeeded(v1)}` }
        case 'gte':
          return { dsl: `${path}:>=${quoteIfNeeded(v1)}` }
        case 'lt':
          return { dsl: `${path}:<${quoteIfNeeded(v1)}` }
        case 'lte':
          return { dsl: `${path}:<=${quoteIfNeeded(v1)}` }
        case 'between':
          if (v1 === '' || v2 === '') {
            return { dsl: null, error: 'Both bounds required for between' }
          }
          return {
            dsl: `${path}:[${quoteIfNeeded(v1)} TO ${quoteIfNeeded(v2)}]`,
          }
      }
      return { dsl: null, error: 'Unknown operator' }
    }
    case 'change-field': {
      const f = i.cfField.trim()
      if (!f) return { dsl: null, error: 'Field is required' }
      return { dsl: `change.field:${quoteIfNeeded(f)}` }
    }
    case 'change-before': {
      const f = i.cbField.trim()
      if (!f) return { dsl: null, error: 'Field is required' }
      return {
        dsl: `change.${quoteKeyIfNeeded(f)}.before:${quoteIfNeeded(i.cbValue)}`,
      }
    }
    case 'change-after': {
      const f = i.caField.trim()
      if (!f) return { dsl: null, error: 'Field is required' }
      return {
        dsl: `change.${quoteKeyIfNeeded(f)}.after:${quoteIfNeeded(i.caValue)}`,
      }
    }
  }
}

// quoteIfNeeded wraps a value in double quotes when it contains
// whitespace, parens, brackets, or quotes — characters the DSL parser
// would otherwise terminate on. Mirrors filter.valueNeedsQuoting on
// the server. Escapes backslash and double-quote inside quoted values.
function quoteIfNeeded(raw: string): string {
  if (raw === '') return '""'
  if (/[\s"\(\)\[\]]/.test(raw)) {
    return '"' + raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
  }
  return raw
}

// quoteKeyIfNeeded mirrors quoteIfNeeded but for dynamic keys
// (metadata.<key>, change.<key>.before). The dynamic-key grammar is
// stricter than IDENT, so dotted keys like "feature.flag" must be
// quoted to round-trip cleanly.
function quoteKeyIfNeeded(raw: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(raw)) return raw
  return '"' + raw + '"'
}

// ============================================================
// Query tab
// ============================================================

interface QueryTabProps {
  value: FilterValues
  onChange: (next: FilterValues) => void
}

function QueryTabPanel({ value, onChange }: QueryTabProps) {
  const [draft, setDraft] = useState(value.q ?? '')

  // Re-sync the draft when q changes externally (e.g., AI tab
  // applied a translation; chip-row × cleared a clause).
  useEffect(() => {
    setDraft(value.q ?? '')
  }, [value.q])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const next = draft.trim() || undefined
    if (next === value.q) return
    // Submitting the Query tab strips any NLP echo — the user is
    // editing the DSL directly now.
    onChange({
      ...value,
      q: next,
      nlpQ: undefined,
      nlpExplanation: undefined,
      nlpUnsupported: undefined,
    })
  }

  return (
    <form className="audit-trail-query-form" onSubmit={handleSubmit}>
      <label className="audit-trail-query-label" htmlFor="audit-trail-query-input">
        Query{' '}
        <a
          href="https://github.com/everscribe/monorepo/blob/main/docs/events-filter-and-nlp-spec.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          (see docs)
        </a>
      </label>
      <input
        id="audit-trail-query-input"
        type="text"
        className="audit-trail-query-input"
        placeholder="e.g. action:user.login AND result.status:!ok"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label="Advanced query (DSL)"
        spellCheck={false}
      />
      <div className="audit-trail-filter-actions">
        <button
          type="submit"
          className="audit-trail-button audit-trail-button-secondary"
          disabled={(draft.trim() || '') === (value.q ?? '')}
        >
          Search
        </button>
      </div>
    </form>
  )
}

// ============================================================
// Active filter counters
// ============================================================

// hasAnyColumnFilter is the predicate the initial-tab logic uses.
function hasAnyColumnFilter(v: FilterValues): boolean {
  return !!(
    v.action ||
    v.actor ||
    v.actorType ||
    v.tenantId ||
    v.targetType ||
    v.targetId ||
    v.resultStatus ||
    v.originIP
  )
}

// countActiveColumnFilters reports how many column filters are active.
// Time range and the DSL q are excluded; q gets its own per-clause
// chip count via parseQClauses below.
export function countActiveColumnFilters(v: FilterValues): number {
  let n = 0
  if (v.action) n++
  if (v.actor) n++
  if (v.actorType) n++
  if (v.tenantId) n++
  if (v.targetType) n++
  if (v.targetId) n++
  if (v.resultStatus) n++
  if (v.originIP) n++
  return n
}

// parseQClauses splits a top-level `field:value AND field:value`
// query into individual chips. Lightweight tokenizer — it doesn't
// validate the DSL syntax (the server does that) and bails to
// "single chip with the full string" for queries it can't split
// cleanly (parens, nested expressions). Matches the dashboard's
// chip-per-clause behavior at a sane level of fidelity.
export interface ParsedClause {
  label: string
  // raw is the DSL slice for this clause. Removing the chip rebuilds
  // q with this clause excised, joining the rest with " AND ".
  raw: string
}

export function parseQClauses(q: string): ParsedClause[] {
  const trimmed = q.trim()
  if (!trimmed) return []
  // If the query contains parens (within-field OR, range syntax),
  // we can't trivially split — fall back to one chip for the whole
  // expression so the chip × still works as a clear-all.
  if (/[()]/.test(trimmed)) return [{ label: trimmed, raw: trimmed }]
  return trimmed
    .split(/\s+AND\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => ({ label: s, raw: s }))
}

export function removeClauseFromQ(q: string, raw: string): string | undefined {
  const remaining = parseQClauses(q).filter((c) => c.raw !== raw)
  if (remaining.length === 0) return undefined
  return remaining.map((c) => c.raw).join(' AND ')
}
