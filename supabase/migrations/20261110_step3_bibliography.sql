-- ═══════════════════════════════════════════════════════════════════
-- ШАГ 3. Библиография: студент ведёт список литературы,
--        наставник визирует (принято / замечание)
--   3а) таблица bibliography_items
--   3б) функции-прослойки против рекурсии RLS (как в step2c)
--   3в) политики RLS: студент — своё, наставник — своих, канцелярия — всё
-- Запускать в SQL Editor Supabase целиком, один раз.
-- ═══════════════════════════════════════════════════════════════════

-- ── 3а. Таблица списка литературы ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bibliography_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1,
  -- вид источника: книга / статья / интернет-ресурс / стандарт / прочее
  kind text NOT NULL DEFAULT 'book'
    CHECK (kind IN ('book','article','url','standard','other')),
  authors text NOT NULL DEFAULT '',
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  -- издательство / журнал / сайт
  source text,
  year integer CHECK (year IS NULL OR (year >= 1900 AND year <= 2100)),
  url text,
  -- виза наставника: pending = на проверке, approved = принято, rework = замечание
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rework')),
  comment text,
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bibliography_application_idx
  ON public.bibliography_items (application_id, position);
CREATE INDEX IF NOT EXISTS bibliography_cycle_student_idx
  ON public.bibliography_items (cycle_id, student_id);

ALTER TABLE public.bibliography_items ENABLE ROW LEVEL SECURITY;

-- ── 3б. Функции-прослойки (SECURITY DEFINER, как student_owns_topic_application)
--    снимают RLS при проверке права и не дают infinite recursion ──
CREATE OR REPLACE FUNCTION public.bib_owned_by_student(p_item uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bibliography_items b
    WHERE b.id = p_item
      AND b.student_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.bib_item_supervisor(p_item uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bibliography_items b
    JOIN public.applications a ON a.id = b.application_id
    JOIN public.topics t ON t.id = a.topic_id
    WHERE b.id = p_item
      AND t.supervisor_id = auth.uid()
  )
$$;

-- ── 3в. Политики RLS ────────────────────────────────────────────────

-- чтение: студент — своё; наставник — списки своих дипломников;
--         канцелярия (секретарь/замзав/заведующий) — всё
DROP POLICY IF EXISTS bib_read ON public.bibliography_items;
CREATE POLICY bib_read ON public.bibliography_items
  FOR SELECT TO authenticated
  USING (
    my_role() = ANY (ARRAY['secretary'::user_role, 'deputy'::user_role,
                           'head'::user_role])
    OR public.bib_owned_by_student(id)
    OR public.bib_item_supervisor(id)
  );

-- вставка: студент сам, за себя, в окно «Литература»,
--          тема утверждена приказом (подача approved/published)
DROP POLICY IF EXISTS bib_student_insert ON public.bibliography_items;
CREATE POLICY bib_student_insert ON public.bibliography_items
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'student' AND p.is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.student_id = auth.uid()
        AND a.cycle_id = cycle_id
        AND a.status IN ('approved','published')
    )
    AND EXISTS (
      SELECT 1 FROM public.regulation_windows w
      WHERE w.cycle_id = cycle_id
        AND w.stage = 'bibliography'
        AND w.starts_on::text <= CURRENT_DATE::text
        AND w.ends_on::text  >= CURRENT_DATE::text
    )
  );

-- правка студентом: свои ещё не принятые источники, в окне;
-- после правки замечания источник снова «на проверке» (status='pending')
DROP POLICY IF EXISTS bib_student_update ON public.bibliography_items;
CREATE POLICY bib_student_update ON public.bibliography_items
  FOR UPDATE TO authenticated
  USING (
    public.bib_owned_by_student(id)
    AND status IN ('pending','rework')
  )
  WITH CHECK (
    student_id = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.student_id = auth.uid()
        AND a.cycle_id = cycle_id
        AND a.status IN ('approved','published')
    )
    AND EXISTS (
      SELECT 1 FROM public.regulation_windows w
      WHERE w.cycle_id = cycle_id
        AND w.stage = 'bibliography'
        AND w.starts_on::text <= CURRENT_DATE::text
        AND w.ends_on::text  >= CURRENT_DATE::text
    )
  );

-- удаление студентом: свои не принятые источники, в окне
DROP POLICY IF EXISTS bib_student_delete ON public.bibliography_items;
CREATE POLICY bib_student_delete ON public.bibliography_items
  FOR DELETE TO authenticated
  USING (
    public.bib_owned_by_student(id)
    AND status IN ('pending','rework')
    AND EXISTS (
      SELECT 1 FROM public.regulation_windows w
      WHERE w.cycle_id = cycle_id
        AND w.stage = 'bibliography'
        AND w.starts_on::text <= CURRENT_DATE::text
        AND w.ends_on::text  >= CURRENT_DATE::text
    )
  );

-- виза: наставник по СВОИМ дипломникам; канцелярия — по всем
-- (серверный экшен пишёт только статус-блок: status/comment/reviewed_by/reviewed_at)
DROP POLICY IF EXISTS bib_review_update ON public.bibliography_items;
CREATE POLICY bib_review_update ON public.bibliography_items
  FOR UPDATE TO authenticated
  USING (
    my_role() = ANY (ARRAY['secretary'::user_role, 'deputy'::user_role,
                           'head'::user_role])
    OR public.bib_item_supervisor(id)
  )
  WITH CHECK (status IN ('pending','approved','rework'));

-- ── Готово: откройте окно этапа bibliography в «Циклы» (даты),
--    пункты меню «Литература» появятся у студента и наставника ──
