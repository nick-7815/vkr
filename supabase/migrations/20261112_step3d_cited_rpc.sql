-- Шаг 3д (фикс 2026-11-12): отметка «есть ссылка въ дипломѣ».
--
-- Проблема: RLS-политика bib_student_update запрещает студенту менять
-- принятые (approved) источники — и это правильно для содержимого.
-- Но отметка «есть ссылка въ дипломѣ» — личный чек-лист студента по ВСЕМЪ
-- своимъ источникамъ, включая принятые. Черезъ обычный update RLS молча
-- пропускалъ approved-строки: массовая отметка давала «0 изъ N»,
-- одиночная — галочку, слетавшую после перезагрузки.
--
-- Решеніе: SECURITY DEFINER-функции, которые сами проверяют владельца
-- (student_id = auth.uid()) и обновляют только его строки.

CREATE OR REPLACE FUNCTION public.bib_set_cited(p_item uuid, p_cited boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Не авторизованъ';
  END IF;
  UPDATE public.bibliography_items
     SET cited = p_cited, updated_at = now()
   WHERE id = p_item AND student_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Источникъ не найденъ или принадлежитъ не тебѣ';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bib_set_all_cited(p_cited boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Не авторизованъ';
  END IF;
  UPDATE public.bibliography_items
     SET cited = p_cited, updated_at = now()
   WHERE student_id = auth.uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.bib_set_cited(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bib_set_all_cited(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bib_set_cited(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bib_set_all_cited(boolean) TO authenticated;
