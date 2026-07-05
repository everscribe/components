import type {
  DistinctValues,
  EmbedClaims,
} from '@everscribe/components-core'

import { h } from './dom.js'

export type TimeRangePreset = '24h' | '7d' | '30d' | 'custom' | 'all'
export type FilterTab = 'ai' | 'filters' | 'query'

export interface FilterValues {
  range: TimeRangePreset
  // since / before are only meaningful when range === 'custom'.
  // Stored as datetime-local strings (YYYY-MM-DDTHH:mm) - the API
  // wants ISO, so resolveTimeBounds promotes them at send-time.
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
  // q is the DSL query - set from the Query tab (user input) or
  // the Prompt tab (model-translated). Active filter chips parse this.
  q?: string
  // NLP echo fields - set when the Prompt tab produced the current q.
  // Render the "Translated to:" banner from these.
  nlpQ?: string
  nlpExplanation?: string
  nlpUnsupported?: string[]
}

export type NLPErrorReason =
  | 'not_configured'
  | 'not_allowed'
  | 'rate_limited'
  | 'provider_busy'
  | 'bad_request'
  | 'unknown'

export type NLPState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; reason: NLPErrorReason }

export interface FiltersPanelOptions {
  value: FilterValues
  distinct: DistinctValues
  claims: EmbedClaims | null
  activeTab: FilterTab
  nlpState: NLPState
  // Tab + filter mutators. Parent (AuditTrailElement) owns the state;
  // these callbacks are the only way the panel mutates anything.
  onTabChange: (next: FilterTab) => void
  onChange: (next: FilterValues) => void
  // Prompt-tab Search fires the NLP round-trip on the parent. Parent
  // flips nlpState to 'loading' immediately and re-renders.
  onNLPSubmit: (query: string) => void
  // Fired when the user commits a Filters-tab action ("Add filters",
  // "Add filter"). Parent rolls the panel up so the newly applied
  // filters and resulting table are immediately visible.
  onApplied?: () => void
}

const TIME_PRESETS: ReadonlyArray<{ key: TimeRangePreset; label: string }> = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'custom', label: 'Custom' },
  { key: 'all', label: 'All' },
]

// pickInitialTab figures out which tab to show on first render. NLP
// echo wins (the user just submitted a NL query); then DSL (they were
// composing one); then column filters; else Prompt when available.
export function pickInitialTab(
  v: FilterValues,
  claims: EmbedClaims | null,
): FilterTab {
  if (v.nlpQ && claims?.allow_nlp) return 'ai'
  if (v.q && claims?.allow_dsl_input) return 'query'
  if (hasAnyColumnFilter(v)) return 'filters'
  if (claims?.allow_nlp) return 'ai'
  return 'filters'
}

// ============================================================
// Top-level renderer
// ============================================================

export function renderFiltersPanel(opts: FiltersPanelOptions): HTMLElement {
  const { claims, activeTab } = opts
  const allowNLP = !!claims?.allow_nlp
  const allowDSL = !!claims?.allow_dsl_input

  const tabBar = renderTabBar({ allowNLP, allowDSL, activeTab, onTabChange: opts.onTabChange })

  let body: HTMLElement
  if (activeTab === 'ai' && allowNLP) {
    body = renderAITabPanel(opts)
  } else if (activeTab === 'query' && allowDSL) {
    body = renderQueryTabPanel(opts)
  } else {
    body = renderFiltersTabPanel(opts)
  }

  return h('div', { class: 'audit-trail-filter-panel' }, tabBar, body)
}

interface TabBarOptions {
  allowNLP: boolean
  allowDSL: boolean
  activeTab: FilterTab
  onTabChange: (next: FilterTab) => void
}

function renderTabBar(opts: TabBarOptions): HTMLElement {
  const tabs: HTMLElement[] = []
  const make = (key: FilterTab, label: string) => {
    const active = opts.activeTab === key
    const btn = h(
      'button',
      {
        type: 'button',
        role: 'tab',
        'aria-selected': active ? 'true' : 'false',
        class: active
          ? 'audit-trail-filter-mode audit-trail-filter-mode-selected'
          : 'audit-trail-filter-mode',
      },
      label,
    )
    btn.addEventListener('click', () => opts.onTabChange(key))
    return btn
  }
  if (opts.allowNLP) tabs.push(make('ai', 'Prompt'))
  tabs.push(make('filters', 'Filters'))
  if (opts.allowDSL) tabs.push(make('query', 'Query'))
  return h(
    'div',
    { class: 'audit-trail-filter-modes', role: 'tablist', 'aria-label': 'Filter mode' },
    ...tabs,
  )
}

// ============================================================
// Prompt (AI) tab
// ============================================================

function renderAITabPanel(opts: FiltersPanelOptions): HTMLElement {
  const { value, nlpState, onNLPSubmit } = opts

  const input = h('input', {
    type: 'text',
    id: 'audit-trail-nlp-input',
    class: 'audit-trail-nlp-input',
    placeholder: 'e.g. failed logins last 24 hours',
    maxlength: 500,
    'aria-label': 'Natural-language filter query',
    value: value.nlpQ ?? '',
  }) as HTMLInputElement
  input.value = value.nlpQ ?? ''
  if (nlpState.phase === 'loading') input.disabled = true

  const submit = () => {
    const q = input.value.trim()
    if (!q) return
    onNLPSubmit(q)
  }

  const label = h(
    'label',
    { class: 'audit-trail-nlp-label', for: 'audit-trail-nlp-input' },
    'Ask in plain English',
    h(
      'span',
      {
        class: 'audit-trail-badge audit-trail-badge-info',
        title: 'Beta',
      },
      'Beta',
    ),
  )

  const children: Node[] = [label, input]

  if (value.q && value.nlpQ) {
    children.push(
      h(
        'div',
        { class: 'audit-trail-nlp-banner' },
        h(
          'p',
          null,
          h('strong', null, 'Translated to:'),
          ' ',
          h('code', { class: 'audit-trail-nlp-translated' }, value.q),
        ),
      ),
    )
  }

  if (nlpState.phase === 'error') {
    children.push(
      h('div', { class: 'audit-trail-error' }, nlpErrorMessage(nlpState.reason)),
    )
  }

  if (value.nlpUnsupported && value.nlpUnsupported.length > 0) {
    children.push(renderUnsupportedList(value.nlpUnsupported))
  }

  const btn = h(
    'button',
    {
      type: 'button',
      class: 'audit-trail-button audit-trail-button-secondary',
    },
  ) as HTMLButtonElement
  if (nlpState.phase === 'loading') {
    btn.disabled = true
    btn.appendChild(h('span', { class: 'audit-trail-button-spinner' }))
    btn.appendChild(document.createTextNode(' Translating…'))
  } else {
    btn.textContent = 'Search'
  }
  // Re-evaluate disabled state when input changes - empty query
  // keeps Search disabled.
  const updateBtn = () => {
    if (nlpState.phase === 'loading') return
    btn.disabled = input.value.trim() === ''
  }
  input.addEventListener('input', updateBtn)
  updateBtn()
  btn.addEventListener('click', submit)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  })

  children.push(h('div', { class: 'audit-trail-filter-actions' }, btn))

  return h('form', { class: 'audit-trail-nlp-form' }, ...children)
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

function renderUnsupportedList(items: string[]): HTMLElement {
  const ul = h(
    'ul',
    null,
    ...items.map((u) => h('li', null, `Couldn't apply: ${u}`)),
  )
  return h(
    'div',
    { class: 'audit-trail-error audit-trail-nlp-unsupported' },
    ul,
  )
}

// ============================================================
// Filters tab - time-range presets, column filters, metadata builder.
// Column filters are draft-based: nothing commits until "Add filters"
// is clicked. Time-range presets apply immediately (view selector).
// ============================================================

function renderFiltersTabPanel(opts: FiltersPanelOptions): HTMLElement {
  const { value, distinct, onChange, onApplied } = opts

  // Drafts live in the DOM inputs themselves. Add filters reads them
  // at click time - no React-style state syncing.
  let actionSelect: HTMLSelectElement
  let actorTypeSelect: HTMLSelectElement
  let targetTypeSelect: HTMLSelectElement
  let tenantSelect: HTMLSelectElement | null = null
  let resultSelect: HTMLSelectElement | null = null
  let actorInput: HTMLInputElement
  let targetIDInput: HTMLInputElement
  let originIPInput: HTMLInputElement
  let sinceInput: HTMLInputElement | null = null
  let beforeInput: HTMLInputElement | null = null

  // ---- time-range presets ----
  const timePresets = h(
    'div',
    {
      class: 'audit-trail-filter-tabs',
      role: 'tablist',
      'aria-label': 'Time range',
    },
    ...TIME_PRESETS.map((p) => {
      const selected = value.range === p.key
      const btn = h(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': selected ? 'true' : 'false',
          class: selected
            ? 'audit-trail-filter-tab audit-trail-filter-tab-selected'
            : 'audit-trail-filter-tab',
        },
        p.label,
      )
      btn.addEventListener('click', () => {
        if (p.key === 'custom') {
          onChange({ ...value, range: p.key })
        } else {
          onChange({ ...value, range: p.key, since: undefined, before: undefined })
        }
      })
      return btn
    }),
  )

  // ---- custom-range pickers ----
  let customRow: HTMLElement | null = null
  if (value.range === 'custom') {
    sinceInput = buildDateInput(value.since ?? '')
    beforeInput = buildDateInput(value.before ?? '')
    customRow = h(
      'div',
      { class: 'audit-trail-filter-row' },
      h(
        'label',
        { class: 'audit-trail-filter-field' },
        h('span', { class: 'audit-trail-filter-field-label' }, 'From'),
        sinceInput,
      ),
      h(
        'label',
        { class: 'audit-trail-filter-field' },
        h('span', { class: 'audit-trail-filter-field-label' }, 'To'),
        beforeInput,
      ),
    )
  }

  // ---- column-filter selects ----
  actionSelect = buildSelect('Action', 'All actions', value.action ?? '', distinct.actions)
  actorTypeSelect = buildSelect(
    'Actor type',
    'All actor types',
    value.actorType ?? '',
    distinct.actorTypes,
  )
  targetTypeSelect = buildSelect(
    'Target type',
    'All target types',
    value.targetType ?? '',
    distinct.targetTypes,
  )
  const dropdownChildren: HTMLElement[] = [actionSelect, actorTypeSelect, targetTypeSelect]
  if (distinct.tenants.length > 0) {
    tenantSelect = buildSelect(
      'Tenant',
      'All tenants',
      value.tenantId ?? '',
      distinct.tenants,
    )
    dropdownChildren.push(tenantSelect)
  }
  if (distinct.resultStatuses.length > 0) {
    resultSelect = buildSelect(
      'Result',
      'All results',
      value.resultStatus ?? '',
      distinct.resultStatuses,
    )
    dropdownChildren.push(resultSelect)
  }
  const dropdownRow = h(
    'div',
    { class: 'audit-trail-filter-row' },
    ...dropdownChildren,
  )

  // ---- column-filter text inputs ----
  // Free-text filters each on their own row - three inputs side-by-
  // side wrapped awkwardly on narrow embed widths. Stacked they
  // breathe and read naturally.
  actorInput = buildTextInput(
    value.actor ?? '',
    'Actor (id, name, email)',
    'audit-trail-filter-input audit-trail-filter-actor-input',
  )
  targetIDInput = buildTextInput(
    value.targetId ?? '',
    'Target ID',
    'audit-trail-filter-input audit-trail-filter-wide-input',
  )
  originIPInput = buildTextInput(
    value.originIP ?? '',
    'Origin IP',
    'audit-trail-filter-input audit-trail-filter-wide-input',
  )
  const textRowActor = h('div', { class: 'audit-trail-filter-row' }, actorInput)
  const textRowTarget = h('div', { class: 'audit-trail-filter-row' }, targetIDInput)
  const textRowOrigin = h('div', { class: 'audit-trail-filter-row' }, originIPInput)

  // ---- Add filters button (commits all drafts, clears NLP/DSL) ----
  const addBtn = h(
    'button',
    {
      type: 'button',
      class: 'audit-trail-button audit-trail-button-secondary',
    },
    'Add filters',
  ) as HTMLButtonElement

  const norm = (s: string) => (s === '' ? undefined : s)
  const computeDirty = (): boolean => {
    if (norm(actionSelect.value) !== value.action) return true
    if (norm(actorTypeSelect.value) !== value.actorType) return true
    if (norm(targetTypeSelect.value) !== value.targetType) return true
    if (tenantSelect && norm(tenantSelect.value) !== value.tenantId) return true
    if (resultSelect && norm(resultSelect.value) !== value.resultStatus) return true
    if (norm(actorInput.value) !== value.actor) return true
    if (norm(targetIDInput.value) !== value.targetId) return true
    if (norm(originIPInput.value) !== value.originIP) return true
    if (value.range === 'custom') {
      if (norm(sinceInput?.value ?? '') !== value.since) return true
      if (norm(beforeInput?.value ?? '') !== value.before) return true
    }
    return false
  }
  const refreshDirty = () => {
    addBtn.disabled = !computeDirty()
  }
  refreshDirty()

  // Wire input events on every draft surface to re-evaluate the
  // dirty flag. Cheap - no API calls until the button is clicked.
  for (const el of [
    actionSelect,
    actorTypeSelect,
    targetTypeSelect,
    tenantSelect,
    resultSelect,
  ].filter(Boolean) as HTMLSelectElement[]) {
    el.addEventListener('change', refreshDirty)
  }
  for (const el of [actorInput, targetIDInput, originIPInput].filter(
    Boolean,
  ) as HTMLInputElement[]) {
    el.addEventListener('input', refreshDirty)
  }
  if (sinceInput) sinceInput.addEventListener('input', refreshDirty)
  if (beforeInput) beforeInput.addEventListener('input', refreshDirty)

  addBtn.addEventListener('click', () => {
    onChange({
      ...value,
      action: norm(actionSelect.value),
      actorType: norm(actorTypeSelect.value),
      targetType: norm(targetTypeSelect.value),
      tenantId: tenantSelect ? norm(tenantSelect.value) : value.tenantId,
      resultStatus: resultSelect ? norm(resultSelect.value) : value.resultStatus,
      actor: norm(actorInput.value),
      targetId: norm(targetIDInput.value),
      originIP: norm(originIPInput.value),
      since:
        value.range === 'custom' ? norm(sinceInput?.value ?? '') : value.since,
      before:
        value.range === 'custom' ? norm(beforeInput?.value ?? '') : value.before,
      q: undefined,
      nlpQ: undefined,
      nlpExplanation: undefined,
      nlpUnsupported: undefined,
    })
    onApplied?.()
  })

  const addBtnRow = h('div', { class: 'audit-trail-filter-actions' }, addBtn)

  // ---- inline metadata / changed-field builder ----
  const metaSection = renderMetadataFilterSection(value, distinct, onChange, onApplied)

  const children: Node[] = [timePresets]
  if (customRow) children.push(customRow)
  children.push(
    dropdownRow,
    textRowActor,
    textRowTarget,
    textRowOrigin,
    addBtnRow,
    metaSection,
  )

  return h('div', { class: 'audit-trail-filter-tab-panel' }, ...children)
}

function buildSelect(
  ariaLabel: string,
  emptyLabel: string,
  selected: string,
  options: string[],
): HTMLSelectElement {
  const sel = h('select', {
    class: 'audit-trail-filter-select',
    'aria-label': ariaLabel,
  }) as HTMLSelectElement
  const empty = h('option', { value: '' }, emptyLabel) as HTMLOptionElement
  if (selected === '') empty.selected = true
  sel.appendChild(empty)
  for (const opt of options) {
    const o = h('option', { value: opt }, opt) as HTMLOptionElement
    if (opt === selected) o.selected = true
    sel.appendChild(o)
  }
  return sel
}

function buildTextInput(value: string, placeholder: string, className: string): HTMLInputElement {
  const input = h('input', {
    type: 'text',
    class: className,
    placeholder,
    value,
  }) as HTMLInputElement
  input.value = value
  return input
}

function buildDateInput(value: string): HTMLInputElement {
  const input = h('input', {
    type: 'datetime-local',
    class: 'audit-trail-filter-input',
    value,
  }) as HTMLInputElement
  input.value = value
  return input
}

// ============================================================
// Metadata / changed-field builder. One DSL clause composed from
// picker inputs; Add filter replaces q (and clears NLP echo).
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

function renderMetadataFilterSection(
  value: FilterValues,
  distinct: DistinctValues,
  onChange: (next: FilterValues) => void,
  onApplied?: () => void,
): HTMLElement {
  let variant: AddFilterVariant = 'metadata'

  const typeSelect = h('select', null) as HTMLSelectElement
  for (const [val, label] of [
    ['metadata', 'Metadata key/value'],
    ['change-field', 'Change: a field changed'],
    ['change-before', 'Change: previous value (before)'],
    ['change-after', 'Change: new value (after)'],
  ] as const) {
    const o = h('option', { value: val }, label) as HTMLOptionElement
    typeSelect.appendChild(o)
  }
  typeSelect.value = variant

  // Variant-specific inputs are built once and shown/hidden on
  // variant change. Each variant's inputs share a wrapper element
  // so the variant switch can toggle display via a class.
  const mdKey = h('input', {
    type: 'text',
    placeholder: 'e.g. environment',
    list: 'audit-trail-mdk-key-list',
  }) as HTMLInputElement
  const mdKeyList = h('datalist', { id: 'audit-trail-mdk-key-list' })
  for (const k of distinct.metadataKeys) {
    mdKeyList.appendChild(
      h('option', { value: k.key }, `${k.observed_type} · ${k.event_count}`),
    )
  }
  const mdOp = h('select', null) as HTMLSelectElement
  for (const [val, label] of [
    ['eq', 'equals'],
    ['neq', 'not equal'],
    ['contains', 'contains'],
    ['gt', 'greater than'],
    ['gte', 'greater or equal'],
    ['lt', 'less than'],
    ['lte', 'less or equal'],
    ['between', 'between'],
  ] as const) {
    mdOp.appendChild(h('option', { value: val }, label))
  }
  const mdValue = h('input', {
    type: 'text',
    placeholder: 'e.g. prod',
  }) as HTMLInputElement
  const mdValue2 = h('input', {
    type: 'text',
    placeholder: 'e.g. 1000',
  }) as HTMLInputElement

  const cfField = h('input', {
    type: 'text',
    placeholder: 'e.g. email',
    list: 'audit-trail-cf-field-list',
  }) as HTMLInputElement
  const cfFieldList = h('datalist', { id: 'audit-trail-cf-field-list' })
  for (const c of distinct.changeFields) {
    cfFieldList.appendChild(h('option', { value: c.field }, `${c.event_count} events`))
  }

  const cbField = h('input', {
    type: 'text',
    placeholder: 'e.g. role',
    list: 'audit-trail-cf-field-list',
  }) as HTMLInputElement
  const cbValue = h('input', {
    type: 'text',
    placeholder: 'e.g. user',
  }) as HTMLInputElement

  const caField = h('input', {
    type: 'text',
    placeholder: 'e.g. role',
    list: 'audit-trail-cf-field-list',
  }) as HTMLInputElement
  const caValue = h('input', {
    type: 'text',
    placeholder: 'e.g. admin',
  }) as HTMLInputElement

  const metadataVariant = h(
    'div',
    { 'data-variant': 'metadata' },
    addFilterRow('Key', mdKey, mdKeyList),
    addFilterRow('Operator', mdOp),
    addFilterRow('Value', mdValue),
    addFilterRow('Upper bound', mdValue2),
  )
  const changeFieldVariant = h(
    'div',
    { 'data-variant': 'change-field' },
    addFilterRow('Field', cfField, cfFieldList),
  )
  const changeBeforeVariant = h(
    'div',
    { 'data-variant': 'change-before' },
    addFilterRow('Field', cbField),
    addFilterRow('Previous value', cbValue),
  )
  const changeAfterVariant = h(
    'div',
    { 'data-variant': 'change-after' },
    addFilterRow('Field', caField),
    addFilterRow('New value', caValue),
  )

  const variants: HTMLElement[] = [
    metadataVariant,
    changeFieldVariant,
    changeBeforeVariant,
    changeAfterVariant,
  ]

  const errorEl = h('p', { class: 'audit-trail-add-filter-error' }, '') as HTMLElement
  errorEl.style.display = 'none'

  const addBtn = h(
    'button',
    {
      type: 'button',
      class: 'audit-trail-button audit-trail-button-secondary',
    },
    'Add filter',
  ) as HTMLButtonElement

  const mdValue2Row = metadataVariant.children[3] as HTMLElement
  mdValue2Row.style.display = 'none'

  // refresh must be declared BEFORE showVariant - showVariant's body
  // references refresh via closure, and the initial showVariant('metadata')
  // call below would hit refresh in the temporal dead zone otherwise.
  const refresh = () => {
    const compiled = compileMetaClause({
      variant,
      mdKey: mdKey.value,
      mdOp: mdOp.value as MetadataOperator,
      mdValue: mdValue.value,
      mdValue2: mdValue2.value,
      cfField: cfField.value,
      cbField: cbField.value,
      cbValue: cbValue.value,
      caField: caField.value,
      caValue: caValue.value,
    })
    addBtn.disabled = compiled.dsl === null
    // Only surface the "between" hint while composing - other compile
    // errors are just "you haven't filled in X yet" and would be noisy.
    if (compiled.error && /Both bounds/.test(compiled.error)) {
      errorEl.textContent = compiled.error
      errorEl.style.display = ''
    } else {
      errorEl.textContent = ''
      errorEl.style.display = 'none'
    }
  }

  const showVariant = (v: AddFilterVariant) => {
    variant = v
    for (const el of variants) {
      el.style.display = el.dataset.variant === v ? '' : 'none'
    }
    refresh()
  }
  showVariant('metadata')

  typeSelect.addEventListener('change', () => showVariant(typeSelect.value as AddFilterVariant))
  mdOp.addEventListener('change', () => {
    mdValue2Row.style.display = mdOp.value === 'between' ? '' : 'none'
    refresh()
  })
  for (const el of [
    mdKey,
    mdValue,
    mdValue2,
    cfField,
    cbField,
    cbValue,
    caField,
    caValue,
  ]) {
    el.addEventListener('input', refresh)
  }

  addBtn.addEventListener('click', () => {
    const compiled = compileMetaClause({
      variant,
      mdKey: mdKey.value,
      mdOp: mdOp.value as MetadataOperator,
      mdValue: mdValue.value,
      mdValue2: mdValue2.value,
      cfField: cfField.value,
      cbField: cbField.value,
      cbValue: cbValue.value,
      caField: caField.value,
      caValue: caValue.value,
    })
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
    onApplied?.()
  })

  refresh()

  return h(
    'div',
    { class: 'audit-trail-add-filter-inline' },
    h('h3', { class: 'audit-trail-add-filter-heading' }, 'Metadata and Changed Fields'),
    addFilterRow('Filter type', typeSelect),
    metadataVariant,
    changeFieldVariant,
    changeBeforeVariant,
    changeAfterVariant,
    errorEl,
    h(
      'div',
      { class: 'audit-trail-filter-actions audit-trail-add-filter-actions' },
      addBtn,
    ),
  )
}

function addFilterRow(label: string, ...children: Node[]): HTMLElement {
  return h(
    'label',
    { class: 'audit-trail-add-filter-row' },
    h('span', { class: 'audit-trail-add-filter-label' }, label),
    ...children,
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

function quoteIfNeeded(raw: string): string {
  if (raw === '') return '""'
  if (/[\s"\(\)\[\]]/.test(raw)) {
    return '"' + raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
  }
  return raw
}

function quoteKeyIfNeeded(raw: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(raw)) return raw
  return '"' + raw + '"'
}

// ============================================================
// Query tab - explicit-submit DSL input.
// ============================================================

function renderQueryTabPanel(opts: FiltersPanelOptions): HTMLElement {
  const { value, onChange } = opts

  const input = h('input', {
    type: 'text',
    id: 'audit-trail-query-input',
    class: 'audit-trail-query-input',
    placeholder: 'e.g. action:user.login AND result.status:!ok',
    'aria-label': 'Advanced query (DSL)',
    spellcheck: 'false',
    value: value.q ?? '',
  }) as HTMLInputElement
  input.value = value.q ?? ''

  const label = h(
    'label',
    { class: 'audit-trail-query-label', for: 'audit-trail-query-input' },
    'Query ',
    h(
      'a',
      {
        href: 'https://everscribe.io/docs',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      '(see docs)',
    ),
  )

  const btn = h(
    'button',
    {
      type: 'button',
      class: 'audit-trail-button audit-trail-button-secondary',
    },
    'Search',
  ) as HTMLButtonElement

  const refresh = () => {
    btn.disabled = input.value.trim() === (value.q ?? '')
  }
  refresh()
  input.addEventListener('input', refresh)

  const submit = () => {
    const next = input.value.trim() || undefined
    if (next === value.q) return
    onChange({
      ...value,
      q: next,
      nlpQ: undefined,
      nlpExplanation: undefined,
      nlpUnsupported: undefined,
    })
  }
  btn.addEventListener('click', submit)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  })

  return h(
    'form',
    { class: 'audit-trail-query-form' },
    label,
    input,
    h('div', { class: 'audit-trail-filter-actions' }, btn),
  )
}

// ============================================================
// Active-filter chips. Rendered above the panel (by AuditTrailElement),
// not inside it.
// ============================================================

export interface FilterChipsOptions {
  value: FilterValues
  onChange: (next: FilterValues) => void
}

export function renderFilterChips(opts: FilterChipsOptions): HTMLElement | null {
  const { value, onChange } = opts
  const chips: { label: string; remove: () => void }[] = []

  const colChip = (field: keyof FilterValues, label: string, raw: string | undefined) => {
    if (!raw) return
    chips.push({
      label: `${label}: ${raw}`,
      remove: () => onChange({ ...value, [field]: undefined } as FilterValues),
    })
  }
  colChip('action', 'Action', value.action)
  colChip('actor', 'Actor', value.actor)
  colChip('actorType', 'Actor type', value.actorType)
  colChip('tenantId', 'Tenant', value.tenantId)
  colChip('targetType', 'Target type', value.targetType)
  colChip('targetId', 'Target ID', value.targetId)
  colChip('resultStatus', 'Result', value.resultStatus)
  colChip('originIP', 'Origin IP', value.originIP)

  if (value.q) {
    for (const clause of parseQClauses(value.q)) {
      chips.push({
        label: clause.label,
        remove: () => {
          const nextQ = removeClauseFromQ(value.q!, clause.raw)
          onChange({
            ...value,
            q: nextQ,
            nlpQ: nextQ ? value.nlpQ : undefined,
            nlpExplanation: nextQ ? value.nlpExplanation : undefined,
            nlpUnsupported: nextQ ? value.nlpUnsupported : undefined,
          })
        },
      })
    }
  }

  if (chips.length === 0) return null

  const chipsRow = h(
    'div',
    { class: 'audit-trail-filter-chips' },
    ...chips.map((c) => {
      const btn = h(
        'button',
        {
          type: 'button',
          class: 'audit-trail-filter-chip',
          title: 'Remove this filter',
          'aria-label': `Remove filter: ${c.label}`,
        },
        h('span', null, c.label),
        h('span', { 'aria-hidden': 'true', class: 'audit-trail-filter-chip-x' }, '×'),
      )
      btn.addEventListener('click', c.remove)
      return btn
    }),
  )

  const clearAllBtn = h(
    'button',
    {
      type: 'button',
      class: 'audit-trail-button audit-trail-button-text',
    },
    'Clear all',
  )
  clearAllBtn.addEventListener('click', () => {
    onChange({
      range: value.range,
      since: value.since,
      before: value.before,
    })
  })

  return h(
    'div',
    { class: 'audit-trail-filter-chips-row' },
    chipsRow,
    clearAllBtn,
  )
}

// ============================================================
// Counters / helpers (used by AuditTrailElement).
// ============================================================

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

// countActiveColumnFilters reports active column filters. The DSL `q`
// is excluded - it gets its own per-clause count via parseQClauses.
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

export interface ParsedClause {
  label: string
  raw: string
}

// parseQClauses splits a top-level `field:value AND field:value` query
// into individual chips. Lightweight tokenizer - for queries with
// parens (within-field OR, range syntax) we bail to a single chip
// with the full expression so the × still works as a clear-all.
export function parseQClauses(q: string): ParsedClause[] {
  const trimmed = q.trim()
  if (!trimmed) return []
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

// ============================================================
// Time-range resolution (used by AuditTrailElement on every fetch).
// ============================================================

export function resolveTimeBounds(filters: FilterValues): {
  since?: string
  before?: string
} {
  switch (filters.range) {
    case '24h':
      return { since: relativeIso(24 * 60 * 60 * 1000) }
    case '7d':
      return { since: relativeIso(7 * 24 * 60 * 60 * 1000) }
    case '30d':
      return { since: relativeIso(30 * 24 * 60 * 60 * 1000) }
    case 'custom':
      return {
        since: localToIso(filters.since),
        before: localToIso(filters.before),
      }
    case 'all':
    default:
      return {}
  }
}

function relativeIso(ms: number): string {
  return new Date(Date.now() - ms).toISOString()
}

function localToIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
