-- ── Шаг 3д: автопроверка состава списка литературы ──
-- Шлюз BPMN «Список соответствует требованиям?»:
--   ≥30 источников, ≥20% зарубежных, обязательные базы
--   (библиотека ВолгГТУ, eLIBRARY.RU, Scopus, интернет-источники),
--   на каждый источник — ссылка в тексте.

-- origin — база, откуда взят источник (проверка «обязательных баз» методички):
--   vstu     = библиотека ВолгГТУ
--   elibrary = eLIBRARY.RU
--   scopus   = Scopus
--   web      = интернет-источник
--   other    = прочее
--   NULL     = не указана (подставляется автоматически по URL/изданию)
ALTER TABLE public.bibliography_items
  ADD COLUMN IF NOT EXISTS origin text
    CHECK (origin IS NULL OR origin IN ('vstu', 'elibrary', 'scopus', 'web', 'other'));

-- cited — студент отметил, что на источник есть ссылка в тексте работы
-- (текст ВКР ведётся вне трекера, поэтому отметка — самоподтверждение)
ALTER TABLE public.bibliography_items
  ADD COLUMN IF NOT EXISTS cited boolean NOT NULL DEFAULT false;
