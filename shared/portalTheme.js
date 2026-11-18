/* =========================================================================
   Tema do portal da loja: cores da loja com contraste garantido (WCAG AA).
   -------------------------------------------------------------------------
   A loja escolhe cor primária, secundária e de fundo no PDV; nada garante que
   combinem. Aqui toda combinação de TEXTO sobre fundo é conferida (4,5:1) e,
   se não passar, a cor é ajustada (escurecida/clareada) ou troca por uma
   segura. Controles de formulário e foco têm piso de 3:1 (WCAG 1.4.11).
   Puro (sem DOM): o front aplica o resultado como propriedades CSS e o teste
   roda em Node.
   ========================================================================= */

export const SAFE = Object.freeze({ primaria: '#1d4ed8', secundaria: '#dbeafe', fundo: '#ffffff' });

const HEX = /^#[0-9a-f]{6}$/i;

export const isHex = (value) => typeof value === 'string' && HEX.test(value.trim());

export function parseHex(hex) {
  const v = hex.trim().slice(1);
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

export const toHex = (rgb) =>
  `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;

/** Luminância relativa (WCAG 2.x). */
export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste entre duas cores (1 a 21). */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mistura `a` com `b` (t=0 é `a`, t=1 é `b`). */
export function mix(a, b, t) {
  const [ra, rb] = [parseHex(a), parseHex(b)];
  return toHex(ra.map((c, i) => c + (rb[i] - c) * t));
}

/** Cor de texto (de uma lista) com o maior contraste sobre `bg`, preferindo a primeira que chega a `prefer`. */
export function readableOn(bg, candidates = ['#111827', '#ffffff', '#000000'], prefer = 7) {
  const ok = candidates.find((c) => contrast(c, bg) >= prefer);
  if (ok) return ok;
  return [...candidates].sort((x, y) => contrast(y, bg) - contrast(x, bg))[0];
}

/**
 * Aproxima `fg` do preto ou do branco (o que contrasta mais com `bg`) até chegar a `min`.
 * Devolve `fg` intacta se já passa. Sempre chega: preto/branco puros dão >= 4,58:1 sobre qualquer fundo.
 */
export function ensureContrast(fg, bg, min = 4.5) {
  if (contrast(fg, bg) >= min) return fg;
  const target = contrast('#000000', bg) >= contrast('#ffffff', bg) ? '#000000' : '#ffffff';
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const candidate = mix(fg, target, Math.min(t, 1));
    if (contrast(candidate, bg) >= min) return candidate;
  }
  return target;
}

const TONES = {
  light: {
    ok: ['#dcfce7', '#14532d'],
    warn: ['#fef3c7', '#78350f'],
    danger: ['#fee2e2', '#7f1d1d'],
  },
  dark: {
    ok: ['#14532d', '#dcfce7'],
    warn: ['#78350f', '#fef3c7'],
    danger: ['#7f1d1d', '#fee2e2'],
  },
};

/**
 * Tema a partir da config da loja.
 * `usedFallback`: alguma cor veio inválida e foi trocada pela segura.
 * `adjusted`: a cor válida foi corrigida para passar no contraste.
 */
export function buildPortalTheme(cores = {}) {
  let usedFallback = false;
  let adjusted = false;
  const pick = (value, safe) => {
    if (isHex(value)) return value.trim().toLowerCase();
    if (value !== undefined && value !== null && value !== '') usedFallback = true;
    return safe;
  };

  let bg = pick(cores?.fundo, SAFE.fundo);
  /* Fundo de tom médio: nem preto nem branco passam folgado (< 5,5:1). Melhor o fundo seguro do que texto no limite. */
  if (Math.max(contrast(bg, '#000000'), contrast(bg, '#ffffff')) < 5.5) {
    bg = SAFE.fundo;
    usedFallback = true;
  }
  const primary = pick(cores?.primaria, SAFE.primaria);
  const secondary = pick(cores?.secundaria, SAFE.secundaria);

  const dark = luminance(bg) < 0.18;
  const ink = readableOn(bg, dark ? ['#f9fafb', '#ffffff'] : ['#111827', '#000000']);
  const tinted = mix(bg, ink, dark ? 0.08 : 0.035);
  const surface = contrast(ink, tinted) >= 4.5 ? tinted : bg;
  const muted = ensureContrast(ensureContrast(mix(ink, bg, 0.38), bg, 4.5), surface, 4.5);
  const line = mix(bg, ink, 0.18);
  /* Borda de campo e de botão secundário: componente de interface precisa de 3:1. */
  const inputLine = ensureContrast(mix(bg, ink, 0.55), bg, 3);

  /* Botão da marca: o texto é sempre preto ou branco (>= 4,5:1 sobre a cor). */
  const accent = primary;
  const onAccent = readableOn(accent, ['#ffffff', '#111827', '#000000'], 4.5);

  /* Cor da marca usada como TEXTO ou ícone sobre o fundo (links, preço, aba ativa). */
  const accentText = ensureContrast(accent, bg, 4.5);
  if (accentText !== accent) adjusted = true;
  const focus = ensureContrast(accent, bg, 3);

  /* Secundária: superfície de destaque; o texto sobre ela é escolhido, não herdado. */
  let soft = secondary;
  if (contrast(soft, bg) < 1.05) soft = mix(accent, bg, 0.88);
  const onSoft = readableOn(soft, ['#111827', '#f9fafb', '#000000', '#ffffff'], 7);

  const tones = dark ? TONES.dark : TONES.light;
  const danger = ensureContrast(dark ? '#fca5a5' : '#b91c1c', bg, 4.5);

  const vars = {
    '--p-bg': bg,
    '--p-ink': ink,
    '--p-muted': muted,
    '--p-surface': surface,
    '--p-line': line,
    '--p-input-line': inputLine,
    '--p-accent': accent,
    '--p-on-accent': onAccent,
    '--p-accent-text': accentText,
    /* Hover se afasta da cor do texto do botão: o contraste só aumenta. */
    '--p-accent-hover': mix(accent, luminance(onAccent) > 0.5 ? '#000000' : '#ffffff', 0.14),
    '--p-focus': focus,
    '--p-soft': soft,
    '--p-on-soft': onSoft,
    '--p-danger': danger,
    '--p-ok-bg': tones.ok[0],
    '--p-ok-fg': tones.ok[1],
    '--p-warn-bg': tones.warn[0],
    '--p-warn-fg': tones.warn[1],
    '--p-danger-bg': tones.danger[0],
    '--p-danger-fg': tones.danger[1],
  };

  return { vars, usedFallback, adjusted, dark };
}

/** Pares (texto, fundo, mínimo) que o tema promete; o teste confere todos. */
export function themePairs(vars) {
  const v = vars;
  return [
    [v['--p-ink'], v['--p-bg'], 4.5],
    [v['--p-muted'], v['--p-bg'], 4.5],
    [v['--p-ink'], v['--p-surface'], 4.5],
    [v['--p-muted'], v['--p-surface'], 4.5],
    [v['--p-on-accent'], v['--p-accent'], 4.5],
    [v['--p-on-accent'], v['--p-accent-hover'], 4.5],
    [v['--p-accent-text'], v['--p-bg'], 4.5],
    [v['--p-on-soft'], v['--p-soft'], 4.5],
    [v['--p-danger'], v['--p-bg'], 4.5],
    [v['--p-ok-fg'], v['--p-ok-bg'], 4.5],
    [v['--p-warn-fg'], v['--p-warn-bg'], 4.5],
    [v['--p-danger-fg'], v['--p-danger-bg'], 4.5],
    [v['--p-input-line'], v['--p-bg'], 3],
    [v['--p-focus'], v['--p-bg'], 3],
  ];
}
