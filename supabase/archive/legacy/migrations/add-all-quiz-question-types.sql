-- Extend question_type check to all 34 auto-gradable types.
alter table public.questions drop constraint if exists questions_question_type_check;
alter table public.questions add constraint questions_question_type_check
  check (question_type in (
    -- Selection & arrangement
    'multiple_choice',
    'true_false',
    'multiple_select',
    'inline_dropdown',
    'matching',
    'categorization',
    'ordering',
    'hottext',
    'choice_grid',
    -- Text entry
    'short_answer',
    'multi_blank',
    'cloze',
    'keyword_scored',
    -- Numeric
    'numeric_tolerance',
    'matrix_whole',
    'matrix_per_cell',
    'vector',
    'integer',
    'significant_figures',
    'number_with_units',
    'slider',
    -- Symbolic & structured math
    'symbolic_expression',
    'equation_input',
    'form_constrained_algebra',
    'antiderivative',
    'interval_set_list',
    'chemical_formula',
    -- Non-autogradable
    'free_response',
    'unknown'
  ));
