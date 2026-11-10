-- ═══════════════════════════════════════════════════════════════════
-- ШАГ 2. Студенты: самостоятельная подача в окне «Каталогъ и подача»
--   2а) RLS: студент читает утверждённые темы (каталог)
--   2б) RLS: студент читает свои подачи
--   2в) RLS: студент подает за себя (окно + утверждённая тема + активный цикл)
--   2г) RLS: студент отзывает свою подачу (пока «подано», в окне)
--   2д) Уникальность: 1 подача на студента в цикле, 1 подача на тему в цикле
-- Запускать в SQL Editor Supabase целиком, один раз.
-- ═══════════════════════════════════════════════════════════════════

-- ── 2д. Уникальность подач (защита на уровне базы) ──────────────────
-- Если индекс падает с ошибкой дубликатов — сначала выполни проверку ниже.
-- Проверка дубликатов (должно вернуть 0 строк):
--   SELECT cycle_id, student_id, count(*) FROM public.applications GROUP BY 1,2 HAVING count(*) > 1;
--   SELECT cycle_id, topic_id,  count(*) FROM public.applications GROUP BY 1,2 HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS applications_student_cycle_unique
  ON public.applications (cycle_id, student_id);

CREATE UNIQUE INDEX IF NOT EXISTS applications_topic_cycle_unique
  ON public.applications (cycle_id, topic_id);

-- ── 2а. Каталог утверждённых тем для студента ────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'topics' AND policyname = 'topics_student_select') THEN
    CREATE POLICY topics_student_select ON public.topics
      FOR SELECT TO authenticated
      USING (
        status = 'approved'
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'student'
        )
      );
  END IF;
END $$;

-- ── 2б. Свои подачи: студент читает только свои записи ──────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'applications' AND policyname = 'applications_student_select') THEN
    CREATE POLICY applications_student_select ON public.applications
      FOR SELECT TO authenticated
      USING (
        applications.student_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'student'
        )
      );
  END IF;
END $$;

-- ── 2в. Самоподача: только за себя, в окно, на утверждённую тему ────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'applications' AND policyname = 'applications_student_insert') THEN
    CREATE POLICY applications_student_insert ON public.applications
      FOR INSERT TO authenticated
      WITH CHECK (
        applications.student_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'student'
            AND COALESCE(p.is_active, true)
        )
        AND EXISTS (
          SELECT 1 FROM public.cycles c
          WHERE c.id = applications.cycle_id AND c.status = 'active'
        )
        AND EXISTS (
          SELECT 1 FROM public.regulation_windows w
          WHERE w.cycle_id = applications.cycle_id
            AND w.stage = 'applications'
            AND w.starts_on::text <= CURRENT_DATE::text
            AND w.ends_on::text  >= CURRENT_DATE::text
        )
        AND EXISTS (
          SELECT 1 FROM public.topics t
          WHERE t.id = applications.topic_id AND t.status = 'approved'
        )
        AND applications.final_title =
            (SELECT t.title FROM public.topics t WHERE t.id = applications.topic_id)
      );
  END IF;
END $$;

-- ── 2г. Отзыв своей подачи: пока «подано» и окно открыто ────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'applications' AND policyname = 'applications_student_delete') THEN
    CREATE POLICY applications_student_delete ON public.applications
      FOR DELETE TO authenticated
      USING (
        applications.student_id = auth.uid()
        AND applications.status = 'submitted'
        AND EXISTS (
          SELECT 1 FROM public.cycles c
          WHERE c.id = applications.cycle_id AND c.status = 'active'
        )
        AND EXISTS (
          SELECT 1 FROM public.regulation_windows w
          WHERE w.cycle_id = applications.cycle_id
            AND w.stage = 'applications'
            AND w.starts_on::text <= CURRENT_DATE::text
            AND w.ends_on::text  >= CURRENT_DATE::text
        )
      );
  END IF;
END $$;

-- ── Готово ───────────────────────────────────────────────────────────