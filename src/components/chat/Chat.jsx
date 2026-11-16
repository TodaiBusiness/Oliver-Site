import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import ChatMessage from './ChatMessage.jsx';
import EmptyState from '../panel/EmptyState.jsx';
import { ErrorState } from '../panel/DataState.jsx';
import { agruparPorDia } from './datas.js';
import { formatarTamanho, prepararImagem, TIPOS_ACEITOS } from './anexo.js';
import { api } from '../../api/client.js';

const LIMITE = 4000;

/* Enquanto a conversa está aberta, busca mensagens novas de tempos em tempos.
   30s é o suficiente para parecer vivo sem martelar o servidor. */
const INTERVALO_ATUALIZACAO = 30_000;

/**
 * Conversa de uma solicitação: lista, envio de texto e de imagem.
 * A aparência de cada mensagem fica em `ChatMessage`.
 */
/* Respostas do Panel dividem o mesmo author_id (usuário de sistema): o que
   distingue um admin do outro é o nome. */
const mesmoAutor = (a, b) =>
  a.author_id === b.author_id &&
  (a.author_external_name ?? null) === (b.author_external_name ?? null);

export default function Chat({ requestId, currentUser, onSent, variant }) {
  const [mensagens, setMensagens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState('');
  const [imagem, setImagem] = useState(null);
  const [erro, setErro] = useState(null);
  const [falhaCarga, setFalhaCarga] = useState(null);
  const [pendentes, setPendentes] = useState([]);
  const [offline, setOffline] = useState(false);

  const fluxo = useRef(null);
  const primeiraCarga = useRef(true);
  const campoArquivo = useRef(null);

  /* Em ref para o callback do pai não reiniciar o efeito de polling. */
  const onSentRef = useRef(onSent);
  onSentRef.current = onSent;

  const carregar = async ({ silencioso = false } = {}) => {
    if (!silencioso) setCarregando(true);
    try {
      const { messages } = await api.get(`/requests/${requestId}/messages`);
      setMensagens(messages);
      setFalhaCarga(null);
      setOffline(false);
      /* A lista de conversas e o indicador do menu dependem disto. */
      onSentRef.current?.();
      window.dispatchEvent(new Event('mensagens:mudou'));
    } catch (problema) {
      /* Falha na atualização automática não pode apagar a conversa da tela:
         só avisa que está desatualizada. A primeira carga mostra erro com retry. */
      if (silencioso) setOffline(true);
      else setFalhaCarga(problema);
    } finally {
      if (!silencioso) setCarregando(false);
    }
  };

  useEffect(() => {
    primeiraCarga.current = true;
    carregar();

    const timer = setInterval(() => carregar({ silencioso: true }), INTERVALO_ATUALIZACAO);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  /* Rola a própria lista (não a página) até a última mensagem: sem animação
     na abertura, suave depois — e sem animação para quem pede menos movimento. */
  useEffect(() => {
    const lista = fluxo.current;
    if (!lista || (!mensagens.length && !pendentes.length)) return;
    const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    lista.scrollTo({
      top: lista.scrollHeight,
      behavior: primeiraCarga.current || reduz ? 'auto' : 'smooth',
    });
    primeiraCarga.current = false;
  }, [mensagens, pendentes]);

  const grupos = useMemo(() => agruparPorDia(mensagens), [mensagens]);

  const escolherArquivo = async (event) => {
    const arquivo = event.target.files?.[0];
    event.target.value = ''; // permite reescolher o mesmo arquivo
    if (!arquivo) return;

    setErro(null);
    try {
      setImagem(await prepararImagem(arquivo));
    } catch (problema) {
      setErro(problema.message);
    }
  };

  const transmitir = async (rascunho) => {
    setPendentes((atuais) =>
      atuais.map((p) => (p.id === rascunho.id ? { ...p, estado: 'enviando' } : p))
    );
    try {
      await api.post(`/requests/${requestId}/messages`, {
        body: rascunho.body,
        ...(rascunho.imagem
          ? { image: { dataBase64: rascunho.imagem.dataBase64, filename: rascunho.imagem.filename } }
          : {}),
      });
      setPendentes((atuais) => atuais.filter((p) => p.id !== rascunho.id));
      await carregar({ silencioso: true });
    } catch (problema) {
      setPendentes((atuais) =>
        atuais.map((p) =>
          p.id === rascunho.id ? { ...p, estado: 'erro', motivo: problema.message } : p
        )
      );
    }
  };

  const enviar = (event) => {
    event?.preventDefault();
    const corpo = texto.trim();
    /* Com imagem, texto é opcional — o servidor aceita os dois casos. */
    if (!corpo && !imagem) return;

    /* A mensagem aparece na hora, como "enviando"; se falhar, fica na lista
       com a opção de tentar de novo — o texto nunca se perde. */
    const rascunho = { id: `p${Date.now()}`, body: corpo, imagem, estado: 'enviando' };
    setPendentes((atuais) => [...atuais, rascunho]);
    setTexto('');
    setImagem(null);
    setErro(null);
    transmitir(rascunho);
  };

  /* Enter envia, Shift+Enter quebra linha — comportamento esperado num chat. */
  const aoTeclar = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      enviar();
    }
  };

  const restantes = LIMITE - texto.length;
  const podeEnviar = Boolean(texto.trim() || imagem);
  const semMensagens = mensagens.length === 0 && pendentes.length === 0;

  return (
    <div className={`chat${variant === 'inbox' ? ' chat--inbox' : ''}`}>
      <div className="chat__stream" role="log" aria-live="polite" aria-label="Conversa" ref={fluxo}>
        {offline ? (
          <p className="chat__offline" role="status">
            Sem conexão para atualizar. Mostrando a última versão.
            <button type="button" onClick={() => carregar({ silencioso: true })}>
              Tentar de novo
            </button>
          </p>
        ) : null}

        {carregando ? (
          <p className="panel-loading">Carregando mensagens…</p>
        ) : falhaCarga ? (
          <ErrorState error={falhaCarga} onRetry={() => carregar()} title="Não foi possível abrir a conversa." />
        ) : semMensagens ? (
          <EmptyState
            icon="chat"
            title="Nenhuma mensagem ainda."
            text="Escreva abaixo ou envie uma imagem para começar."
          />
        ) : (
          grupos.map((grupo) => (
            <section className="chat__day" key={grupo.chave}>
              <div className="chat__day-label">
                <span>{grupo.rotulo}</span>
              </div>

              {grupo.mensagens.map((mensagem, indice) => (
                <ChatMessage
                  key={mensagem.id}
                  mensagem={mensagem}
                  minha={mensagem.author_id === currentUser?.id}
                  /* Mensagens seguidas do mesmo autor não repetem o cabeçalho. */
                  agrupada={
                    indice > 0 &&
                    mesmoAutor(grupo.mensagens[indice - 1], mensagem)
                  }
                />
              ))}
            </section>
          ))
        )}

        {pendentes.map((p) => (
          <div className={`msg msg--mine msg--pending${p.estado === 'erro' ? ' msg--failed' : ''}`} key={p.id}>
            <div className="msg__content">
              <div className="msg__bubble">
                {p.imagem ? (
                  <span className="msg__anexo">
                    <img src={p.imagem.previewUrl} alt={p.imagem.filename} />
                  </span>
                ) : null}
                {p.body ? <p className="msg__text">{p.body}</p> : null}
                <span className="msg__time">
                  {p.estado === 'erro' ? 'Não enviada' : 'Enviando…'}
                </span>
              </div>
              {p.estado === 'erro' ? (
                <span className="msg__retry" role="alert">
                  {p.motivo}
                  <button type="button" onClick={() => transmitir(p)}>
                    Tentar de novo
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendentes((atuais) => atuais.filter((x) => x.id !== p.id))}
                  >
                    Descartar
                  </button>
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {erro ? (
        <div className="alert alert--error" role="alert">
          <Icon name="close" size={16} />
          {erro}
        </div>
      ) : null}

      <form className="chat-form" onSubmit={enviar}>
        {/* Prévia da imagem escolhida, antes de enviar */}
        {imagem ? (
          <div className="chat-anexo">
            <img className="chat-anexo__thumb" src={imagem.previewUrl} alt={`Prévia de ${imagem.filename}`} />
            <span className="chat-anexo__info">
              <span className="chat-anexo__nome">{imagem.filename}</span>
              <span className="chat-anexo__tam">{formatarTamanho(imagem.size)}</span>
            </span>
            <button
              type="button"
              className="btn btn--soft btn--icon btn--xs"
              onClick={() => setImagem(null)}
              aria-label={`Remover ${imagem.filename}`}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ) : null}

        <label className="sr-only" htmlFor="mensagem">
          Escreva uma mensagem
        </label>

        <div className="chat-form__box">
          <input
            ref={campoArquivo}
            type="file"
            className="sr-only"
            accept={TIPOS_ACEITOS.join(',')}
            onChange={escolherArquivo}
            tabIndex={-1}
          />

          <button
            type="button"
            className="chat-form__anexar"
            onClick={() => campoArquivo.current?.click()}
            aria-label="Anexar imagem"
            title="Anexar imagem (PNG, JPG, GIF ou WEBP)"
          >
            <Icon name="image" size={18} />
          </button>

          <textarea
            id="mensagem"
            className="chat-form__input"
            rows={2}
            value={texto}
            maxLength={LIMITE}
            onChange={(event) => setTexto(event.target.value)}
            onKeyDown={aoTeclar}
            placeholder={imagem ? 'Escreva algo junto (opcional)…' : 'Escreva uma mensagem…'}
          />

          <button
            type="submit"
            className="chat-form__send"
            disabled={!podeEnviar}
            aria-label="Enviar mensagem"
          >
            <Icon name="arrowRight" size={18} />
          </button>
        </div>

        <div className="chat-form__foot">
          <span>Enter envia · Shift+Enter quebra linha</span>
          {restantes < 500 ? (
            <span className={restantes < 50 ? 'is-warn' : undefined}>
              {restantes} caracteres restantes
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
