/* Conceptual defence animation only. No incident data, inference or network IO. */
'use strict';
(() => {
  const canvas = document.getElementById('whitecell-field');
  if (!canvas || canvas.dataset.cellFieldReady) return;
  let ctx;
  try { ctx = canvas.getContext('2d', { alpha: true }); } catch (_) { return; }
  if (!ctx) return;
  const host = canvas.closest('.whitecell-entry') || canvas.parentElement;
  if (!host) return;
  canvas.dataset.cellFieldReady = 'true';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const TAU = Math.PI * 2;
  const FRAME_MS = 1000 / 30;
  let width = 0;
  let height = 0;
  let ratio = 1;
  let mobile = false;
  let visible = !('IntersectionObserver' in window);
  let disposed = false;
  let manuallyPaused = document.documentElement.dataset.motionPaused === 'true';
  let frame = 0;
  let lastFrame = 0;
  let time = 0;
  let pairingTime = 0;
  let cells = [];
  let signals = [];
  let resizeObserver;
  let intersectionObserver;

  const random = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function makeCell(index, count) {
    // Stratified placement leaves a generous dark centre for foreground copy.
    const column = index % 2;
    const rows = Math.ceil(count / 2);
    return {
      x: width * (column ? random(.66, .9) : random(.08, .34)),
      y: height * ((Math.floor(index / 2) + random(.3, .75)) / rows),
      radius: mobile ? random(27, 44) : random(34, 65),
      phase: random(0, TAU),
      drift: random(3, 7),
      turn: random(-.1, .1),
      signal: null,
      chase: 0,
      pulse: 0
    };
  }

  function placeSignal(signal, initial = false, index = 0) {
    const cell = cells[index % cells.length];
    const angle = random(0, TAU);
    const distance = cell.radius + random(45, mobile ? 100 : 145);
    signal.x = clamp(cell.x + Math.cos(angle) * distance, 16, width - 16);
    signal.y = clamp(cell.y + Math.sin(angle) * distance, 24, height - 24);
    signal.vx = random(-7, 7);
    signal.vy = random(-5, 5);
    signal.phase = random(0, TAU);
    signal.size = random(3.5, 6);
    signal.kind = index % 3;
    signal.age = initial ? random(0, 3) : -random(2.5, 5);
    signal.cell = null;
    signal.engulf = 0;
  }

  function resetComposition() {
    const count = mobile ? 6 : 10;
    cells = Array.from({ length: count }, (_, index) => makeCell(index, count));
    signals = Array.from({ length: mobile ? 8 : 14 }, (_, index) => {
      const signal = {};
      placeSignal(signal, true, index);
      return signal;
    });
    pairingTime = .5;
  }

  function resize() {
    if (disposed) return;
    const nextWidth = Math.round(host.clientWidth);
    const nextHeight = Math.round(host.clientHeight);
    if (nextWidth < 1 || nextHeight < 1) { stop(); return; }
    const nextRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    if (width === nextWidth && height === nextHeight && ratio === nextRatio) return;
    const oldWidth = width;
    const oldHeight = height;
    const oldMobile = mobile;
    width = nextWidth;
    height = nextHeight;
    ratio = nextRatio;
    mobile = width <= 760;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!cells.length || oldMobile !== mobile || !oldWidth || !oldHeight) {
      resetComposition();
    } else {
      for (const item of [...cells, ...signals]) {
        item.x *= width / oldWidth;
        item.y *= height / oldHeight;
      }
    }
    draw();
    updatePlayback();
  }

  function pairNearbySignals() {
    const maxActive = mobile ? 2 : 3;
    let active = cells.filter(cell => cell.signal).length;
    if (active >= maxActive) return;
    for (const signal of signals) {
      if (signal.cell || signal.age < 1) continue;
      let candidate = null;
      let distance = mobile ? 190 : 270;
      for (const cell of cells) {
        if (cell.signal) continue;
        const next = Math.hypot(signal.x - cell.x, signal.y - cell.y);
        if (next < distance) { candidate = cell; distance = next; }
      }
      if (!candidate) continue;
      candidate.signal = signal;
      candidate.chase = 0;
      signal.cell = candidate;
      active++;
      if (active >= maxActive) break;
    }
  }

  function release(cell, consumed) {
    const signal = cell.signal;
    if (!signal) return;
    cell.signal = null;
    signal.cell = null;
    signal.engulf = 0;
    if (consumed) {
      cell.pulse = 1;
      placeSignal(signal, false, signals.indexOf(signal));
    }
  }

  function advance(dt) {
    time += dt;
    pairingTime -= dt;
    if (pairingTime <= 0) { pairNearbySignals(); pairingTime = .8; }
    for (const signal of signals) {
      signal.age += dt;
      if (signal.age < 0 || signal.engulf > 0) continue;
      signal.x += (signal.vx + Math.sin(time * .4 + signal.phase) * 2) * dt;
      signal.y += signal.vy * dt;
      if (signal.x < 12 || signal.x > width - 12) signal.vx *= -1;
      if (signal.y < 18 || signal.y > height - 18) signal.vy *= -1;
      signal.x = clamp(signal.x, 12, width - 12);
      signal.y = clamp(signal.y, 18, height - 18);
    }
    for (const cell of cells) {
      cell.pulse = Math.max(0, cell.pulse - dt * .45);
      const signal = cell.signal;
      if (signal) {
        cell.chase += dt;
        const dx = signal.x - cell.x;
        const dy = signal.y - cell.y;
        const distance = Math.hypot(dx, dy);
        if (distance < cell.radius * .78 || signal.engulf > 0) {
          signal.engulf += dt / 2.6;
          // The signal moves inward as the living membrane closes around it.
          const pull = Math.min(1, dt * 1.6);
          signal.x += (cell.x - signal.x) * pull;
          signal.y += (cell.y - signal.y) * pull;
          if (signal.engulf >= 1) release(cell, true);
        } else {
          const speed = mobile ? 22 : 29;
          cell.x += dx / distance * speed * dt;
          cell.y += dy / distance * speed * dt;
        }
        if (cell.chase > 16 && cell.signal) release(cell, false);
      } else {
        cell.x += Math.cos(time * .16 + cell.phase) * cell.drift * dt;
        cell.y += Math.sin(time * .12 + cell.phase) * cell.drift * dt;
      }
      cell.x = clamp(cell.x, cell.radius * .55, width - cell.radius * .55);
      cell.y = clamp(cell.y, cell.radius * .55, height - cell.radius * .55);
    }
  }

  function membrane(cell, inset = 1) {
    const points = [];
    const targetAngle = cell.signal ? Math.atan2(cell.signal.y - cell.y, cell.signal.x - cell.x) : 0;
    const extension = cell.signal ? (1 - cell.signal.engulf) * .13 : 0;
    for (let i = 0; i < 20; i++) {
      const angle = i / 20 * TAU;
      const ripple = Math.sin(angle * 3 + cell.phase + time * .48) * .075
        + Math.sin(angle * 5 - time * .31 + cell.phase * 2) * .035;
      const reach = Math.pow(Math.max(0, Math.cos(angle - targetAngle)), 6) * extension;
      const radius = cell.radius * inset * (1 + ripple + reach + cell.pulse * .04);
      points.push({ x: cell.x + Math.cos(angle) * radius, y: cell.y + Math.sin(angle) * radius * .91 });
    }
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.moveTo((last.x + points[0].x) / 2, (last.y + points[0].y) / 2);
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    });
    ctx.closePath();
  }

  function drawCell(cell) {
    const r = cell.radius;
    const active = Boolean(cell.signal);
    const fill = ctx.createRadialGradient(cell.x + r * .35, cell.y - r * .65, 0, cell.x, cell.y, r * 1.25);
    fill.addColorStop(0, active ? '#252525' : '#1c1c1c');
    fill.addColorStop(.5, '#090909');
    fill.addColorStop(1, '#030303');
    membrane(cell);
    ctx.fillStyle = fill;
    ctx.fill();
    const rim = ctx.createLinearGradient(cell.x - r, cell.y + r, cell.x + r * .65, cell.y - r);
    rim.addColorStop(0, 'rgba(165,165,165,.18)');
    rim.addColorStop(.43, 'rgba(100,100,100,.12)');
    rim.addColorStop(.75, active ? 'rgba(220,220,220,.7)' : 'rgba(190,190,190,.45)');
    rim.addColorStop(1, 'rgba(255,255,255,.9)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = active ? 1.15 : .8;
    ctx.shadowColor = active ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.14)';
    ctx.shadowBlur = active ? 13 : 7;
    ctx.stroke();
    ctx.shadowBlur = 0;
    membrane(cell, .81);
    ctx.strokeStyle = 'rgba(175,175,175,.09)';
    ctx.lineWidth = .6;
    ctx.stroke();
    if (cell.pulse > 0) {
      membrane(cell, 1 + (1 - cell.pulse) * .22);
      ctx.strokeStyle = `rgba(215,215,215,${cell.pulse * .18})`;
      ctx.lineWidth = .7;
      ctx.stroke();
    }
  }

  function drawSignal(signal) {
    if (signal.age < 0) return;
    const fadeIn = Math.min(1, signal.age / 1.2);
    const alpha = fadeIn * (1 - signal.engulf) * (signal.cell ? .85 : .43);
    const size = signal.size * (1 - signal.engulf * .85);
    ctx.save();
    ctx.translate(signal.x, signal.y);
    ctx.rotate(signal.phase + time * .12);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#dedede';
    ctx.lineWidth = .85;
    ctx.beginPath();
    if (signal.kind === 0) {
      ctx.moveTo(0, -size); ctx.lineTo(size, 0); ctx.lineTo(0, size); ctx.lineTo(-size, 0); ctx.closePath();
    } else if (signal.kind === 1) {
      for (let i = 0; i <= 6; i++) {
        const angle = i / 6 * TAU;
        if (i === 0) ctx.moveTo(Math.cos(angle) * size, Math.sin(angle) * size);
        else ctx.lineTo(Math.cos(angle) * size, Math.sin(angle) * size);
      }
    } else {
      ctx.moveTo(-size, -size * .7); ctx.lineTo(-size, size * .7); ctx.lineTo(-size * .45, size * .7);
      ctx.moveTo(size, size * .7); ctx.lineTo(size, -size * .7); ctx.lineTo(size * .45, -size * .7);
    }
    ctx.stroke();
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-.8, -.8, 1.6, 1.6);
    if (signal.engulf > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, size + (1 - signal.engulf) * 12, 0, TAU);
      ctx.strokeStyle = 'rgba(235,235,235,.35)';
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    if (!width || !height || disposed) return;
    ctx.clearRect(0, 0, width, height);
    for (const cell of cells) drawCell(cell);
    for (const signal of signals) drawSignal(signal);
  }

  function tick(timestamp) {
    frame = 0;
    if (disposed || !visible || document.hidden || reduced.matches || manuallyPaused) return;
    if (!lastFrame) lastFrame = timestamp;
    const elapsed = timestamp - lastFrame;
    if (elapsed >= FRAME_MS) {
      advance(Math.min(elapsed / 1000, .08));
      lastFrame = timestamp - elapsed % FRAME_MS;
      draw();
    }
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
  }

  function updatePlayback() {
    stop();
    if (disposed || !width || !height) return;
    if (reduced.matches || manuallyPaused) { draw(); return; }
    if (visible && !document.hidden) frame = requestAnimationFrame(tick);
  }

  function onMotionChange() {
    // Switching to reduced motion freezes a balanced composition, mid-event free.
    if (reduced.matches) { time = 0; resetComposition(); }
    updatePlayback();
  }

  function onGlobalMotionChange(event) {
    manuallyPaused = Boolean(event.detail.paused);
    updatePlayback();
  }

  function onPageHide(event) {
    stop();
    if (event.persisted) return;
    disposed = true;
    if (resizeObserver) resizeObserver.disconnect();
    if (intersectionObserver) intersectionObserver.disconnect();
    window.removeEventListener('resize', resize);
    window.removeEventListener('pageshow', updatePlayback);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', updatePlayback);
    reduced.removeEventListener('change', onMotionChange);
    document.removeEventListener('whitecell-motion-change', onGlobalMotionChange);
    cells = [];
    signals = [];
  }

  if ('IntersectionObserver' in window) {
    intersectionObserver = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      updatePlayback();
    }, { threshold: 0 });
    intersectionObserver.observe(host);
  }
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
  }
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pageshow', updatePlayback);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', updatePlayback);
  reduced.addEventListener('change', onMotionChange);
  document.addEventListener('whitecell-motion-change', onGlobalMotionChange);
  resize();
})();
