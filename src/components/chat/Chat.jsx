import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import ChatMessage from './ChatMessage.jsx';
import EmptyState from '../panel/EmptyState.jsx';
import { ErrorState } from '../panel/DataState.jsx';
import { agruparPorDia } from './datas.js';
import { deveAgrupar, pertoDoFim, rotuloDeConexao } from './autor.js';
import { formatarTamanho, prepararImagem, TIPOS_ACEITOS } from './anexo.js';
import { api } from '../../api/client.js';
import { useEventStream } from '../../hooks/useEventStream.js';
import { debounce, intervaloDePolling } from '../../hooks/eventStreamCore.js';

const LIMITE = 4000;

/* Polling de segurança: 30 s sem o stream (como antes); com o stream de pé
   só serve de rede de proteção para evento perdido. */
const POLLING = { rapido: 30_000, lento: 120_000 };

const semHover = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
const reduzMovimento = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Conversa de uma solicitação: lista, envio de texto e de imagem, atualizada
 * quase em tempo real (SSE) com polling de reserva.
 * A aparência de cada mensagem fica em `ChatMessage`.
 */
export default function Chat({ requestId, currentUser, onSent, variant }) {
  const [mensagens, setMensagens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState('');
  const [imagem, setImagem] = useState(null);
  const [erro, setErro] = useState(null);
  const [falhaCarga, setFalhaCarga] = useState(null);
  const [pendentes, setPendentes] = useState([]);
  const [offline, setOffline] = useState(false);
  const [novas, setNovas] = useState(0);

  const fluxo = useRef(null);
  const campoTexto = useRef(null);
  const campoArquivo = useRef(null);
  const primeiraCarga = useRef(true);
  const noFim = useRef(true);
  const forcarRolagem = useRef(false);
  const contagem = useRef(0);
  const sequencia = useRef(0);
  const enviando = useRef(0);

  /* Em ref para o callback do pai não reiniciar os efeitos. */
  const onSentRef = useRef(onSent);
  onSentRef.current = onSent;

  const carregar = async ({ silencioso = false } = {}) => {
    const minha = ++sequencia.current; // resposta atrasada não sobrescreve a mais nova
    if (!silencioso) setCarregando(true);
    try {
      const { messages } = await api.get(`/requests/${requestId}/messages`);
      if (minha !== sequencia.current) return;
      setMensagens(messages);
      setFalhaCarga(null);
      setOffline(false);
      /* A lista de conversas e o indicador do menu dependem disto. */
      onSentRef.current?.();
      window.dispatchEvent(new Event('mensagens:mudou'));
    } catch (problema) {
      if (minha !== sequencia.current) return;
      /* Falha na atualização automática não pode apagar a conversa da tela:
         só avisa que está desatualizada. A primeira carga mostra erro com retry. */
      if (silencioso) setOffline(true);
      else setFalhaCarga(problema);
    } finally {
      if (!silencioso && minha === sequencia.current) setCarregando(false);
    }
  };

  /* Evento do servidor → recarga silenciosa (rajadas viram uma só). */
  const recarregar = useRef(null);
  recarregar.current ??= debounce(() => carregarRef.current?.({ silencioso: true }), 250);
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;
  useEffect(() => () => recarregar.current.cancel(), []);

  const status = useEventStream({
    enabled: currentUser?.role !== 'ADMIN', // o stream é só do dono (cliente)
    onMessage: (d) => {
      /* Enquanto envio, a própria resposta do envio já recarrega: sem duplicar. */
      if (String(d.requestId) === String(requestId) && !enviando.current) recarregar.current();
    },
    /* Leitura pela equipe → "Visto"; a leitura do próprio cliente não muda a conversa. */
    onRead: (d) => {
      if (String(d.requestId) === String(requestId) && d.by === 'team') recarregar.current();
    },
    onResync: () => recarregar.current(),
  });

  useEffect(() => {
    primeiraCarga.current = true;
    noFim.current = true;
    contagem.current = 0;
    setMensagens([]);
    setPendentes([]);
    setNovas(0);
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  /* Polling de reserva, só com a aba visível. */
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') carregar({ silencioso: true });
    }, intervaloDePolling(status, POLLING));
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, status]);

  /* Foco no campo ao abrir (no celular o teclado subiria sozinho: fica de fora). */
  useEffect(() => {
    if (!carregando && !falhaCarga && !semHover()) campoTexto.current?.focus({ preventScroll: true });
  }, [carregando, falhaCarga, requestId]);

  const rolarParaFim = (instantaneo = false) => {
    const lista = fluxo.current;
    if (!lista) return;
    lista.scrollTo({
      top: lista.scrollHeight,
      behavior: instantaneo || reduzMovimento() ? 'auto' : 'smooth',
    });
    noFim.current = true;
    setNovas(0);
  };

  /* Rola a própria lista (não a página). Só acompanha a mensagem nova se a
     pessoa já estava no fim (ou se foi ela quem enviou): quem sobe para reler
     não é puxado para baixo — recebe o aviso "Novas mensagens". */
  useEffect(() => {
    const lista = fluxo.current;
    if (!lista || (!mensagens.length && !pendentes.length)) return;

    const total = mensagens.length;
    const chegaram = total - contagem.current;
    const ultima = mensagens[total - 1];
    const minhaUltima = ultima?.author_id === currentUser?.id;
    contagem.current = total;

    if (primeiraCarga.current) {
      rolarParaFim(true);
      primeiraCarga.current = false;
    } else if (forcarRolagem.current || noFim.current) {
      forcarRolagem.current = false;
      rolarParaFim();
    } else if (chegaram > 0 && !minhaUltima) {
      setNovas((n) => n + chegaram);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensagens, pendentes]);

  const aoRolar = () => {
    noFim.current = pertoDoFim(fluxo.current);
    if (noFim.current) setNovas(0);
  };

  const grupos = useMemo(() => agruparPorDia(mensagens), [mensagens]);
  const ultimaMinha = useMemo(() => {
    for (let i = mensagens.length - 1; i >= 0; i -= 1) {
      if (mensagens[i].author_id === currentUser?.id) return mensagens[i];
    }
    return null;
  }, [mensagens, currentUser?.id]);

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
    enviando.current += 1;
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
      enviando.current -= 1;
      /* O rascunho só sai DEPOIS de a mensagem real chegar na lista: sem
         piscar nem sumir no meio. */
      await carregar({ silencioso: true });
      setPendentes((atuais) => atuais.filter((p) => p.id !== rascunho.id));
    } catch (problema) {
      enviando.current = Math.max(0, enviando.current - 1);
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
    forcarRolagem.current = true;
    setPendentes((atuais) => [...atuais, rascunho]);
    setTexto('');
    setImagem(null);
    setErro(null);
    transmitir(rascunho);
    campoTexto.current?.focus({ preventScroll: true });
  };

  /* Enter envia, Shift+Enter quebra linha — comportamento esperado num chat.
     Durante a composição (IME) o Enter confirma a letra, não envia. */
  const aoTeclar = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      enviar();
    }
  };

  const restantes = LIMITE - texto.length;
  const podeEnviar = Boolean(texto.trim() || imagem);
  const semMensagens = mensagens.length === 0 && pendentes.length === 0;

  return (
    <div className={`chat${variant === 'inbox' ? ' chat--inbox' : ''}`}>
      <div className="chat__wrap">
        <div
          className="chat__stream"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Conversa"
          ref={fluxo}
          onScroll={aoRolar}
          onLoadCapture={() => noFim.current && rolarParaFim(true)}
        >
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
              title="Ainda não há mensagens aqui."
              text="Conte o que você precisa no campo abaixo. A equipe da TODAI responde nesta conversa e avisamos você por e-mail."
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
                    agrupada={deveAgrupar(grupo.mensagens[indice - 1], mensagem)}
                    visto={mensagem === ultimaMinha && Boolean(Number(mensagem.is_read))}
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
                    Não enviada: {p.motivo}
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

        {novas > 0 ? (
          <button type="button" className="chat__novas" onClick={() => rolarParaFim()}>
            <Icon name="arrowRight" size={14} className="chat__novas-icon" />
            {novas === 1 ? 'Nova mensagem' : `${novas} novas mensagens`}
          </button>
        ) : null}
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

        <label className="sr-only" htmlFor={`mensagem-${variant ?? 'pagina'}`}>
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
            id={`mensagem-${variant ?? 'pagina'}`}
            ref={campoTexto}
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
          <span className="chat-form__foot-end">
            {restantes < 500 ? (
              <span className={restantes < 50 ? 'is-warn' : undefined}>
                {restantes} caracteres restantes
              </span>
            ) : null}
            <span className={`chat-live chat-live--${status}`} title="Como esta conversa se atualiza">
              <span className="chat-live__dot" aria-hidden="true" />
              {rotuloDeConexao(status)}
            </span>
          </span>
        </div>
      </form>
    </div>
  );
}
