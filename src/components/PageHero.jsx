/** Abertura das páginas internas: título, frase de apoio e ações. Sem enfeite. */
export default function PageHero({ title, lead, children, aside }) {
  return (
    <section className="page-hero">
      <div className={`container page-hero__inner${aside ? ' page-hero__inner--aside' : ''}`}>
        <div className="page-hero__copy">
          <h1 className="page-hero__title">{title}</h1>
          {lead ? <p className="page-hero__lead">{lead}</p> : null}
          {children ? <div className="page-hero__actions">{children}</div> : null}
        </div>
        {aside ? <div className="page-hero__aside">{aside}</div> : null}
      </div>
    </section>
  );
}
