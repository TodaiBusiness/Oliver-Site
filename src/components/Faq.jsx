/** Perguntas e respostas com <details>: teclado e leitor de tela de graça. */
export default function Faq({ items }) {
  return (
    <div className="faq">
      {items.map((item) => (
        <details className="faq__item" key={item.q}>
          <summary className="faq__q">
            <span>{item.q}</span>
            <svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true" className="faq__icon">
              <path d="M6 2v8M2 6h8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </summary>
          <p className="faq__a">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
