-- ═══ Шаг 4. Просмотры: назначения рецензентов и карточки оценок ═══
-- Схема «как надо» (vkr-to-be_new.bpmn):
--   «Просмотр № 1 / № 2: оценка и комментарии в системе» —
--   два преподавателя, не руководитель студента;
--   в карточке просмотра — оценка, комментарий и контакт для консультации;
--   окно закрылось без оценки — просрочка видна заместителю заведующего.
-- Рецензенты — существующие наставники (role='supervisor'), новой роли нет:
-- преподавателя вносит секретарь с ролью наставника; если он никому не
-- наставник — видит только свои карточки просмотров, когда его назначат.

-- ── 1. Таблица назначений ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.screening_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id      uuid NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  supervisor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  screening_no  smallint NOT NULL CHECK (screening_no IN (1, 2)),
  grade         smallint CHECK (grade IN (2, 3, 4, 5)),
  comment       text,
  contact       text,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'done')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- один рецензент не смотрит одного студента дважды в одном просмотре
  CONSTRAINT screening_unique_slot
    UNIQUE (cycle_id, student_id, screening_no, supervisor_id)
);

CREATE INDEX IF NOT EXISTS screening_by_cycle_student
  ON public.screening_assignments (cycle_id, student_id);
CREATE INDEX IF NOT EXISTS screening_by_reviewer
  ON public.screening_assignments (supervisor_id);

-- ── 2. RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.screening_assignments ENABLE ROW LEVEL SECURITY;

-- канцелярия (секретарь/замзав/заведующий) — полное управление
CREATE POLICY screening_chancery ON public.screening_assignments
  FOR ALL TO authenticated
  USING (
    my_role() = ANY (ARRAY['secretary'::user_role, 'deputy'::user_role,
                           'head'::user_role])
  )
  WITH CHECK (
    my_role() = ANY (ARRAY['secretary'::user_role, 'deputy'::user_role,
                           'head'::user_role])
  );

-- рецензент (наставник): видит свои карточки и заполняет их
CREATE POLICY screening_reviewer_read ON public.screening_assignments
  FOR SELECT TO authenticated
  USING (supervisor_id = auth.uid());

CREATE POLICY screening_reviewer_update ON public.screening_assignments
  FOR UPDATE TO authenticated
  USING (supervisor_id = auth.uid())
  WITH CHECK (supervisor_id = auth.uid());

-- студент: видит свои просмотры — кто рецензент и что выставлено
CREATE POLICY screening_student_read ON public.screening_assignments
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());
