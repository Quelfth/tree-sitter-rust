/**
 * @file Rust grammar for tree-sitter
 * @author Maxim Sokolov <maxim0xff@gmail.com>
 * @author Max Brunsfeld <maxbrunsfeld@gmail.com>
 * @author Amaan Qureshi <amaanq12@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// https://doc.rust-lang.org/reference/expressions.html#expression-precedence
const PREC = {
  call: 15,
  field: 14,
  try: 13,
  unary: 12,
  cast: 11,
  multiplicative: 10,
  additive: 9,
  shift: 8,
  bitand: 7,
  bitxor: 6,
  bitor: 5,
  comparative: 4,
  and: 3,
  or: 2,
  range: 1,
  assign: 0,
  closure: -1,
};

// https://doc.rust-lang.org/reference/tokens.html#punctuation
const TOKEN_TREE_NON_SPECIAL_PUNCTUATION = [
  '+', '-', '*', '/', '%', '^', '!', '&', '|', '&&', '||', '<<',
  '>>', '+=', '-=', '*=', '/=', '%=', '^=', '&=', '|=', '<<=',
  '>>=', '=', '==', '!=', '>', '<', '>=', '<=', '@', '_', '.',
  '..', '...', '..=', ',', ';', ':', '::', '->', '=>', '#', '?',
];

module.exports = grammar({
  name: 'rust',

  extras: $ => [
    /\s/,
    $.line_comment,
    $.block_comment,
  ],

  externals: $ => [
    $.string_content,
    $._raw_string_literal_start,
    $.raw_string_literal_content,
    $._raw_string_literal_end,
    $.char_prefix,
    $.char_quote,
    $.lifetime_quote,
    $.literal_suffix,
    $.hexadecimal_prefix,
    $.binary_prefix,
    $.octal_prefix,
    $.decimal_point,
    $.exponent_e,
    $._outer_block_doc_comment_marker,
    $._inner_block_doc_comment_marker,
    $._block_comment_content,
    $._line_doc_content,
    $._error_sentinel,
  ],

  supertypes: $ => [
    $._expression,
    $._type,
    $._literal,
    $._literal_pattern,
    $._declaration_statement,
    $._pattern,
  ],

  inline: $ => [
    $._path,
    $._type_name,
    $._tokens,
    $._field_name,
    $._non_special_token,
    $._declaration_statement,
    $._reserved_keyword,
    $._expression_ending_with_block,
  ],

  conflicts: $ => [
    // Local ambiguity due to anonymous types:
    // See https://internals.rust-lang.org/t/pre-rfc-deprecating-anonymous-parameters/3710
    [$._type, $._pattern],
    [$.unit_type, $.tuple_pattern],
    [$.scoped_name, $.scoped_type_name],
    [$.parameters, $._pattern],
    [$.parameters, $.tuple_struct_pattern],
    [$.type_parameters, $.for_lifetimes],
    [$.array_expression],
    [$.visibility_modifier],
  ],

  word: $ => $.identifier,

  rules: {
    source_file: $ => seq(
      optional($.shebang),
      repeat($._statement),
    ),

    _statement: $ => choice(
      $.expression_statement,
      $._declaration_statement,
    ),

    empty_statement: _ => ';',

    expression_statement: $ => choice(
      seq($._expression, ';'),
      prec(1, $._expression_ending_with_block),
    ),

    _declaration_statement: $ => choice(
      $.const_item,
      $.macro_invocation,
      $.macro_definition,
      $.empty_statement,
      $.attribute_item,
      $.inner_attribute_item,
      $.mod_item,
      $.foreign_mod_item,
      $.struct_item,
      $.union_item,
      $.enum_item,
      $.type_item,
      $.function_item,
      $.function_signature_item,
      $.impl_item,
      $.trait_item,
      $.associated_type,
      $.let_declaration,
      $.use_declaration,
      $.extern_crate_declaration,
      $.static_item,
    ),

    // Section - Macro definitions

    macro_definition: $ => {
      const rules = seq(
        repeat(seq($.macro_rule, ';')),
        optional($.macro_rule),
      );

      return seq(
        'macro_rules!',
        field('name', choice(
          $.name,
          $._reserved_keyword,
        )),
        choice(
          seq('(', rules, ')', ';'),
          seq('[', rules, ']', ';'),
          seq('{', rules, '}'),
        ),
      );
    },

    macro_rule: $ => seq(
      field('left', $.token_tree_pattern),
      '=>',
      field('right', $.token_tree),
    ),

    _token_pattern: $ => choice(
      $.token_tree_pattern,
      $.token_repetition_pattern,
      $.token_binding_pattern,
      $.metavariable,
      $._non_special_token,
    ),

    token_tree_pattern: $ => choice(
      seq('(', repeat($._token_pattern), ')'),
      seq('[', repeat($._token_pattern), ']'),
      seq('{', repeat($._token_pattern), '}'),
    ),

    token_binding_pattern: $ => prec(1, seq(
      field('name', $.metavariable),
      ':',
      field('type', $.fragment_specifier),
    )),

    token_repetition_pattern: $ => seq(
      '$', '(', repeat($._token_pattern), ')', optional(/[^+*?]+/), choice('+', '*', '?'),
    ),

    fragment_specifier: _ => choice(
      'block', 'expr', 'ident', 'item', 'lifetime', 'literal', 'meta', 'pat',
      'path', 'stmt', 'tt', 'ty', 'vis',
    ),

    _tokens: $ => choice(
      $.token_tree,
      $.token_repetition,
      $.metavariable,
      $._non_special_token,
    ),

    token_tree: $ => choice(
      seq('(', repeat($._tokens), ')'),
      seq('[', repeat($._tokens), ']'),
      seq('{', repeat($._tokens), '}'),
    ),

    token_repetition: $ => seq(
      '$', '(', repeat($._tokens), ')', optional(/[^+*?]+/), choice('+', '*', '?'),
    ),

    // Matches non-delimiter tokens common to both macro invocations and
    // definitions. This is everything except $ and metavariables (which begin
    // with $).
    _non_special_token: $ => choice(
      $._literal, $.name, 'mut', 'self', 'super', 'crate',
      prec.right(repeat1(choice(...TOKEN_TREE_NON_SPECIAL_PUNCTUATION))),
      '\'',
      'as', 'async', 'await', 'break', 'const', 'continue', 'default', 'enum', 'fn', 'for', 'gen',
      'if', 'impl', 'let', 'loop', 'match', 'mod', 'pub', 'return', 'static', 'struct', 'trait',
      'type', 'union', 'unsafe', 'use', 'where', 'while',
    ),

    // Section - Declarations

    attribute_item: $ => seq(
      '#',
      '[',
      $._attribute,
      ']',
    ),

    inner_attribute_item: $ => seq(
      '#',
      '!',
      '[',
      $._attribute,
      ']',
    ),

    _attribute: $ => choice(
      $.unsafe_attribute,
      $.builtin_attribute,
      $.attribute_macro,
    ),

    unsafe_attribute: $ => seq('unsafe', '(', choice($.builtin_attribute, $.attribute_macro), ')'),

    builtin_attribute: $ => choice(
      seq('cfg', '(', $._cfg_predicate, ')'),
      seq('cfg_attr', '(', $._cfg_predicate, ',', sepBy1(',', $._attribute), optional(','), ')'),
      seq('ignore', optional(seq('=', $._any_string_literal))),
      seq('should_panic', optional(choice(
        seq('(', $.meta_name_value, ')'),
        seq('=', $._any_string_literal),
      ))),
      'automatically_derived',
      seq('macro_use', optional(seq('(', sepBy(',', $.name), optional(','), ')'))),
      seq('macro_export', optional(seq('(', 'local_inner_macros', ')'))),
      'proc_macro',
      seq('proc_macro_derive', '(', field('trait', $.name), optional(seq(',', $.proc_macro_derive_helper_attributes)), ')'),
      'proc_macro_attribute',
      $.lint_level_attribute,
      seq('must_use', optional(seq('=', $._any_string_literal))),
      seq('deprecated', optional(choice(
        seq('(', sepBy(',', $.meta_name_value), optional(','), ')'),
        seq('=', $._any_string_literal),
      ))),
      seq('crate_name', '=', $._any_string_literal),
      seq('crate_type', '=', $._any_string_literal),
      seq('link', '(', sepBy(',', $.meta_name_value), optional(','), ')'),
      seq('link_name', '=', $._any_string_literal),
      'no_link',
      'repr',
      seq('export_name', '=', $._any_string_literal),
      seq('link_section', '=', $._any_string_literal),
      'no_mangle',
      seq('used', optional(seq('(', choice('compiler', 'linker'), ')'))),
      seq('link_ordinal', '(', $.integer_literal, ')'),
      'naked',
      seq('recursion_limit', '=', $._any_string_literal),
      seq('type_length_limit', '=', $._any_string_literal),
      'no_main',
      seq('path', '=', $._any_string_literal),
      'no_std',
      'no_implicit_prelude',
      'non_exhaustive',
      seq('windows_subsystem', '=', $._any_string_literal),
      'panic_handler',
      seq('inline', optional(seq('(', choice('always', 'never'), ')'))),
      'cold',
      'no_builtins',
      seq('target_feature', '(', sepBy(',', $.meta_name_value), optional(','), ')'),
      'track_caller',
      seq('instruction_set', '(', sepBy(',', $.simple_path), optional(','), ')'),
      seq('doc', choice(
        seq('(', choice('hidden', 'inline'), ')'),
        seq('=', $._any_string_literal),
      )),
      seq('debugger_visualizer', '(', sepBy(',', $.meta_name_value), optional(','), ')'),
      seq('collapse_debuginfo', '(', choice('no', 'external', 'yes'), ')'),
      seq('feature', '(', sepBy(',', $.name), optional(','), ')'),
      seq('stable', '(', sepBy(',', $.meta_name_value), optional(','), ')'),
      seq('unstable', '(', sepBy(',', $.meta_name_value), optional(','), ')'),
      'unstable_feature_bound',
      seq('rustc_const_unstable', '(', sepBy(',', $.meta_name_value), optional(','), ')'),
      seq('rustc_const_stable', '(', sepBy(',', $.meta_name_value), optional(','), ')'),
      seq('rustc_default_body_unstable', '(', sepBy(',', $.meta_name_value), optional(','), ')'),
      seq('allow_internal_unstable', optional(seq('(', sepBy(',', $.name), optional(','), ')'))),
      'allow_interal_unsafe',
      'rustc_eii_foreign_item',
    ),

    lint_level_attribute: $ => seq(
      choice(
        'warn',
        'allow',
        'expect',
        'forbid',
        'deny',
      ),
      '(', 
      sepBy(',', $.simple_path),
      optional(seq(',', 'reason', '=', $._any_string_literal)),
      optional(','),
      ')',
    ),

    repr_modifier: $ => choice(
      'C',
      'Rust',
      'transparent',
      seq('align', '(', $.integer_literal, ')'),
      seq('packed', optional(seq('(', $.integer_literal, ')'))),
      $.primitive_repr,
    ),

    primitive_repr: $ => /[ui](8|16|32|64|128|size)/,

    meta_name_value: $ => seq($.name, '=', $._any_string_literal),

    _any_string_literal: $ => choice($.string_literal, $.raw_string_literal),

    _cfg_predicate: $ => choice(
      $.cfg_option,
      $.cfg_all,
      $.cfg_any,
      $.cfg_not,
      $.cfg_boolean,
    ),

    cfg_option: $ => seq(
      $.name,
      optional(seq('=', choice($.string_literal, $.raw_string_literal)))
    ),

    cfg_all: $ => seq('all', '(', sepBy(',', $._cfg_predicate), optional(','), ')'),
    cfg_any: $ => seq('any', '(', sepBy(',', $._cfg_predicate), optional(','), ')'),
    cfg_not: $ => seq('not', '(', $._cfg_predicate, ')'),

    cfg_boolean: $ => choice('true', 'false'),

    proc_macro_derive_helper_attributes: $ => seq('attributes', '(', sepBy(',', $.name), optional(','), ')'),

    attribute_macro: $ => seq(
      $._path,
      optional(choice(
        seq('=', field('value', $._expression)),
        field('arguments', alias($.delim_token_tree, $.token_tree)),
      )),
    ),

    mod_item: $ => seq(
      optional($.visibility_modifier),
      'mod',
      field('name', $.name),
      choice(
        ';',
        field('body', $.declaration_list),
      ),
    ),

    foreign_mod_item: $ => seq(
      optional($.visibility_modifier),
      $.extern_modifier,
      choice(
        ';',
        field('body', $.declaration_list),
      ),
    ),

    declaration_list: $ => seq(
      '{',
      repeat($._declaration_statement),
      '}',
    ),

    struct_item: $ => seq(
      optional($.visibility_modifier),
      'struct',
      field('name', $._type_name),
      field('type_parameters', optional($.type_parameters)),
      choice(
        seq(
          optional($.where_clause),
          field('body', $.field_declaration_list),
        ),
        seq(
          field('body', $.ordered_field_declaration_list),
          optional($.where_clause),
          ';',
        ),
        ';',
      ),
    ),

    union_item: $ => seq(
      optional($.visibility_modifier),
      'union',
      field('name', $._type_name),
      field('type_parameters', optional($.type_parameters)),
      optional($.where_clause),
      field('body', $.field_declaration_list),
    ),

    enum_item: $ => seq(
      optional($.visibility_modifier),
      'enum',
      field('name', $._type_name),
      field('type_parameters', optional($.type_parameters)),
      optional($.where_clause),
      field('body', $.enum_variant_list),
    ),

    enum_variant_list: $ => seq(
      '{',
      sepBy(',', seq(repeat($.attribute_item), $.enum_variant)),
      optional(','),
      '}',
    ),

    enum_variant: $ => seq(
      optional($.visibility_modifier),
      field('name', $.name),
      field('body', optional(choice(
        $.field_declaration_list,
        $.ordered_field_declaration_list,
      ))),
      optional(seq(
        '=',
        field('value', $._expression),
      )),
    ),

    field_declaration_list: $ => seq(
      '{',
      sepBy(',', seq(repeat($.attribute_item), $.field_declaration)),
      optional(','),
      '}',
    ),

    field_declaration: $ => seq(
      optional($.visibility_modifier),
      field('name', $._field_name),
      ':',
      field('type', $._type),
    ),

    ordered_field_declaration_list: $ => seq(
      '(',
      sepBy(',', seq(
        repeat($.attribute_item),
        optional($.visibility_modifier),
        field('type', $._type),
      )),
      optional(','),
      ')',
    ),

    extern_crate_declaration: $ => seq(
      optional($.visibility_modifier),
      'extern',
      'crate',
      field('name', $.name),
      optional(seq(
        'as',
        field('alias', $.name),
      )),
      ';',
    ),

    const_item: $ => seq(
      optional($.visibility_modifier),
      'const',
      field('name', $.name),
      ':',
      field('type', $._type),
      optional(
        seq(
          '=',
          field('value', $._expression),
        ),
      ),
      ';',
    ),

    static_item: $ => seq(
      optional($.visibility_modifier),
      'static',

      // Not actual rust syntax, but made popular by the lazy_static crate.
      optional('ref'),

      optional('mut'),
      field('name', $.name),
      ':',
      field('type', $._type),
      optional(seq(
        '=',
        field('value', $._expression),
      )),
      ';',
    ),

    type_item: $ => seq(
      optional($.visibility_modifier),
      'type',
      field('name', $._type_name),
      field('type_parameters', optional($.type_parameters)),
      '=',
      field('type', $._type),
      optional($.where_clause),
      ';',
    ),

    function_item: $ => seq(
      optional($.visibility_modifier),
      optional($.function_modifiers),
      'fn',
      field('name', choice($.name, $.metavariable)),
      field('type_parameters', optional($.type_parameters)),
      field('parameters', $.parameters),
      optional(seq('->', field('return_type', $._type))),
      optional($.where_clause),
      field('body', $.block),
    ),

    function_signature_item: $ => seq(
      optional($.visibility_modifier),
      optional($.function_modifiers),
      'fn',
      field('name', choice($.name, $.metavariable)),
      field('type_parameters', optional($.type_parameters)),
      field('parameters', $.parameters),
      optional(seq('->', field('return_type', $._type))),
      optional($.where_clause),
      ';',
    ),

    function_modifiers: $ => repeat1(choice(
      'async',
      'default',
      'const',
      'unsafe',
      $.extern_modifier,
    )),

    where_clause: $ => prec.right(seq(
      'where',
      sepBy1(',', $.where_predicate),
      optional(','),
    )),

    where_predicate: $ => seq(
      field('left', choice(
        $.lifetime,
        $._type_name,
        $.scoped_type_name,
        $.generic_type,
        $.reference_type,
        $.pointer_type,
        $.tuple_type,
        $.array_type,
        $.higher_ranked_trait_bound,
      )),
      field('bounds', $.trait_bounds),
    ),

    impl_item: $ => seq(
      optional('unsafe'),
      'impl',
      field('type_parameters', optional($.type_parameters)),
      optional(seq(
        optional('!'),
        field('trait', choice(
          $._type_name,
          $.scoped_type_name,
          $.generic_type,
        )),
        'for',
      )),
      field('type', $._type),
      optional($.where_clause),
      choice(field('body', $.declaration_list), ';'),
    ),

    trait_item: $ => seq(
      optional($.visibility_modifier),
      optional('unsafe'),
      'trait',
      field('name', $._type_name),
      field('type_parameters', optional($.type_parameters)),
      field('bounds', optional($.trait_bounds)),
      optional($.where_clause),
      field('body', $.declaration_list),
    ),

    associated_type: $ => seq(
      'type',
      field('name', $._type_name),
      field('type_parameters', optional($.type_parameters)),
      field('bounds', optional($.trait_bounds)),
      optional($.where_clause),
      ';',
    ),

    trait_bounds: $ => seq(
      ':',
      sepBy1('+', choice(
        $._type,
        $.lifetime,
        $.higher_ranked_trait_bound,
      )),
    ),

    higher_ranked_trait_bound: $ => seq(
      'for',
      field('type_parameters', $.type_parameters),
      field('type', $._type),
    ),

    removed_trait_bound: $ => seq(
      '?',
      $._type,
    ),

    type_parameters: $ => prec(1, seq(
      '<',
      sepBy1(',', seq(
        repeat($.attribute_item),
        choice(
          $.lifetime,
          $.metavariable,
          $._type_name,
          $.constrained_type_parameter,
          $.optional_type_parameter,
          $.const_parameter,
        ),
      )),
      optional(','),
      '>',
    )),

    const_parameter: $ => seq(
      'const',
      field('name', $.name),
      ':',
      field('type', $._type),
    ),

    constrained_type_parameter: $ => seq(
      field('left', choice($.lifetime, $._type_name)),
      field('bounds', $.trait_bounds),
    ),

    optional_type_parameter: $ => seq(
      field('name', choice(
        $._type_name,
        $.constrained_type_parameter,
      )),
      '=',
      field('default_type', $._type),
    ),

    let_declaration: $ => seq(
      'let',
      optional('mut'),
      field('pattern', $._pattern),
      optional(seq(
        ':',
        field('type', $._type),
      )),
      optional(seq(
        '=',
        field('value', $._expression),
      )),
      optional(seq(
        'else',
        field('alternative', $.block),
      )),
      ';',
    ),

    use_declaration: $ => seq(
      optional($.visibility_modifier),
      'use',
      field('argument', $._use_clause),
      ';',
    ),

    _use_clause: $ => choice(
      $._path,
      $.use_as_clause,
      $.use_list,
      $.scoped_use_list,
      $.use_wildcard,
    ),

    scoped_use_list: $ => seq(
      field('path', optional($._path)),
      '::',
      field('list', $.use_list),
    ),

    use_list: $ => seq(
      '{',
      sepBy(',', choice(
        $._use_clause,
      )),
      optional(','),
      '}',
    ),

    use_as_clause: $ => seq(
      field('path', $._path),
      'as',
      field('alias', $.name),
    ),

    use_wildcard: $ => seq(
      optional(seq($._path, '::')),
      '*',
    ),

    parameters: $ => seq(
      '(',
      sepBy(',', seq(
        optional($.attribute_item),
        choice(
          $.parameter,
          $.self_parameter,
          $.variadic_parameter,
          '_',
          $._type,
        ))),
      optional(','),
      ')',
    ),

    self_parameter: $ => seq(
      optional('&'),
      optional($.lifetime),
      optional('mut'),
      'self',
    ),

    variadic_parameter: $ => seq(
      optional('mut'),
      optional(seq(
        field('pattern', $._pattern),
        ':',
      )),
      '...',
    ),

    parameter: $ => seq(
      optional('mut'),
      field('pattern', choice(
        $._pattern,
        $.self,
      )),
      ':',
      field('type', $._type),
    ),

    extern_modifier: $ => seq(
      'extern',
      optional($.string_literal),
    ),

    visibility_modifier: $ => choice(
      seq(
        'pub',
        optional(seq(
          '(',
          choice(
            $.keyword_scope,
            seq('in', $._path),
          ),
          ')',
        )),
      ),
    ),

    // Section - Types

    _type: $ => choice(
      $.abstract_type,
      $.reference_type,
      $.metavariable,
      $.pointer_type,
      $.generic_type,
      $.scoped_type_name,
      $.tuple_type,
      $.unit_type,
      $.array_type,
      $.function_type,
      $.self_type,
      $._type_name,
      $.macro_invocation,
      $.never_type,
      $.dynamic_type,
      $.bounded_type,
      $.removed_trait_bound,
    ),

    bracketed_type: $ => seq(
      '<',
      choice(
        $._type,
        $.qualified_type,
      ),
      '>',
    ),

    qualified_type: $ => seq(
      field('type', $._type),
      'as',
      field('alias', $._type),
    ),

    lifetime: $ => prec(1, seq(alias($.lifetime_quote, "'"), $.name)),

    array_type: $ => seq(
      '[',
      field('element', $._type),
      optional(seq(
        ';',
        field('length', $._expression),
      )),
      ']',
    ),

    for_lifetimes: $ => seq(
      'for',
      '<',
      sepBy1(',', $.lifetime),
      optional(','),
      '>',
    ),

    function_type: $ => seq(
      optional($.for_lifetimes),
      prec(PREC.call, seq(
        choice(
          field('trait', choice(
            $._type_name,
            $.scoped_type_name,
          )),
          seq(
            optional($.function_modifiers),
            'fn',
          ),
        ),
        field('parameters', $.parameters),
      )),
      optional(seq('->', field('return_type', $._type))),
    ),

    tuple_type: $ => seq(
      '(',
      sepBy1(',', $._type),
      optional(','),
      ')',
    ),

    unit_type: _ => seq('(', ')'),

    generic_function: $ => prec(1, seq(
      field('function', choice(
        $.name,
        $.scoped_name,
        $.field_expression,
      )),
      '::',
      field('type_arguments', $.type_arguments),
    )),

    generic_type: $ => prec(1, seq(
      field('type', choice(
        $._type_name,
        $._reserved_keyword,
        $.scoped_type_name,
      )),
      field('type_arguments', $.type_arguments),
    )),

    generic_type_with_turbofish: $ => seq(
      field('type', choice(
        $._type_name,
        $.scoped_name,
      )),
      '::',
      field('type_arguments', $.type_arguments),
    ),

    bounded_type: $ => prec.left(-1, choice(
      seq($.lifetime, '+', $._type),
      seq($._type, '+', $._type),
      seq($._type, '+', $.lifetime),
    )),

    type_arguments: $ => seq(
      token(prec(1, '<')),
      sepBy1(',', seq(
        choice(
          $._type,
          $.type_binding,
          $.lifetime,
          $._literal,
          $.block,
        ),
        optional($.trait_bounds),
      )),
      optional(','),
      '>',
    ),

    type_binding: $ => seq(
      field('name', $._type_name),
      field('type_arguments', optional($.type_arguments)),
      '=',
      field('type', $._type),
    ),

    reference_type: $ => seq(
      '&',
      optional($.lifetime),
      optional('mut'),
      field('type', $._type),
    ),

    pointer_type: $ => seq(
      '*',
      choice('const', 'mut'),
      field('type', $._type),
    ),

    self_type: _ => 'Self',

    never_type: _ => '!',

    abstract_type: $ => seq(
      'impl',
      optional(seq('for', $.type_parameters)),
      field('trait', choice(
        $._type_name,
        $.scoped_type_name,
        $.removed_trait_bound,
        $.generic_type,
        $.function_type,
        $.tuple_type,
      )),
    ),

    dynamic_type: $ => seq(
      'dyn',
      field('trait', choice(
        $.higher_ranked_trait_bound,
        $._type_name,
        $.scoped_type_name,
        $.generic_type,
        $.function_type,
      )),
    ),

    // Section - Expressions

    _expression_except_range: $ => choice(
      $.unary_expression,
      $.reference_expression,
      $.try_expression,
      $.binary_expression,
      $.assignment_expression,
      $.compound_assignment_expr,
      $.type_cast_expression,
      $.call_expression,
      $.return_expression,
      $.yield_expression,
      $._literal,
      prec.left($.name),
      prec.left($._reserved_keyword),
      $.self,
      $.scoped_name,
      $.generic_function,
      $.await_expression,
      $.field_expression,
      $.array_expression,
      $.tuple_expression,
      prec(1, $.macro_invocation),
      $.unit_expression,
      $.break_expression,
      $.continue_expression,
      $.index_expression,
      $.metavariable,
      $.closure_expression,
      $.parenthesized_expression,
      $.struct_expression,
      $._expression_ending_with_block,
    ),

    _expression: $ => choice(
      $._expression_except_range,
      $.range_expression,
    ),

    _expression_ending_with_block: $ => choice(
      $.unsafe_block,
      $.async_block,
      $.gen_block,
      $.try_block,
      $.block,
      $.if_expression,
      $.match_expression,
      $.while_expression,
      $.loop_expression,
      $.for_expression,
      $.const_block,
    ),

    macro_invocation: $ => seq(
      field('macro', choice(
        $.scoped_name,
        $.name,
        $._reserved_keyword,
      )),
      '!',
      alias($.delim_token_tree, $.token_tree),
    ),

    delim_token_tree: $ => choice(
      seq('(', repeat($._delim_tokens), ')'),
      seq('[', repeat($._delim_tokens), ']'),
      seq('{', repeat($._delim_tokens), '}'),
    ),

    _delim_tokens: $ => choice(
      $._non_delim_token,
      alias($.delim_token_tree, $.token_tree),
    ),

    _non_delim_token: $ => choice(
      $._non_special_token,
      '$',
    ),

    self: $ => 'self',

    scoped_name: $ => seq(
      field('path', optional(choice(
        $._path,
        $.bracketed_type,
        alias($.generic_type_with_turbofish, $.generic_type),
      ))),
      '::',
      field('name', choice($.name, 'super')),
    ),

    scoped_type_name_in_expression_position: $ => prec(-2, seq(
      field('path', optional(choice(
        $._path,
        alias($.generic_type_with_turbofish, $.generic_type),
      ))),
      '::',
      field('name', $._type_name),
    )),

    scoped_type_name: $ => seq(
      field('path', optional(choice(
        $._path,
        alias($.generic_type_with_turbofish, $.generic_type),
        $.bracketed_type,
        $.generic_type,
      ))),
      '::',
      field('name', $._type_name),
    ),

    range_expression: $ => prec.left(PREC.range, choice(
      seq($._expression, choice('..', '...', '..='), $._expression),
      seq($._expression, '..'),
      seq('..', $._expression),
      '..',
    )),

    unary_expression: $ => prec(PREC.unary, seq(
      choice('-', '*', '!'),
      $._expression,
    )),

    try_expression: $ => prec(PREC.try, seq(
      $._expression,
      '?',
    )),

    reference_expression: $ => prec(PREC.unary, seq(
      '&',
      choice(
        seq('raw', choice('const', 'mut')),
        optional('mut'),
      ),
      field('value', $._expression),
    )),

    binary_expression: $ => {
      const table = [
        [PREC.and, '&&'],
        [PREC.or, '||'],
        [PREC.bitand, '&'],
        [PREC.bitor, '|'],
        [PREC.bitxor, '^'],
        [PREC.comparative, choice('==', '!=', '<', '<=', '>', '>=')],
        [PREC.shift, choice('<<', '>>')],
        [PREC.additive, choice('+', '-')],
        [PREC.multiplicative, choice('*', '/', '%')],
      ];

      // @ts-ignore
      return choice(...table.map(([precedence, operator]) => prec.left(precedence, seq(
        field('left', $._expression),
        // @ts-ignore
        field('operator', operator),
        field('right', $._expression),
      ))));
    },

    assignment_expression: $ => prec.left(PREC.assign, seq(
      field('left', $._expression),
      '=',
      field('right', $._expression),
    )),

    compound_assignment_expr: $ => prec.left(PREC.assign, seq(
      field('left', $._expression),
      field('operator', choice('+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=')),
      field('right', $._expression),
    )),

    type_cast_expression: $ => prec.left(PREC.cast, seq(
      field('value', $._expression),
      'as',
      field('type', $._type),
    )),

    return_expression: $ => choice(
      prec.left(seq('return', $._expression)),
      prec(-1, 'return'),
    ),

    yield_expression: $ => choice(
      prec.left(seq('yield', $._expression)),
      prec(-1, 'yield'),
    ),

    call_expression: $ => prec(PREC.call, seq(
      field('function', $._expression_except_range),
      field('arguments', $.arguments),
    )),

    arguments: $ => seq(
      '(',
      sepBy(',', seq(repeat($.attribute_item), $._expression)),
      optional(','),
      ')',
    ),

    array_expression: $ => seq(
      '[',
      repeat($.attribute_item),
      choice(
        seq(
          $._expression,
          ';',
          field('length', $._expression),
        ),
        seq(
          sepBy(',', seq(repeat($.attribute_item), $._expression)),
          optional(','),
        ),
      ),
      ']',
    ),

    parenthesized_expression: $ => seq(
      '(',
      $._expression,
      ')',
    ),

    tuple_expression: $ => seq(
      '(',
      repeat($.attribute_item),
      seq($._expression, ','),
      repeat(seq($._expression, ',')),
      optional($._expression),
      ')',
    ),

    unit_expression: _ => seq('(', ')'),

    struct_expression: $ => seq(
      field('name', choice(
        $._type_name,
        alias($.scoped_type_name_in_expression_position, $.scoped_type_name),
        $.generic_type_with_turbofish,
      )),
      field('body', $.field_initializer_list),
    ),

    field_initializer_list: $ => seq(
      '{',
      sepBy(',', choice(
        $.shorthand_field_initializer,
        $.field_initializer,
        $.base_field_initializer,
      )),
      optional(','),
      '}',
    ),

    shorthand_field_initializer: $ => seq(
      repeat($.attribute_item),
      $.name,
    ),

    field_initializer: $ => seq(
      repeat($.attribute_item),
      field('field', choice($._field_name, $.integer_literal)),
      ':',
      field('value', $._expression),
    ),

    base_field_initializer: $ => seq(
      '..',
      $._expression,
    ),

    if_expression: $ => prec.right(seq(
      'if',
      field('condition', $._condition),
      field('consequence', $.block),
      optional(field('alternative', $.else_clause)),
    )),

    let_condition: $ => seq(
      'let',
      field('pattern', $._pattern),
      '=',
      field('value', prec.left(PREC.and, $._expression)),
    ),

    _let_chain: $ => prec.left(PREC.and, choice(
      seq($._let_chain, '&&', $.let_condition),
      seq($._let_chain, '&&', $._expression),
      seq($.let_condition, '&&', $._expression),
      seq($.let_condition, '&&', $.let_condition),
      seq($._expression, '&&', $.let_condition),
    )),

    _condition: $ => choice(
      $._expression,
      $.let_condition,
      alias($._let_chain, $.let_chain),
    ),

    else_clause: $ => seq(
      'else',
      choice(
        $.block,
        $.if_expression,
      ),
    ),

    match_expression: $ => seq(
      'match',
      field('value', $._expression),
      field('body', $.match_block),
    ),

    match_block: $ => seq(
      '{',
      optional(seq(
        repeat($.match_arm),
        alias($.last_match_arm, $.match_arm),
      )),
      '}',
    ),

    match_arm: $ => prec.right(seq(
      repeat(choice($.attribute_item, $.inner_attribute_item)),
      field('pattern', $.match_pattern),
      '=>',
      choice(
        seq(field('value', $._expression), ','),
        field('value', prec(1, $._expression_ending_with_block)),
      ),
    )),

    last_match_arm: $ => seq(
      repeat(choice($.attribute_item, $.inner_attribute_item)),
      field('pattern', $.match_pattern),
      '=>',
      field('value', $._expression),
      optional(','),
    ),

    match_pattern: $ => seq(
      $._pattern,
      optional(seq('if', field('condition', $._condition))),
    ),

    while_expression: $ => seq(
      optional(seq($.label, ':')),
      'while',
      field('condition', $._condition),
      field('body', $.block),
    ),

    loop_expression: $ => seq(
      optional(seq($.label, ':')),
      'loop',
      field('body', $.block),
    ),

    for_expression: $ => seq(
      optional(seq($.label, ':')),
      'for',
      field('pattern', $._pattern),
      'in',
      field('value', $._expression),
      field('body', $.block),
    ),

    const_block: $ => seq(
      'const',
      field('body', $.block),
    ),

    closure_expression: $ => prec(PREC.closure, seq(
      optional('static'),
      optional('move'),
      field('parameters', $.closure_parameters),
      choice(
        seq(
          optional(seq('->', field('return_type', $._type))),
          field('body', $.block),
        ),
        field('body', choice($._expression, '_')),
      ),
    )),

    closure_parameters: $ => seq(
      '|',
      sepBy(',', choice(
        $._pattern,
        $.parameter,
      )),
      '|',
    ),

    label: $ => seq(alias($.lifetime_quote, "'"), $.name),

    break_expression: $ => prec.left(seq('break', optional($.label), optional($._expression))),

    continue_expression: $ => prec.left(seq('continue', optional($.label))),

    index_expression: $ => prec(PREC.call, seq($._expression, '[', $._expression, ']')),

    await_expression: $ => prec(PREC.field, seq(
      $._expression,
      '.',
      'await',
    )),

    field_expression: $ => prec(PREC.field, seq(
      field('value', $._expression),
      '.',
      field('field', choice(
        $._field_name,
        $.integer_literal,
      )),
    )),

    unsafe_block: $ => seq(
      'unsafe',
      $.block,
    ),

    async_block: $ => seq(
      'async',
      optional('move'),
      $.block,
    ),

    gen_block: $ => seq(
      'gen',
      optional('move'),
      $.block,
    ),

    try_block: $ => seq(
      'try',
      $.block,
    ),

    block: $ => seq(
      optional(seq($.label, ':')),
      '{',
      repeat($._statement),
      optional($._expression),
      '}',
    ),

    // Section - Patterns

    _pattern: $ => choice(
      $._literal_pattern,
      $.name,
      $.scoped_name,
      $.tuple_pattern,
      $.tuple_struct_pattern,
      $.struct_pattern,
      $._reserved_keyword,
      $.ref_pattern,
      $.slice_pattern,
      $.captured_pattern,
      $.reference_pattern,
      $.remaining_field_pattern,
      $.mut_pattern,
      $.range_pattern,
      $.or_pattern,
      $.const_block,
      $.macro_invocation,
      '_',
    ),

    tuple_pattern: $ => seq(
      '(',
      sepBy(',', choice($._pattern, $.closure_expression)),
      optional(','),
      ')',
    ),

    slice_pattern: $ => seq(
      '[',
      sepBy(',', $._pattern),
      optional(','),
      ']',
    ),

    tuple_struct_pattern: $ => seq(
      field('type', choice(
        $.name,
        $.scoped_name,
        alias($.generic_type_with_turbofish, $.generic_type),
      )),
      '(',
      sepBy(',', $._pattern),
      optional(','),
      ')',
    ),

    struct_pattern: $ => seq(
      field('type', choice(
        $._type_name,
        $.scoped_type_name,
      )),
      '{',
      sepBy(',', choice($.field_pattern, $.remaining_field_pattern)),
      optional(','),
      '}',
    ),

    field_pattern: $ => seq(
      optional('ref'),
      optional('mut'),
      choice(
        field('name', alias($.name, $.shorthand_field_name)),
        seq(
          field('name', $._field_name),
          ':',
          field('pattern', $._pattern),
        ),
      ),
    ),

    remaining_field_pattern: _ => '..',

    mut_pattern: $ => prec(-1, seq(
      'mut',
      $._pattern,
    )),

    range_pattern: $ => choice(
      seq(
        choice('...', '..=', '..'),
        choice(
          $._literal_pattern,
          $._path,
        ),
      ),
      seq(
        choice(
          $._literal_pattern,
          $._path,
        ),
        choice(
          seq(
            choice('...', '..=', '..'),
            choice(
              $._literal_pattern,
              $._path,
            ),
          ),
          '..',
        ),
      ),
    ),

    ref_pattern: $ => seq(
      'ref',
      $._pattern,
    ),

    captured_pattern: $ => seq(
      $.name,
      '@',
      $._pattern,
    ),

    reference_pattern: $ => seq(
      '&',
      optional('mut'),
      $._pattern,
    ),

    or_pattern: $ => prec.left(-2, choice(
      seq($._pattern, '|', $._pattern),
      seq('|', $._pattern),
    )),

    // Section - Literals

    _literal: $ => choice(
      $.string_literal,
      $.raw_string_literal,
      $.char_literal,
      $.boolean_literal,
      $.integer_literal,
      $.float_literal,
    ),

    _literal_pattern: $ => choice(
      $.string_literal,
      $.raw_string_literal,
      $.char_literal,
      $.boolean_literal,
      $.integer_literal,
      $.float_literal,
      $.negative_literal,
    ),

    negative_literal: $ => seq('-', choice($.integer_literal, $.float_literal)),

    digits: _ => /[0-9_]+/,

    integer_literal: $ => seq(
      choice(
        alias(/[0-9][0-9_]*/, $.digits),
        seq(alias($.hexadecimal_prefix, "0x"), alias(/[0-9a-fA-F_]+/, $.digits)),
        seq(alias($.binary_prefix, "0b"), alias(/[01_]+/, $.digits)),
        seq(alias($.octal_prefix, "0o"), alias(/[0-7_]+/, $.digits)),
      ),
      optional($.literal_suffix),
    ),

    float_literal: $ => seq(
      alias(/[0-9][0-9_]*/, $.digits),
      choice(
        seq(
          alias($.decimal_point, "."),
          optional($.digits),
        ),
        seq(
          alias($.exponent_e, "e"),
          optional(choice("+", "-")),
          $.digits,
        ),
        seq(
          alias($.decimal_point, "."),
          $.digits,
          alias($.exponent_e, "e"),
          optional(choice("+", "-")),
          $.digits,
        ),
      ),
      optional($.literal_suffix),
    ),

    string_literal: $ => seq(
      alias(/[bc]?"/, '"'),
      repeat(choice(
        $.escape_sequence,
        $.string_content,
      )),
      token.immediate('"'),
      optional($.literal_suffix),
    ),

    raw_string_literal: $ => seq(
      alias($._raw_string_literal_start, '"'),
      alias($.raw_string_literal_content, $.string_content),
      alias($._raw_string_literal_end, '"'),
      optional($.literal_suffix),
    ),

    char_literal: $ => seq(
      optional($.char_prefix),
      alias($.char_quote, "'"),
      optional(choice(
        $.escape_sequence,
        $.literal_char,
      )),
      '\'',
      optional($.literal_suffix),
    ),

    literal_char: _ => /[^\\']/,

    escape_sequence: _ => token.immediate(
      seq('\\',
        choice(
          /[^xu]/,
          /u[0-9a-fA-F]{4}/,
          /u\{[0-9a-fA-F]+\}/,
          /x[0-9a-fA-F]{2}/,
        ),
      )),

    boolean_literal: _ => choice('true', 'false'),

    comment: $ => choice(
      $.line_comment,
      $.block_comment,
    ),

    line_comment: $ => seq(
      // All line comments start with two //
      '//',
      // Then are followed by:
      // - 2 or more slashes making it a regular comment
      // - 1 slash or 1 or more bang operators making it a doc comment
      // - or just content for the comment
      choice(
        // A tricky edge case where what looks like a doc comment is not
        seq(token.immediate(prec(2, /\/\//)), /.*/),
        // A regular doc comment
        seq($._line_doc_comment_marker, field('doc', alias($._line_doc_content, $.doc_comment))),
        token.immediate(prec(1, /.*/)),
      ),
    ),

    _line_doc_comment_marker: $ => choice(
      // An outer line doc comment applies to the element that it is outside of
      field('outer', alias($._outer_line_doc_comment_marker, $.outer_doc_comment_marker)),
      // An inner line doc comment applies to the element it is inside of
      field('inner', alias($._inner_line_doc_comment_marker, $.inner_doc_comment_marker)),
    ),

    _inner_line_doc_comment_marker: _ => token.immediate(prec(2, '!')),
    _outer_line_doc_comment_marker: _ => token.immediate(prec(2, '/')),

    block_comment: $ => seq(
      '/*',
      optional(
        choice(
          // Documentation block comments: /** docs */ or /*! docs */
          seq(
            $._block_doc_comment_marker,
            optional(field('doc', alias($._block_comment_content, $.doc_comment))),
          ),
          // Non-doc block comments
          $._block_comment_content,
        ),
      ),
      '*/',
    ),

    _block_doc_comment_marker: $ => choice(
      field('outer', alias($._outer_block_doc_comment_marker, $.outer_doc_comment_marker)),
      field('inner', alias($._inner_block_doc_comment_marker, $.inner_doc_comment_marker)),
    ),

    _path: $ => choice(
      $.keyword_scope,
      $.metavariable,
      $.name,
      $.scoped_name,
      $._reserved_keyword,
    ),

    simple_path: $ => seq(optional('::'), $._simple_path_segment, repeat(seq('::', $._simple_path_segment))),
    _simple_path_segment: $ => choice($.name, $.keyword_scope),

    keyword_scope: $ => choice(
      'self',
      'super',
      'crate',
    ),

    name: $ => seq(optional('r#'), $.identifier),

    identifier: _ =>  /[_\p{XID_Start}][_\p{XID_Continue}]*/,


    shebang: _ => /#![\s]*[^\[].+/,

    _reserved_keyword: $ => alias(choice(
      'default',
      'union',
      'gen',
    ), $.name),

    _type_name: $ => alias($.name, $.type_name),
    _field_name: $ => alias($.name, $.field_name),

    metavariable: _ => /\$[a-zA-Z_]\w*/,
  },
});

/**
 * Creates a rule to match one or more of the rules separated by the separator.
 *
 * @param {RuleOrLiteral} sep - The separator to use.
 * @param {RuleOrLiteral} rule
 *
 * @returns {SeqRule}
 */
function sepBy1(sep, rule) {
  return seq(rule, repeat(seq(sep, rule)));
}


/**
 * Creates a rule to optionally match one or more of the rules separated by the separator.
 *
 * @param {RuleOrLiteral} sep - The separator to use.
 * @param {RuleOrLiteral} rule
 *
 * @returns {ChoiceRule}
 */
function sepBy(sep, rule) {
  return optional(sepBy1(sep, rule));
}
