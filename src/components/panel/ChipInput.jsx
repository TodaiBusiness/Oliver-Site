import { useId, useState } from 'react';
import Icon from '../Icon.jsx';

/**
 * Lista de itens em chips (funcionalidades, tecnologias).
 * Enter ou vírgula adiciona; Backspace no campo vazio remove o último;
 * cada chip tem botão próprio de remover, com nome acessível.
 */
export default function ChipInput({ id, label, hint, value, onChange, placeholder, max = 30 }) {
  const [texto, setTexto] = useState('');
  const baseId = useId();
  const hintId = hint ? `${baseId}-dica` : undefined;

  const adicionar = (bruto) => {
    const itens = bruto
      .split(',')
      .map((parte) => parte.trim())
      .filter(Boolean);
    if (!itens.length) return;
    const novos = itens.filter(
      (item) => !value.some((atual) => atual.toLowerCase() === item.toLowerCase())
    );
    if (novos.length) onChange([...value, ...novos].slice(0, max));
    setTexto('');
  };

  const aoTeclar = (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      adicionar(texto);
    } else if (event.key === 'Backspace' && !texto && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>

      <div className="chip-input">
        {value.length ? (
          <ul className="chip-input__list" aria-label={label}>
            {value.map((item) => (
              <li className="chip-input__chip" key={item}>
                {item}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((atual) => atual !== item))}
                  aria-label={`Remover ${item}`}
                >
                  <Icon name="close" size={12} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <input
          id={id}
          className="chip-input__field"
          value={texto}
          placeholder={placeholder}
          onChange={(event) => setTexto(event.target.value)}
          onKeyDown={aoTeclar}
          onBlur={() => adicionar(texto)}
          aria-describedby={hintId}
          autoComplete="off"
        />
      </div>

      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
