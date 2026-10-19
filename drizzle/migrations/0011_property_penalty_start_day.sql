ALTER TABLE public.properties ADD COLUMN penalty_start_day integer;
ALTER TABLE public.properties ADD CONSTRAINT properties_penalty_start_day_range CHECK (penalty_start_day BETWEEN 1 AND 31);
COMMENT ON COLUMN public.properties.penalty_start_day IS 'Optional monthly late-penalty start day; null uses account due date plus grace period.';