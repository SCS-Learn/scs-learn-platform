-- Extend auto-gradable question types (true/false and multiple-select).
alter table public.questions drop constraint if exists questions_question_type_check;
alter table public.questions add constraint questions_question_type_check
  check (question_type in (
    'multiple_choice',
    'short_answer',
    'true_false',
    'multiple_select',
    'free_response',
    'unknown'
  ));
