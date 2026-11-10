-- ═══ Исправление: студент видит СВОБОДНЫЕ темы каталога (catalog),
--     а не «утверждённые приказом» (approved) ═══

-- 1) Просмотр тем: свободные темы каталога + своя тема (даже после приказа)
DROP POLICY IF EXISTS topics_student_select ON public.topics;
CREATE POLICY topics_student_select ON public.topics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'student' AND p.is_active = true
    )
    AND (
      topics.status = 'catalog'
      OR EXISTS (
        SELECT 1 FROM public.applications a
        WHERE a.topic_id = topics.id
          AND a.cycle_id = topics.cycle_id
          AND a.student_id = auth.uid()
      )
    )
  );

-- 2) Подача студента — только на свободную тему СВОЕГО цикла
DROP POLICY IF EXISTS applications_student_insert ON public.applications;
CREATE POLICY applications_student_insert ON public.applications
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'student' AND p.is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.cycles c
      WHERE c.id = cycle_id AND c.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.regulation_windows w
      WHERE w.cycle_id = cycle_id AND w.stage = 'applications'
        AND w.starts_on::text <= CURRENT_DATE::text
        AND w.ends_on::text >= CURRENT_DATE::text
    )
    AND EXISTS (
      SELECT 1 FROM public.topics t
      WHERE t.id = topic_id AND t.status = 'catalog' AND t.cycle_id = cycle_id
    )
    AND final_title = (SELECT t.title FROM public.topics t WHERE t.id = topic_id)
  );