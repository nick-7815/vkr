-- ═══ Шаг 2c. Безопасность чтения + разрыв рекурсии RLS ═══

-- 1) гарантия включённого RLS
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

-- 2) чтение подач: наставник/канцелярия — все; студенту остаётся applications_student_select (свои)
DROP POLICY IF EXISTS appl_read ON public.applications;
CREATE POLICY appl_read ON public.applications
  FOR SELECT TO authenticated
  USING (
    my_role() = ANY (ARRAY['supervisor'::user_role, 'secretary'::user_role,
                           'deputy'::user_role, 'head'::user_role])
  );

-- 3) чтение тем: наставник/канцелярия — весь каталог; студенту — свободные + своя
DROP POLICY IF EXISTS topics_read ON public.topics;
CREATE POLICY topics_read ON public.topics
  FOR SELECT TO authenticated
  USING (
    my_role() = ANY (ARRAY['supervisor'::user_role, 'secretary'::user_role,
                           'deputy'::user_role, 'head'::user_role])
  );

-- 4) функция-прослойка против infinite recursion (topics → applications)
CREATE OR REPLACE FUNCTION public.student_owns_topic_application(p_topic uuid, p_cycle uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$   SELECT EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.topic_id = p_topic
      AND a.cycle_id = p_cycle
      AND a.student_id = auth.uid()
  )
 $$;

-- 5) политика студента на темы — через функцию вместо подзапроса
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
      OR public.student_owns_topic_application(topics.id, topics.cycle_id)
    )
  );