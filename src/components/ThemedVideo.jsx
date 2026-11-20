import { useEffect, useRef, useState } from 'react';
import ThemedShot from './ThemedShot.jsx';

/**
 * Clipe curto em loop de uma tela, com duas versões (escura e clara), como o
 * ThemedShot. `base` = '/sistema/painel' carrega /sistema/video/painel-escuro.webm
 * e painel-claro.webm, com o .webp de mesmo nome como poster.
 *
 * Só toca enquanto está visível; fora da tela pausa. Com movimento reduzido
 * (ou se o vídeo não carregar) mostra a captura estática.
 */
function Clip({ theme, src, poster, label, play, onFail }) {
  const ref = useRef(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (play) {
      const started = video.play();
      if (started?.catch) started.catch(() => {});
    } else {
      video.pause();
    }
  }, [play]);

  return (
    <video
      ref={ref}
      className={`shot-${theme}`}
      muted
      loop
      playsInline
      preload="metadata"
      poster={poster}
      width={960}
      height={540}
      aria-label={label}
      onError={onFail}
    >
      <source src={src} type="video/webm" onError={onFail} />
    </video>
  );
}

export default function ThemedVideo({ base, alt }) {
  const wrap = useRef(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const update = () => setReduce(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const node = wrap.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [failed, reduce]);

  const folder = base.replace(/\/[^/]+$/, '/video');
  const name = base.slice(base.lastIndexOf('/') + 1);

  if (failed || reduce) {
    return <ThemedShot base={base} alt={alt} />;
  }

  return (
    <div ref={wrap} className="themed-video" role="group" aria-label={alt}>
      {['escuro', 'claro'].map((theme) => (
        <Clip
          key={theme}
          theme={theme}
          src={`${folder}/${name}-${theme}.webm`}
          poster={`${folder}/${name}-${theme}.webp`}
          label={`${alt} (vídeo em loop, sem som)`}
          play={visible}
          onFail={() => setFailed(true)}
        />
      ))}
    </div>
  );
}
