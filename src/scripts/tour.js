const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const KEY = 'tour-seen';

export const tourSeen = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(KEY, '1'); } catch {} };

// Steps: { target: () => Element | DOMRect, text, before?: () => Promise | void, pad? }
export function runTour(steps, { onEnd } = {}) {
  let k = 0;
  const hole = Object.assign(document.createElement('div'), { className: 'tour-hole' });
  const card = Object.assign(document.createElement('div'), { className: 'tour-card' });
  document.body.append(hole, card);

  function place() {
    const s = steps[k];
    const t = s.target();
    if (!t) return;
    const r = t instanceof Element ? t.getBoundingClientRect() : t;
    const pad = s.pad ?? 6, m = 12;
    Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let top = r.bottom + pad + m;
    if (top + ch > innerHeight - m) top = r.top - pad - m - ch;
    card.style.top = `${clamp(top, m, innerHeight - ch - m)}px`;
    card.style.left = `${clamp(r.left + r.width / 2 - cw / 2, m, innerWidth - cw - m)}px`;
  }

  async function show() {
    const s = steps[k];
    await s.before?.();
    const last = k === steps.length - 1;
    card.innerHTML = `<p>${s.text}</p><div><span>${k + 1}/${steps.length}</span>`
      + `<button data-a="skip">Skip</button>${k ? '<button data-a="back">Back</button>' : ''}`
      + `<button data-a="next" class="primary">${last ? 'Done' : 'Next'}</button></div>`;
    place();
  }

  function end() {
    cleanup();
    hole.remove(); card.remove();
  }

  // Skipping shrinks the card into the Help button so people see where to find it again.
  function skip() {
    const help = document.getElementById('help');
    if (!help || matchMedia('(prefers-reduced-motion: reduce)').matches) return end();
    cleanup();
    const c = card.getBoundingClientRect(), h = help.getBoundingClientRect();
    const dx = h.left + h.width / 2 - (c.left + c.width / 2), dy = h.top + h.height / 2 - (c.top + c.height / 2);
    card.style.pointerEvents = 'none';
    hole.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
    card.animate([
      { transform: 'none', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.06)`, opacity: 0.3 },
    ], { duration: 520, easing: 'cubic-bezier(.55,0,.7,.2)', fill: 'forwards' }).finished.then(() => {
      hole.remove(); card.remove();
      help.animate([
        { transform: 'translateY(-50%) rotate(-1.5deg) scale(1)' },
        { transform: 'translateY(-50%) rotate(-1.5deg) scale(1.18)' },
        { transform: 'translateY(-50%) rotate(-1.5deg) scale(1)' },
      ], { duration: 320, easing: 'ease-out' });
    });
  }

  function cleanup() {
    removeEventListener('resize', place);
    removeEventListener('keydown', key);
    markSeen();
    onEnd?.();
  }

  const key = (e) => {
    if (e.key === 'Escape') skip();
    else if (e.key === 'ArrowRight' || e.key === 'Enter') go(1);
    else if (e.key === 'ArrowLeft' && k) go(-1);
  };
  const go = (d) => { if (k + d >= steps.length) return end(); k += d; show(); };

  card.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'next') go(1);
    else if (a === 'back') go(-1);
    else if (a === 'skip') skip();
  });
  addEventListener('resize', place);
  addEventListener('keydown', key);
  show();
  return { place, end };
}
