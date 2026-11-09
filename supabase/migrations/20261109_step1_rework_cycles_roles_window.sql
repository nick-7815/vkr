-- ═══════════════════════════════════════════════════════════════════
-- ШАГ 1. Правки по итоговой BPMN-схеме «как надо»:
--   1а) Приказ: статус rework (замечания ректората) + текст замечаний,
--       штамп замечаний на подачах (видит наставник)
--   1б) Циклы уходят секретарю (RLS), замзав правит только даты
--   1в) Роль norm_controller упраздняется (= руководитель ВКР)
--   1г) Новое окно регламента applications («Каталогъ и подача»)
-- Запускать в SQL Editor Supabase целиком, один раз.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1а. Приказ: замечания ректората ─────────────────────────────────

-- текст замечаний у самого приказа (история для канцелярии)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rework_note text;

-- статус 'rework' разрешён: draft → sent → rework → sent → signed → published
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('draft', 'sent', 'rework', 'signed', 'published'));

-- штамп замечаний на подаче: наставник прочитает его на своей странице тем
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS rework_note text;

-- ── 1в. Роли: нормоконтролёр = руководитель ВКР ────────────────────

-- существующих нормоконтролёров переводим в наставники
UPDATE public.profiles SET role = 'supervisor' WHERE role = 'norm_controller';

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('student', 'supervisor', 'reviewer', 'secretary', 'head', 'deputy'));

-- ── 1г. Окно регламента «Каталогъ и подача» (осень) ────────────────

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.regulation_windows'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%stage%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.regulation_windows DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.regulation_windows
  ADD CONSTRAINT regulation_windows_stage_check
  CHECK (stage IN (
    'applications', 'bibliography', 'screening1', 'screening2',
    'code_review', 'upload_pdf', 'normcontrol', 'predefense', 'defense'
  ));

-- ── 1б. RLS: секретарю — управление циклами и окнами ───────────────
-- (замзав уже имеет права: его страницы работали; добавляем секретаря)

DO $$
BEGIN
  -- циклы: создавать и переименовывать/менять статус — секретарь
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cycles' AND policyname = 'cycles_secretary_insert') THEN
    CREATE POLICY cycles_secretary_insert ON public.cycles
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'secretary')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cycles' AND policyname = 'cycles_secretary_update') THEN
    CREATE POLICY cycles_secretary_update ON public.cycles
      FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'secretary')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'secretary')
      );
  END IF;

  -- окна регламента: секретарю всё (сохранение = delete + insert)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'regulation_windows' AND policyname = 'regulation_windows_secretary_all') THEN
    CREATE POLICY regulation_windows_secretary_all ON public.regulation_windows
      FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'secretary')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'secretary')
      );
  END IF;
END $$;

-- ── Готово ───────────────────────────────────────────────────────────
