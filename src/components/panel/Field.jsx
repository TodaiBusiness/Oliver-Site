import { Children, cloneElement, isValidElement } from 'react';

/**
 * Campo de formulário com rótulo, erro e acessibilidade ligada.
 *
 * O erro NÃO usa `role="alert"` (vários campos com erro anunciariam todos de
 * uma vez, atropelando-se): ele é ligado ao campo por `aria-describedby` e o
 * formulário anuncia um resumo único com <FormErrors />.
 */
export default function Field({
  id,
  label,
  error,
  hint,
  as = 'input',
  children,
  ...props
}) {
  const Tag = as;
  const errorId = error ? `${id}-erro` : undefined;
  const hintId = hint ? `${id}-dica` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const a11y = { 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': describedBy };

  /* Controle próprio (um <select>, por exemplo) também recebe a ligação. */
  const filho = Children.toArray(children)[0];
  const controle = isValidElement(filho) && typeof filho.type === 'string' ? cloneElement(filho, a11y) : children;

  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>

      {children ? controle : <Tag id={id} className="field__control" {...a11y} {...props} />}

      {hint && !error ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}

      {error ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Resumo único de erros do formulário, numa região educada (`aria-live`
 * polite): anuncia uma vez "2 campos precisam de atenção" e deixa cada campo
 * explicar o seu pelo `aria-describedby`.
 */
export function FormErrors({ errors = {}, message }) {
  const campos = Object.keys(errors).filter((chave) => errors[chave]);
  let texto = message ?? '';
  if (!texto && campos.length) {
    texto =
      campos.length === 1
        ? 'Um campo precisa de atenção. Revise o que está destacado.'
        : `${campos.length} campos precisam de atenção. Revise o que está destacado.`;
  }

  return (
    <div className="form-errors" aria-live="polite" aria-atomic="true">
      {texto ? (
        <p className="alert alert--error">
          <span>{texto}</span>
        </p>
      ) : null}
    </div>
  );
}
