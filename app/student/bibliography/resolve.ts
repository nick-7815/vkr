'use server'

import { createClient } from '@/lib/supabase/server'
import { gostArticle, gostBook, gostWeb } from '@/lib/gost'

/* ── Рефчекер (Task_RefResolve из схемы процесса) ──
   Вход: строка с DOI, ISBN или URL.
   Метаданные: DOI → Crossref; ISBN → Google Books (запас — OpenLibrary);
   URL → разбор страницы (мета-теги citation_*, og:*).
   Выход: готовые поля формы + строка описания по ГОСТ Р 7.0.5-2008.
   Сборка строки — общий сборщик lib/gost.ts (он же рендерит список).
   Строка вставляется и в Word, и в Typst — формат работы не важен. */

type ResolvedSource = {
  success: true
  kind: 'book' | 'article' | 'url' | 'standard' | 'other'
  authors: string
  title: string
  source: string
  year: string
  url: string
  gost: string
  provider: string
}

type ResolveFail = { success: false; error: string }

const TIMEOUT_MS = 8000

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Сервис метаданных не ответил (HTTP ${res.status})`)
  return res.json()
}

/* «Фамилия И. О.» из { given, family } или готового name */
function formatAuthor(a: { given?: string; family?: string; name?: string }): string {
  if (a.family) {
    const initials = (a.given ?? '')
      .split(/[\s.]+/)
      .filter(Boolean)
      .map((p) => `${p[0].toUpperCase()}.`)
      .join(' ')
    return initials ? `${a.family} ${initials}` : a.family
  }
  return (a.name ?? '').trim()
}

/* до трёх авторов через запятую, дальше — «[и др.]» */
function joinAuthors(list: string[]): string {
  const clean = list.map((s) => s.trim()).filter(Boolean)
  if (clean.length === 0) return ''
  if (clean.length <= 3) return clean.join(', ')
  return `${clean.slice(0, 3).join(', ')} [и др.]`
}

/* ── DOI → Crossref ── */
async function resolveDoi(doi: string): Promise<ResolvedSource> {
  const data = (await fetchJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)) as {
    message?: any
  }
  const m = data.message
  if (!m) throw new Error('Crossref не вернул данных по этому DOI')

  const authors = joinAuthors((Array.isArray(m.author) ? m.author : []).map(formatAuthor))
  const title = String(m.title?.[0] ?? '').trim()
  const journal = String(m['container-title']?.[0] ?? '').trim()
  const year = String(m.issued?.['date-parts']?.[0]?.[0] ?? '')
  const volume = String(m.volume ?? '').trim()
  const issue = String(m.issue ?? '').trim()
  const pages = String(m.page ?? '').trim().replace('-', '–')
  const doiUrl = m.DOI ? `https://doi.org/${m.DOI}` : String(m.URL ?? '')
  const type = String(m.type ?? '')

  const kind: ResolvedSource['kind'] = type.startsWith('book')
    ? 'book'
    : type.includes('journal') || type.includes('proceedings')
      ? 'article'
      : 'other'

  return {
    success: true,
    kind,
    authors,
    title,
    source: journal,
    year,
    url: kind === 'article' ? doiUrl : '',
    provider: 'Crossref',
    gost: gostArticle({ authors, title, journal, year, volume, issue, pages, doi: String(m.DOI ?? ''), url: doiUrl }),
  }
}

/* ── ISBN → Google Books, запас — OpenLibrary ── */
async function resolveIsbn(isbn: string): Promise<ResolvedSource> {
  try {
    const data = (await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)) as {
      totalItems?: number
      items?: any[]
    }
    const v = data.items?.[0]?.volumeInfo
    if (v?.title) {
      const authors = joinAuthors((Array.isArray(v.authors) ? v.authors : []).map(String))
      const title = String(v.title).trim()
      const publisher = String(v.publisher ?? '').trim()
      const year = String(v.publishedDate ?? '').slice(0, 4)
      const pages = v.pageCount ? String(v.pageCount) : ''
      return {
        success: true,
        kind: 'book',
        authors,
        title,
        source: publisher,
        year,
        url: '',
        provider: 'Google Books',
        gost: gostBook({ authors, title, publisher, year, pages }),
      }
    }
  } catch {
    /* тишина — идём в OpenLibrary */
  }

  const data = (await fetchJson(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
  )) as Record<string, any>
  const b = data[`ISBN:${isbn}`]
  if (!b) throw new Error('Книга с таким ISBN не найдена')

  const authors = joinAuthors((Array.isArray(b.authors) ? b.authors : []).map((a: any) => String(a.name ?? '')))
  const title = String(b.title ?? '').trim()
  const publisher = String(b.publishers?.[0]?.name ?? '').trim()

  /* OpenLibrary — народный каталог, в нём встречается рекламный спам:
     отбрасываем записи вида «Fomo App Referral Code», где название = издательству */
  if (!title || title === publisher || /referral[\s-]?code|promo[\s-]?code|coupon|промокод/i.test(`${title} ${publisher}`)) {
    throw new Error('Каталог вернул рекламную запись — проверьте ISBN или внесите книгу вручную')
  }

  const year = String(b.publish_date ?? '').replace(/\D/g, '').slice(0, 4)
  const pages = b.number_of_pages ? String(b.number_of_pages) : ''

  return {
    success: true,
    kind: 'book',
    authors,
    title,
    source: publisher,
    year,
    url: '',
    provider: 'OpenLibrary',
    gost: gostBook({ authors, title, publisher, year, pages }),
  }
}

/* ── URL → разбор страницы: citation_*, og:*, <title> ── */
async function resolveUrl(pageUrl: string): Promise<ResolvedSource> {
  let html = ''
  try {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VKRTracker/1.0; +refchecker)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = (await res.text()).slice(0, 400_000)
  } catch {
    throw new Error('Страница не открылась — проверьте ссылку')
  }

  const decode = (s: string) =>
    s
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  /* мета-тег в двух порядках атрибутов: name→content и content→name */
  const meta = (name: string): string => {
    const a = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i')
    const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["']`, 'i')
    return decode(html.match(a)?.[1] ?? html.match(b)?.[1] ?? '')
  }
  const metaAll = (name: string): string[] => {
    const out: string[] = []
    const reA = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'gi')
    const reB = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["']`, 'gi')
    for (const re of [reA, reB]) for (const m of html.matchAll(re)) out.push(decode(m[1]))
    return out.filter(Boolean)
  }

  const title =
    meta('citation_title') || meta('og:title') || meta('DC.Title') ||
    decode(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '')
  if (!title) throw new Error('На странице не нашлось названия — внесите источник руками')

  const journal = meta('citation_journal_title')
  const authors = joinAuthors(metaAll('citation_author'))
  const year = (meta('citation_publication_date') || meta('citation_date') || meta('citation_online_date')).slice(0, 4)
  const volume = meta('citation_volume')
  const issue = meta('citation_issue')
  const first = meta('citation_firstpage')
  const last = meta('citation_lastpage')
  const pages = last ? `${first}–${last}` : first
  const site = meta('og:site_name') || pageUrl.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')

  if (journal) {
    return {
      success: true,
      kind: 'article',
      authors,
      title,
      source: journal,
      year,
      url: pageUrl,
      provider: 'страница издания',
      gost: gostArticle({ authors, title, journal, year, volume, issue, pages, doi: '', url: pageUrl }),
    }
  }

  return {
    success: true,
    kind: 'url',
    authors,
    title,
    source: site,
    year,
    url: pageUrl,
    provider: 'страница источника',
    gost: gostWeb({ title, site, url: pageUrl }),
  }
}

/* ── Главный вход: определить тип строки и разослать ── */
export async function resolveSourceRef(query: string): Promise<ResolvedSource | ResolveFail> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Не авторизован')

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'student') throw new Error('Доступ только для студентов')
    if (profile.is_active === false) throw new Error('Учетная запись отключена')

    const raw = String(query ?? '').trim()
    if (!raw) return { success: false, error: 'Введите DOI, ISBN или ссылку' }

    const isUrl = /^https?:\/\//i.test(raw)
    const doiMatch = raw.match(/10\.\d{4,9}\/\S+/i)
    const digits = raw.replace(/[\s-]/g, '')

    if (doiMatch && (!isUrl || /doi\.org/i.test(raw))) {
      const doi = doiMatch[0].replace(/[),.;]+$/, '')
      return await resolveDoi(doi)
    }
    if (/^(97[89]\d{10}|\d{9}[\dXx])$/.test(digits)) {
      return await resolveIsbn(digits)
    }
    if (isUrl) {
      return await resolveUrl(raw)
    }

    return { success: false, error: 'Не похоже на DOI, ISBN или ссылку — проверьте строку' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const friendly =
      /aborted|timeout/i.test(msg)
        ? 'Источник не отвечает — попробуйте ещё раз'
        : /fetch failed|ENOTFOUND|ECONNREFUSED/i.test(msg)
          ? 'Сервис метаданных недоступен — попробуйте позже'
          : msg
    return { success: false, error: friendly }
  }
}