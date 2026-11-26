-- Remove calculated_numeric and calculated_multiple_choice question types.
alter table public.questions drop constraint if exists questions_question_type_check;
alter table public.questions add constraint questions_question_type_check
  check (question_type in (
    'multiple_choice', 'true_false', 'multiple_select',
    'inline_dropdown', 'matching', 'categorization', 'ordering', 'hottext',
    'choice_grid',
    'short_answer', 'multi_blank', 'cloze', 'keyword_scored',
    'numeric_tolerance', 'matrix_whole', 'matrix_per_cell', 'vector', 'integer',
    'significant_figures', 'number_with_units',
    'slider',
    'symbolic_expression', 'equation_input', 'form_constrained_algebra',
    'antiderivative', 'interval_set_list', 'chemical_formula',
    'free_response', 'unknown'
  ));

update public.questions
  set question_type = 'numeric_tolerance'
  where question_type = 'calculated_numeric';

update public.questions
  set question_type = 'multiple_choice'
  where question_type = 'calculated_multiple_choice';
