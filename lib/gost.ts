/* ── Единая строка описания по ГОСТ Р 7.0.5-2008 ──
   Одинъ сборщикъ на весьъ трекеръ: списокъ студента, видъ наставника,
   рефчекеръ (DOI/ISBN/URL), будущій экспортъ для библиотеки и Шагъ 3д.
   Входъ — те же поля, что хранятся въ bibliography_items.
   Стиль строки — «лёгкій ГОСТъ»: безъ повторения авторовъ за косой чертой
   и безъ места изданія (полей для нихъ въ формѣ нетъ). */

export type GostKind = 'book' | 'article' | 'url' | 'standard' | 'other'

export type GostFields = {
  kind: GostKind | string
  authors: string
  title: string
  /** издательство (книга) / журналъ (статья) / сайтъ (интернет-ресурсъ) */
  source?: string | null
  year?: string | number | null
  url?: string | null
}

function accessDate(): string {
  const n = new Date()
  return `${String(n.getDate()).padStart(2, '0')}.${String(n.getMonth() + 1).padStart(2, '0')}.${n.getFullYear()}`
}

/* ГОСТ Р 7.0.5-2008: статья изъ журнала */
export function gostArticle(m: {
  authors: string
  title: string
  journal: string
  year: string
  volume: string
  issue: string
  pages: string
  doi: string
  url: string
}): string {
  let s = m.authors ? `${m.authors} ` : ''
  s += m.title || 'Безъ названія'
  if (m.journal) s += ` // ${m.journal}`
  if (m.year) s += `. ${m.year}`
  const vi = [m.volume ? `Т. ${m.volume}` : '', m.issue ? `№ ${m.issue}` : ''].filter(Boolean).join(', ')
  if (vi) s += `. ${vi}`
  if (m.pages) s += `. С. ${m.pages}`
  if (m.doi) s += `. DOI ${m.doi}`
  else if (m.url) s += `. URL: ${m.url} (дата обращения: ${accessDate()})`
  return s + '.'
}

/* ГОСТ Р 7.0.5-2008: книга (а также стандартъ и «прочее») */
export function gostBook(m: {
  authors: string
  title: string
  publisher: string
  year: string
  pages: string
}): string {
  let s = m.authors ? `${m.authors} ` : ''
  s += m.title || 'Безъ названія'
  if (m.publisher) s += `. ${m.publisher}`
  if (m.year) s += `, ${m.year}`
  if (m.pages) s += `. ${m.pages} с.`
  return s + '.'
}

/* ГОСТ Р 7.0.5-2008: электронный ресурсъ */
export function gostWeb(m: { title: string; site: string; url: string }): string {
  let s = `${m.title || 'Безъ названія'} [Электронный ресурс]`
  if (m.site) s += ` // ${m.site}`
  s += `. URL: ${m.url} (дата обращения: ${accessDate()}).`
  return s
}

/* Строка по ГОСТъ изъ полей источника — какъ они хранятся въ БД.
   Используется при рендерѣ списка у студента и наставника,
   годится и для экспорта въ библиотеку. */
export function buildGostLine(f: GostFields): string {
  const title = (f.title ?? '').trim()
  const authors = (f.authors ?? '').trim()
  const source = (f.source ?? '').trim()
  const url = (f.url ?? '').trim()
  const year = f.year == null ? '' : String(f.year)

  if (f.kind === 'article') {
    return gostArticle({
      authors, title, journal: source, year,
      volume: '', issue: '', pages: '', doi: '', url,
    })
  }
  if (f.kind === 'url' && url) {
    return gostWeb({ title, site: source, url })
  }
  /* книга, стандартъ, «прочее», а также статья безъ журнала и URL безъ ссылки */
  return gostBook({ authors, title, publisher: source, year, pages: '' })
}
