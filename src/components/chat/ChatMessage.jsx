import { horaDaMensagem } from './datas.js';

const inicial = (nome = '?') => nome.trim().charAt(0).toUpperCase();

/**
 * Uma mensagem da conversa.
 * `agrupada` = mensagem seguida do mesmo autor: repete só o balão, sem
 * cabeçalho nem avatar, para a leitura não ficar poluída.
 */
export default function ChatMessage({ mensagem, minha, agrupada }) {
  const daEquipe = mensagem.author_role === 'ADMIN';
  /* Resposta vinda do Panel: "<nome> · TODAI" (o nome de quem respondeu). As
     antigas, de admins do site, seguem com o nome do usuário e a etiqueta TODAI. */
  const respostaDoPanel = Boolean(mensagem.author_external_name);
  const nomeExibido = respostaDoPanel
    ? `${mensagem.author_external_name} · TODAI`
    : mensagem.author_name;

  return (
    <div
      className={`msg${minha ? ' msg--mine' : ''}${agrupada ? ' msg--grouped' : ''}`}
    >
      {!minha ? (
        <span
          className={`msg__avatar${daEquipe ? ' msg__avatar--team' : ''}`}
          aria-hidden="true"
        >
          {agrupada ? '' : inicial(respostaDoPanel ? mensagem.author_external_name : mensagem.author_name)}
        </span>
      ) : null}

      <div className="msg__content">
        {!agrupada ? (
          <span className="msg__head">
            <span className="msg__author">
              {minha ? 'Você' : nomeExibido}
            </span>
            {daEquipe && !minha && !respostaDoPanel ? (
              <span className="msg__tag">TODAI</span>
            ) : null}
          </span>
        ) : null}

        <div className="msg__bubble">
          {/* A imagem vem por URL autenticada, não embutida na resposta. */}
          {mensagem.attachments?.length
            ? mensagem.attachments.map((anexo) => (
                <a
                  key={anexo.id}
                  className="msg__anexo"
                  href={anexo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Abrir ${anexo.filename}`}
                >
                  <img src={anexo.url} alt={anexo.filename} loading="lazy" />
                </a>
              ))
            : null}

          {mensagem.body ? <p className="msg__text">{mensagem.body}</p> : null}
          <time className="msg__time" dateTime={new Date(Number(mensagem.created_at)).toISOString()}>
            {horaDaMensagem(mensagem.created_at)}
          </time>
        </div>
      </div>
    </div>
  );
}
