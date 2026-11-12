/* ── Шаг 3д: автопроверка состава списка литературы ──
   Один модуль на обе страницы (студент и наставник) — цифры разъехаться не могут.
   Требования методички (изъ comments въ references.bib репо ВКР):
   не менее 30 источников; не менее 20% зарубежных; обязательны
   библиотека ВолгГТУ, eLIBRARY.RU, Scopus, интернет-источники;
   на каждый источник — ссылка въ текстѣ. */

export const GOST_TARGETS = {
  minItems: 30,
  minForeignShare: 0.2,
} as const

export const ORIGIN_LABELS: Record<string, string> = {
  vstu: 'Б-ка ВолгГТУ',
  elibrary: 'eLIBRARY.RU',
  scopus: 'Scopus',
  web: 'Интернетъ-источникъ',
  other: 'Прочее',
}

/* Базы, присутствіе которыхъ въ спискѣ обязательно.
   hint — что студенту сделать, если базы нетъ (шаг 3д: понятные предупрежденія). */
export const REQUIRED_ORIGINS: Array<{ key: 'vstu' | 'elibrary' | 'scopus' | 'web'; label: string; hint: string }> = [
  { key: 'vstu', label: 'Б-ка ВолгГТУ', hint: 'добавь источникъ съ ссылкой на vstu.ru или выбери эту базу вручную въ формѣ' },
  { key: 'elibrary', label: 'eLIBRARY.RU', hint: 'добавь статью съ ссылкой на elibrary.ru или выбери эту базу вручную въ формѣ' },
  { key: 'scopus', label: 'Scopus', hint: 'добавь англоязычную статью съ ссылкой на scopus.com или выбери эту базу вручную въ формѣ' },
  { key: 'web', label: 'Интернетъ-источники', hint: 'добавь источникъ вида «интернетъ-ресурсъ» — онъ попадаетъ въ интернетъ-источники самъ' },
]

/* Зарубежный источник: латиница въ авторахъ/названіи и ни буквы кириллицы.
   Эвристика безъ поля «языкъ» — для списковъ ВКР работаетъ надёжно. */
export function isForeignSource(title: string, authors: string): boolean {
  const s = `${authors ?? ''} ${title ?? ''}`
  return /[A-Za-z]/.test(s) && !/[А-Яа-яЁё]/.test(s)
}

export type ComplianceItem = {
  origin: string | null
  cited: boolean
  title: string
  authors: string | null
}

export type Compliance = {
  total: number
  foreign: number
  foreignShare: number
  byOrigin: Record<string, number>
  cited: number
  /* чего не хватает до шлюза «список соответствует» — пустой массивъ = всѣ требования закрыты */
  missing: string[]
  ok: boolean
}

export function computeCompliance(items: ComplianceItem[]): Compliance {
  const total = items.length
  const foreign = items.filter((i) => isForeignSource(i.title, i.authors ?? '')).length
  const byOrigin: Record<string, number> = { vstu: 0, elibrary: 0, scopus: 0, web: 0 }
  for (const i of items) {
    if (i.origin && i.origin in byOrigin) byOrigin[i.origin]++
  }
  const cited = items.filter((i) => i.cited).length

  /* предупрежденія — сразу съ действіемъ: не «чего нетъ», а «что сделать» */
  const missing: string[] = []
  if (total < GOST_TARGETS.minItems) {
    missing.push(`источниковъ въ спискѣ ${total} изъ ${GOST_TARGETS.minItems} — добавь ещё ${GOST_TARGETS.minItems - total}`)
  }
  if (total > 0 && foreign / total < GOST_TARGETS.minForeignShare) {
    missing.push(`зарубежныхъ только ${Math.round((foreign / total) * 100)}% (${foreign} изъ ${total}) — нужно не менее 20%, добавь источниковъ на английскомъ`)
  }
  for (const r of REQUIRED_ORIGINS) {
    if (!byOrigin[r.key]) missing.push(`нетъ ни одного источника изъ «${r.label}» — ${r.hint}`)
  }
  if (total > 0 && cited < total) {
    missing.push(`у ${total - cited} изъ ${total} нетъ ссылки въ дипломѣ — поставь галочку, когда добавишь ссылку [N] на источникъ въ текстъ диплома`)
  }

  return {
    total,
    foreign,
    foreignShare: total ? foreign / total : 0,
    byOrigin,
    cited,
    missing,
    ok: total > 0 && missing.length === 0,
  }
}
