'use strict';

/* =========================================================
   AGACHURI SAL E AS FLORALINAS
   Protótipo jogável — defesa de território por trilhas
   ========================================================= */

/* ---------------- Canvas ---------------- */
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const W = 1000, H = 640;
const DPR = Math.min(2, window.devicePixelRatio || 1);
cv.width = W * DPR;
cv.height = H * DPR;
ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

/* ---------------- Grade ---------------- */
const GRID = { x: 140, y: 112, cols: 9, rows: 5, cw: 88, ch: 94 };
GRID.w = GRID.cols * GRID.cw;
GRID.h = GRID.rows * GRID.ch;
const cellX = c => GRID.x + c * GRID.cw + GRID.cw / 2;
const cellY = r => GRID.y + r * GRID.ch + GRID.ch / 2;

/* ---------------- Utilidades ---------------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dentro = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

function rrect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function texto(s, x, y, size = 16, cor = '#fff', align = 'left', bold = true) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = cor;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

function circulo(x, y, r, cor) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = cor;
  ctx.fill();
}

/* ---------------- Áudio ---------------- */
let AC = null;
function audio() {
  if (AC) return AC;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); }
  catch (e) { AC = null; }
  return AC;
}
function som(tipo) {
  if (S.mudo) return;
  const a = audio();
  if (!a) return;
  if (a.state === 'suspended') a.resume();
  const cfg = {
    tiro:     { f: 620, f2: 380, d: .07, t: 'square', v: .035 },
    acerto:   { f: 180, f2: 90,  d: .09, t: 'sawtooth', v: .05 },
    plantar:  { f: 300, f2: 620, d: .12, t: 'sine', v: .08 },
    coletar:  { f: 880, f2: 1320, d: .09, t: 'sine', v: .06 },
    erro:     { f: 160, f2: 120, d: .12, t: 'square', v: .05 },
    latido:   { f: 180, f2: 70,  d: .22, t: 'sawtooth', v: .1 },
    morte:    { f: 240, f2: 60,  d: .24, t: 'sawtooth', v: .07 },
    dano:     { f: 120, f2: 45,  d: .35, t: 'square', v: .1 },
    boss:     { f: 90,  f2: 40,  d: .6,  t: 'sawtooth', v: .12 },
    vitoria:  { f: 520, f2: 1040, d: .5, t: 'triangle', v: .1 },
    solar:    { f: 400, f2: 1400, d: .35, t: 'sine', v: .09 },
  }[tipo];
  if (!cfg) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = cfg.t;
  o.frequency.setValueAtTime(cfg.f, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, cfg.f2), t + cfg.d);
  g.gain.setValueAtTime(cfg.v, t);
  g.gain.exponentialRampToValueAtTime(.0001, t + cfg.d);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + cfg.d + .03);
}

/* ---------------- Definições das floralinas ---------------- */
const ORDEM_PLANTAS = ['girassol', 'samambaia', 'macieira', 'orquidea', 'espinhosa', 'trevo', 'solar'];

const PLANTAS = {
  girassol: {
    nome: 'Girassol', custo: 50, vida: 120, recarga: 4, emoji: '🌻',
    desc: 'Produz raiozinhos de energia solar.',
    tick(b, p, dt) {
      p.timer -= dt;
      if (p.timer <= 0) {
        p.timer = 7;
        dropEnergia(b, p.x + rnd(-14, 14), p.y - 4, 25);
      }
    },
  },
  samambaia: {
    nome: 'Samambaia', custo: 50, vida: 470, recarga: 7, regen: 8, emoji: '🌿',
    desc: 'Muro resistente que se regenera com o tempo.',
  },
  macieira: {
    nome: 'Árvore de Maçãs', custo: 100, vida: 170, recarga: 5, emoji: '🍎',
    desc: 'Atira maçãs nos inimigos da sua trilha.',
    tick(b, p, dt) {
      p.timer -= dt * (p.buff ? 1.4 : 1);
      if (p.timer <= 0 && temInimigo(b, p)) {
        p.timer = 1.35;
        b.projeteis.push({
          x: p.x + 18, y: p.y - 4, row: p.row, vel: 340,
          dano: 24 * p.danoMult, tipo: 'maca', t: 0,
        });
        som('tiro');
      }
    },
  },
  orquidea: {
    nome: 'Orquídea', custo: 100, vida: 120, recarga: 8, emoji: '🌸',
    desc: 'Acumula carga e desacelera a trilha inteira.',
    tick(b, p, dt) {
      if (p.ativa) {
        p.carga += dt / 8;
        if (p.carga >= 1) { p.ativa = false; p.carga = 0; p.descanso = 3.5; }
      } else if (p.descanso > 0) {
        p.descanso -= dt;
      } else {
        p.carga += dt / 9 * (p.buff ? 1.4 : 1);
        if (p.carga >= 1) { p.ativa = true; p.carga = 0; }
      }
    },
  },
  espinhosa: {
    nome: 'Árvore Espinhosa', custo: 125, vida: 240, recarga: 9, emoji: '🌵',
    desc: 'Espinhos ferem quem tenta mordê-la.',
  },
  trevo: {
    nome: 'Trevo', custo: 75, vida: 110, recarga: 11, emoji: '🍀',
    desc: 'Acelera as floralinas ao redor (buff em área).',
  },
  solar: {
    nome: 'Planta Solar Ofensiva', custo: 130, vida: 150, recarga: 13, emoji: '☀️',
    desc: 'Carrega e dispara um raio solar pela trilha.',
    tick(b, p, dt) {
      if (p.descanso > 0) { p.descanso -= dt; return; }
      if (p.pronto) {
        if (temInimigo(b, p)) {
          dispararSolar(b, p);
          p.pronto = false;
          p.carga = 0;
          p.descanso = 6;
        }
        return;
      }
      p.carga += dt / 11 * (p.buff ? 1.35 : 1);
      if (p.carga >= 1) { p.carga = 1; p.pronto = true; }
    },
  },
};

/* ---------------- Definições dos carneceiros ---------------- */
const INIMIGOS = {
  comum:   { nome: 'Carneceiro',          vida: 110, vel: 20, dps: 22, raio: 20, escala: 1 },
  rapido:  { nome: 'Faísca',              vida: 70,  vel: 38, dps: 14, raio: 16, escala: .84 },
  casca:   { nome: 'Crosta de Magma',     vida: 300, vel: 13, dps: 30, raio: 24, escala: 1.14 },
  marreta: { nome: 'Zumbi da Marreta',    vida: 240, vel: 18, dps: 24, raio: 22, escala: 1, marreta: true },
  boss:    { nome: 'Carneceiro de Magma', vida: 1900, vel: 7.5, dps: 48, raio: 38, escala: 1.9, boss: true },
};

/* ---------------- Temas visuais ---------------- */
const TEMAS = {
  ponte:   { ceu: ['#101b2e', '#3c5a7a'], chao: '#6b4a2e', chao2: '#5a3d26', detalhe: '#8a6a45' },
  grecia:  { ceu: ['#1c3f5e', '#7fb0c9'], chao: '#d9cbb0', chao2: '#c8b895', detalhe: '#f2eadb' },
  templo:  { ceu: ['#2b2036', '#8a6a5a'], chao: '#b09a78', chao2: '#9a8464', detalhe: '#d9c9a8' },
  neve:    { ceu: ['#152a42', '#6f8fb0'], chao: '#dfe9f5', chao2: '#c6d8ea', detalhe: '#ffffff' },
  pantano: { ceu: ['#0f2119', '#2f4a35'], chao: '#3f5a3a', chao2: '#31462f', detalhe: '#6f8f5a' },
  rio:     { ceu: ['#0f2a3d', '#2f6f8f'], chao: '#2f6f8f', chao2: '#255a75', detalhe: '#8fd0e8' },
  escadas: { ceu: ['#241f33', '#6a5a7a'], chao: '#8a7a6a', chao2: '#756757', detalhe: '#b3a18c' },
  vulcao:  { ceu: ['#120a0e', '#3a1418'], chao: '#2a1a1c', chao2: '#1f1214', detalhe: '#ff6a2a' },
};

/* ---------------- Fases ---------------- */
const NIVEIS = [
  {
    nome: 'A Ponte', tema: 'ponte', emoji: '🌉', ondas: 6, intervalo: 10,
    pool: ['comum', 'comum', 'rapido'], plantas: ORDEM_PLANTAS.slice(0, 3), forca: 1,
    desc: 'A travessia entre a cidade tecnológica e a Grécia Antiga.',
  },
  {
    nome: 'Cidade da Grécia', tema: 'grecia', emoji: '🏛️', ondas: 7, intervalo: 9.5,
    pool: ['comum', 'rapido', 'comum', 'rapido'], plantas: ORDEM_PLANTAS.slice(0, 4), forca: 1.05,
    desc: 'Casas de mármore e o povo que viu o primeiro caso da doença.',
  },
  {
    nome: 'Planalto e Templo', tema: 'templo', emoji: '🏛', ondas: 8, intervalo: 9,
    pool: ['comum', 'rapido', 'casca'], plantas: ORDEM_PLANTAS.slice(0, 5), forca: 1.1,
    desc: 'Ruínas antigas escondem os primeiros minérios extraídos.',
  },
  {
    nome: 'Colinas Nevadas', tema: 'neve', emoji: '❄️', ondas: 8, intervalo: 9,
    pool: ['rapido', 'rapido', 'casca', 'comum'], plantas: ORDEM_PLANTAS.slice(0, 6), forca: 1.15,
    desc: 'O frio não impediu a mineração — nem a transformação.',
  },
  {
    nome: 'Pântano', tema: 'pantano', emoji: '🌿', ondas: 9, intervalo: 9.5,
    pool: ['comum', 'rapido', 'marreta', 'casca'], plantas: ORDEM_PLANTAS.slice(0, 7), forca: 1.2,
    desc: 'Água parada, lama e carneceiros à espreita.',
  },
  {
    nome: 'Rio', tema: 'rio', emoji: '🌊', ondas: 9, intervalo: 9,
    pool: ['rapido', 'casca', 'marreta', 'comum'], plantas: ORDEM_PLANTAS.slice(0, 7), forca: 1.25,
    desc: 'A travessia é longa e o outro lado já está tomado.',
  },
  {
    nome: 'Escadas Reais', tema: 'escadas', emoji: '🪜', ondas: 10, intervalo: 9,
    pool: ['casca', 'marreta', 'rapido', 'comum'], plantas: ORDEM_PLANTAS.slice(0, 7), forca: 1.3,
    desc: 'O caminho final antes das fumarolas do vulcão.',
  },
  {
    nome: 'Vulcão', tema: 'vulcao', emoji: '🌋', ondas: 8, intervalo: 9, boss: true, bossT: 55,
    pool: ['marreta', 'casca', 'rapido'], plantas: ORDEM_PLANTAS.slice(0, 7), forca: 1.4,
    desc: 'A origem de tudo. O grande responsável espera lá dentro.',
  },
];

/* =========================================================
   ESTADO / PERSISTÊNCIA
   ========================================================= */
const SAVE_KEY = 'agachuri-sal-v1';
function estadoPadrao() {
  return { liberado: 0, concluidos: [], moedas: 0, perigo: 0, upgrades: {}, jardins: {}, mudo: false };
}
function carregar() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return estadoPadrao();
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object') return estadoPadrao();
    return Object.assign(estadoPadrao(), d);
  } catch (e) { return estadoPadrao(); }
}
function salvar() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* sem salvamento */ }
}

const S = carregar();
S.tela = 'menu';
S.pausado = false;

let B = null;

/* ---------------- Evolução ---------------- */
function nivelPlanta(tipo) { return S.upgrades[tipo] || 1; }
function multPlanta(tipo) { return 1 + 0.2 * (nivelPlanta(tipo) - 1); }
function custoUpgrade(tipo) {
  const nv = nivelPlanta(tipo);
  if (nv >= 5) return null;
  return Math.round(50 * Math.pow(1.7, nv - 1));
}
function plantasDisponiveis() {
  const i = Math.min(S.liberado, NIVEIS.length - 1);
  return NIVEIS[i].plantas;
}
function salvarJardim(b) {
  S.jardins[b.idx] = b.plantas.map(p => ({ tipo: p.tipo, row: p.row, col: p.col }));
  salvar();
}

/* =========================================================
   INTERFACE (overlay DOM)
   ========================================================= */
const overlayEl = document.getElementById('overlay');
function abrirOverlay(html) {
  overlayEl.innerHTML = html;
  overlayEl.classList.remove('hidden');
}
function fecharOverlay() {
  overlayEl.classList.add('hidden');
  overlayEl.innerHTML = '';
}
function bind(sel, fn) {
  overlayEl.querySelectorAll(sel).forEach(el => el.addEventListener('click', ev => {
    ev.preventDefault();
    fn(el, ev);
  }));
}
function chipsTopo() {
  return `<div class="chips">
    <span class="chip moeda">🪙 ${S.moedas} moedas</span>
    <span class="chip perigo">🔥 Perigo x${1 + S.perigo}</span>
    <span class="chip">🌱 ${S.concluidos.length}/${NIVEIS.length} fases</span>
  </div>`;
}

/* ---------------- Menu principal ---------------- */
function mostrarMenu() {
  S.tela = 'menu';
  S.pausado = false;
  abrirOverlay(`
    <div class="painel">
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        <div style="font-size:clamp(42px,7vw,76px);line-height:1">🐕<span style="margin-left:-8px">🌻</span></div>
        <div style="flex:1;min-width:220px">
          <h1 class="titulo">Agachuri Sal<br>e as Floralinas</h1>
          <p class="subtitulo">Defenda as trilhas, produza energia solar e descubra o que transformou os grecionos em carneceiros de magma.</p>
        </div>
      </div>
      <div class="linha-topo">${chipsTopo()}</div>
      <div class="acoes" style="justify-content:flex-start">
        <button id="btnJogar">▶ Jogar</button>
        <button id="btnLoja" class="secundario">🧬 Loja de Evolução</button>
        <button id="btnAjuda" class="secundario">📖 Como jogar</button>
        <button id="btnReset" class="secundario">Apagar progresso</button>
      </div>
      <p class="subtitulo" style="margin-top:18px;opacity:.7">Protótipo jogável · clique nas cartas e plante na grama · Espaço = latido do Agachuri</p>
    </div>
  `);
  document.getElementById('btnJogar').addEventListener('click', mostrarMapa);
  document.getElementById('btnLoja').addEventListener('click', mostrarLoja);
  document.getElementById('btnAjuda').addEventListener('click', mostrarAjuda);
  document.getElementById('btnReset').addEventListener('click', () => {
    if (confirm('Apagar todo o progresso salvo?')) {
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    }
  });
}

/* ---------------- Mapa de fases ---------------- */
function mostrarMapa() {
  S.tela = 'mapa';
  S.pausado = false;
  const atual = Math.min(S.liberado, NIVEIS.length - 1);
  const cards = NIVEIS.map((n, i) => {
    const concluida = S.concluidos.includes(i);
    const liberada = i <= S.liberado;
    const cls = !liberada ? 'bloqueada' : concluida ? 'concluida' : i === atual ? 'atual' : '';
    const jardim = (S.jardins[i] || []).length;
    const tag = !liberada ? '🔒 bloqueada' : concluida ? '✓ concluída' : jardim ? `🌱 ${jardim} no jardim` : 'jogar';
    return `<button class="fase ${cls}" data-jogar="${i}" ${liberada ? '' : 'disabled'}>
      <div class="num">Fase ${i + 1}</div>
      <div class="nome">${n.nome}</div>
      <div class="emoji">${n.emoji}</div>
      <div class="info">${n.desc}</div>
      <div class="tag">${tag}</div>
    </button>`;
  }).join('');
  abrirOverlay(`
    <div class="painel">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div>
          <h1 class="titulo" style="font-size:clamp(22px,3.2vw,32px)">Mapa da Jornada</h1>
          <p class="subtitulo">A ponte abre o caminho. Cada território guarda uma pista sobre o vulcão.</p>
        </div>
      </div>
      <div class="linha-topo">${chipsTopo()}</div>
      <div class="mapa">${cards}</div>
      <div class="dica">
        <b>Recuo de fase:</b> se um carneceiro chegar ao fim da trilha e derrubar o território, Agachuri recua <b>uma fase</b> em vez de reiniciar tudo. As floralinas que você plantou <b>continuam no jardim</b> — mas o Perigo aumenta e os inimigos voltam mais fortes.
      </div>
      <div class="acoes">
        <button id="btnLoja2">🧬 Loja de Evolução</button>
        <button id="btnAjuda2" class="secundario">📖 Como jogar</button>
        <button id="btnMenu" class="secundario">↩ Menu</button>
      </div>
    </div>
  `);
  bind('[data-jogar]', el => {
    const i = Number(el.dataset.jogar);
    if (i <= S.liberado) iniciarBatalha(i);
  });
  document.getElementById('btnLoja2').addEventListener('click', mostrarLoja);
  document.getElementById('btnAjuda2').addEventListener('click', mostrarAjuda);
  document.getElementById('btnMenu').addEventListener('click', mostrarMenu);
}

/* ---------------- Loja de evolução ---------------- */
function mostrarLoja() {
  S.tela = 'loja';
  const disp = plantasDisponiveis();
  const cards = disp.map(tipo => {
    const d = PLANTAS[tipo];
    const nv = nivelPlanta(tipo);
    const custo = custoUpgrade(tipo);
    const pips = Array.from({ length: 5 }, (_, i) => `<span class="pip ${i < nv ? 'on' : ''}"></span>`).join('');
    const botao = custo === null
      ? `<button disabled>Nível máximo</button>`
      : `<button data-up="${tipo}" ${S.moedas < custo ? 'disabled' : ''}>Melhorar · 🪙 ${custo}</button>`;
    return `<div class="planta-card">
      <div class="icone">${d.emoji}</div>
      <div class="nome">${d.nome}</div>
      <div class="nv">Nível ${nv} · +${(nv - 1) * 20}% vida e dano</div>
      <div class="pips">${pips}</div>
      ${botao}
    </div>`;
  }).join('');
  abrirOverlay(`
    <div class="painel">
      <h1 class="titulo" style="font-size:clamp(22px,3.2vw,32px)">Loja de Evolução</h1>
      <p class="subtitulo">Moedas vêm das fases vencidas. Melhorias valem para todas as floralinas do tipo.</p>
      <div class="linha-topo">${chipsTopo()}</div>
      <div class="loja-grid">${cards}</div>
      <div class="acoes">
        <button id="btnVoltarLoja">Voltar ao mapa</button>
        <button id="btnMenuLoja" class="secundario">↩ Menu</button>
      </div>
    </div>
  `);
  bind('[data-up]', el => {
    const tipo = el.dataset.up;
    const custo = custoUpgrade(tipo);
    if (custo === null || S.moedas < custo) return;
    S.moedas -= custo;
    S.upgrades[tipo] = nivelPlanta(tipo) + 1;
    salvar();
    som('coletar');
    mostrarLoja();
  });
  document.getElementById('btnVoltarLoja').addEventListener('click', mostrarMapa);
  document.getElementById('btnMenuLoja').addEventListener('click', mostrarMenu);
}

/* ---------------- Ajuda ---------------- */
function mostrarAjuda() {
  const voltar = S.tela === 'batalha' ? 'pausar' : S.tela === 'loja' ? 'mostrarLoja' : 'mostrarMapa';
  abrirOverlay(`
    <div class="painel">
      <h1 class="titulo" style="font-size:clamp(22px,3.2vw,32px)">Como jogar</h1>
      <p class="subtitulo">Você é Agachuri Sal. As floralinas defendem as trilhas — você coordena a energia.</p>
      <div class="regras">
        <div class="regra"><b>1. Plante</b>Clique numa carta e depois numa célula da grama. Cada floralina custa raiozinhos e tem recarga.</div>
        <div class="regra"><b>2. Colete energia</b>Girassóis e o céu geram raiozinhos. Clique neles antes que desapareçam.</div>
        <div class="regra"><b>3. Carga elétrica</b>Orquídea e Planta Solar acumulam carga. Quando enchem, agem e entram em descanso.</div>
        <div class="regra"><b>4. Latido</b>Espaço (ou o botão do cachorro) empurra e atordoa os inimigos que se aproximam do fim.</div>
        <div class="regra"><b>5. Terreno sujo</b>O Zumbi da Marreta suja células. Use a pá para limpar, senão não dá para plantar ali.</div>
        <div class="regra"><b>6. Recuo</b>Se perder, volta uma fase. O jardim permanece, o Perigo sobe e os inimigos ficam mais fortes.</div>
      </div>
      <div class="acoes">
        <button id="btnAjudaVoltar">Entendi</button>
      </div>
    </div>
  `);
  document.getElementById('btnAjudaVoltar').addEventListener('click', () => {
    if (voltar === 'pausar') { mostrarPausa(); return; }
    if (voltar === 'mostrarLoja') { mostrarLoja(); return; }
    mostrarMapa();
  });
  const voltaSep = document.getElementById('btnAjudaVoltar');
  voltaSep.textContent = voltar === 'pausar' ? 'Voltar ao jogo' : 'Entendi';
}

/* ---------------- Pausa ---------------- */
function pausar() {
  if (!B || B.estado !== 'jogando' || S.tela !== 'batalha') return;
  S.pausado = true;
  abrirOverlay(`
    <div class="painel" style="max-width:520px;text-align:center">
      <h1 class="titulo" style="font-size:clamp(22px,3.2vw,32px)">Pausa</h1>
      <p class="subtitulo">O território espera por Agachuri.</p>
      <div class="acoes">
        <button id="btnVoltarJogo">Continuar</button>
        <button id="btnAjudaPausa" class="secundario">Como jogar</button>
        <button id="btnSair" class="secundario">Sair para o mapa</button>
      </div>
    </div>
  `);
  document.getElementById('btnVoltarJogo').addEventListener('click', () => {
    S.pausado = false;
    fecharOverlay();
  });
  document.getElementById('btnAjudaPausa').addEventListener('click', mostrarAjuda);
  document.getElementById('btnSair').addEventListener('click', () => {
    salvarJardim(B);
    B = null;
    S.pausado = false;
    mostrarMapa();
  });
}

/* ---------------- Vitória ---------------- */
function mostrarVitoria(b) {
  const primeira = !S.concluidos.includes(b.idx);
  const ganho = primeira ? 60 + b.idx * 25 : 20 + b.idx * 8;
  S.moedas += ganho;
  if (primeira) S.concluidos.push(b.idx);
  if (b.idx >= S.liberado) S.liberado = Math.min(NIVEIS.length - 1, b.idx + 1);
  S.perigo = Math.max(0, S.perigo - 1);
  salvar();
  som('vitoria');
  const ultima = b.idx === NIVEIS.length - 1;
  if (ultima) { mostrarFinal(); return; }
  const prox = NIVEIS[b.idx + 1];
  abrirOverlay(`
    <div class="painel" style="max-width:640px;text-align:center">
      <div style="font-size:54px;line-height:1">🌻🏆</div>
      <h1 class="titulo" style="font-size:clamp(24px,3.6vw,36px)">Território defendido!</h1>
      <p class="subtitulo">A trilha de <b>${b.nivel.nome}</b> está limpa. O jardim continua de pé para a próxima investida.</p>
      <div class="linha-topo" style="justify-content:center">
        <span class="chip moeda">+${ganho} moedas</span>
        <span class="chip">❤️ ${b.vidas} vidas restantes</span>
        <span class="chip">🌱 ${b.plantas.length} floralinas no jardim</span>
      </div>
      <div class="acoes">
        <button id="btnProxima">Ir para ${prox.nome} ${prox.emoji}</button>
        <button id="btnLojaV" class="secundario">🧬 Evoluir</button>
        <button id="btnMapaV" class="secundario">🗺 Mapa</button>
      </div>
    </div>
  `);
  document.getElementById('btnProxima').addEventListener('click', () => iniciarBatalha(b.idx + 1));
  document.getElementById('btnLojaV').addEventListener('click', mostrarLoja);
  document.getElementById('btnMapaV').addEventListener('click', mostrarMapa);
}

/* ---------------- Derrota / recuo ---------------- */
function mostrarDerrota(b) {
  const idx = b.idx;
  const eraFronteira = idx >= S.liberado;
  S.perigo += 1;
  if (eraFronteira) S.liberado = Math.max(0, idx - 1);
  salvar();
  const destino = Math.min(S.liberado, NIVEIS.length - 1);
  const nomeDestino = NIVEIS[destino].nome;
  abrirOverlay(`
    <div class="painel" style="max-width:640px;text-align:center">
      <div style="font-size:52px;line-height:1">🌫️🐕</div>
      <h1 class="titulo" style="font-size:clamp(24px,3.6vw,36px)">O território caiu…</h1>
      <p class="subtitulo">Um carneceiro atravessou a trilha. Agachuri Sal recuou${eraFronteira ? ' <b>uma fase</b>' : ''} — mas as floralinas que você plantou <b>continuam no jardim</b>.</p>
      <div class="linha-topo" style="justify-content:center">
        <span class="chip perigo">🔥 Perigo subiu para x${1 + S.perigo}</span>
        <span class="chip">🌱 Jardim preservado</span>
      </div>
      <div class="dica">Os inimigos voltam <b>${Math.round(S.perigo * 12)}% mais fortes</b>. Reorganize as floralinas e tente de novo.</div>
      <div class="acoes">
        <button id="btnRecuar">Recuar para ${nomeDestino}</button>
        <button id="btnLojaD" class="secundario">🧬 Evoluir</button>
        <button id="btnMapaD" class="secundario">🗺 Mapa</button>
      </div>
    </div>
  `);
  document.getElementById('btnRecuar').addEventListener('click', () => iniciarBatalha(destino));
  document.getElementById('btnLojaD').addEventListener('click', mostrarLoja);
  document.getElementById('btnMapaD').addEventListener('click', mostrarMapa);
}

/* ---------------- Final ---------------- */
function mostrarFinal() {
  S.tela = 'final';
  abrirOverlay(`
    <div class="painel final" style="max-width:720px">
      <div style="font-size:64px;line-height:1">🌋🐕🌻</div>
      <h1 class="titulo grande">A origem revelada</h1>
      <p class="subtitulo" style="font-size:15px;line-height:1.7;margin-top:14px">
        No fundo do vulcão, Agachuri Sal encontra o grande responsável: uma criatura de magma
        que se alimentava dos minérios e espalhava a doença pela lava. Com as floralinas,
        ele sela a cratera — e a ponte entre a cidade e a Grécia volta a ser só uma ponte.
      </p>
      <div class="linha-topo" style="justify-content:center">
        <span class="chip moeda">🪙 ${S.moedas} moedas</span>
        <span class="chip">🌱 ${S.concluidos.length}/8 fases</span>
        <span class="chip perigo">🔥 Perigo x${1 + S.perigo}</span>
      </div>
      <div class="acoes">
        <button id="btnFimMapa">Voltar ao mapa</button>
        <button id="btnFimMenu" class="secundario">Menu principal</button>
      </div>
    </div>
  `);
  document.getElementById('btnFimMapa').addEventListener('click', mostrarMapa);
  document.getElementById('btnFimMenu').addEventListener('click', mostrarMenu);
}

/* =========================================================
   BATALHA — criação e simulação
   ========================================================= */
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

function criarFila(nivel) {
  const fila = [];
  const n = nivel.ondas;
  for (let i = 0; i < n; i++) {
    const t = 10 + i * nivel.intervalo;
    let qtd = 1 + Math.floor(i * 0.9);
    if (i === n - 1) qtd += 2;
    qtd = Math.min(qtd, 6);
    for (let k = 0; k < qtd; k++) {
      const tipo = nivel.pool[Math.floor(Math.random() * nivel.pool.length)];
      const lane = Math.floor(Math.random() * GRID.rows);
      fila.push({ t: t + k * 0.9, tipo, lane });
    }
  }
  if (nivel.boss) fila.push({ t: nivel.bossT || 50, tipo: 'boss', lane: 2 });
  fila.sort((a, b) => a.t - b.t);
  return fila;
}

function criarPlanta(b, tipo, row, col) {
  const d = PLANTAS[tipo];
  const mult = multPlanta(tipo);
  const p = {
    tipo, row, col,
    x: cellX(col), y: cellY(row),
    vida: d.vida * mult, vidaMax: d.vida * mult, danoMult: mult,
    t: rnd(0, 6),
    timer: tipo === 'girassol' ? 3.5 : rnd(0.4, 1.4),
    carga: tipo === 'orquidea' ? 0.35 : tipo === 'solar' ? 0.2 : 0,
    ativa: false, descanso: 0, pronto: false, buff: false, flash: 0,
  };
  b.plantas.push(p);
  return p;
}

function spawnInimigo(b, tipo, lane) {
  const d = INIMIGOS[tipo];
  const esc = (1 + S.perigo * 0.12) * (b.nivel.forca || 1);
  const e = {
    tipo, lane,
    x: GRID.x + GRID.w + 42 + rnd(0, 26),
    y: cellY(lane),
    raio: d.raio,
    vida: d.vida * esc, vidaMax: d.vida * esc,
    vel: d.vel, dps: d.dps * esc,
    t: rnd(0, 10), stun: 0, hitT: 0,
    sujeiraT: rnd(3.5, 5),
    boss: !!d.boss, fase: 1, especialT: 6,
    atravessou: false,
  };
  if (e.boss) { e.x = GRID.x + GRID.w + 74; b.boss = e; }
  b.inimigos.push(e);
  return e;
}

function iniciarBatalha(idx) {
  idx = clamp(idx, 0, NIVEIS.length - 1);
  const nivel = NIVEIS[idx];
  const b = {
    idx, nivel, tempo: 0, energia: 150,
    plantas: [], inimigos: [], projeteis: [], drops: [], particulas: [], textos: [],
    avisos: [], raios: [], sujeira: [],
    cartas: nivel.plantas.slice(), recargas: {}, selecionada: null,
    fila: criarFila(nivel), spawnIdx: 0, dropTimer: 7,
    vidas: 3, latidoCD: 0, estado: 'jogando', fimTimer: 0,
    shake: 0, hover: null, boss: null, dica: 9, onda: null,
  };
  b.cartas.forEach(t => { b.recargas[t] = 0; });
  for (const p of (S.jardins[idx] || [])) {
    if (!PLANTAS[p.tipo]) continue;
    if (p.row < 0 || p.row >= GRID.rows || p.col < 0 || p.col >= GRID.cols) continue;
    if (b.plantas.some(q => q.row === p.row && q.col === p.col)) continue;
    criarPlanta(b, p.tipo, p.row, p.col);
  }
  B = b;
  S.tela = 'batalha';
  S.pausado = false;
  fecharOverlay();
}

function updateBatalha(dt) {
  const b = B;
  if (!b || b.estado !== 'jogando') return;
  b.tempo += dt;
  b.dica = Math.max(0, b.dica - dt);
  b.shake = Math.max(0, b.shake - dt * 2.2);
  b.latidoCD = Math.max(0, b.latidoCD - dt);
  if (b.onda) { b.onda.t += dt; if (b.onda.t > 0.6) b.onda = null; }

  for (const k in b.recargas) b.recargas[k] = Math.max(0, b.recargas[k] - dt);

  while (b.spawnIdx < b.fila.length && b.fila[b.spawnIdx].t <= b.tempo) {
    const s = b.fila[b.spawnIdx++];
    spawnInimigo(b, s.tipo, s.lane);
  }

  aplicarBuffs(b);
  atualizarPlantas(b, dt);
  atualizarInimigos(b, dt);
  atualizarProjeteis(b, dt);
  atualizarAvisos(b, dt);
  atualizarDrops(b, dt);
  atualizarParticulas(b, dt);

  for (const r of b.raios) r.t += dt;
  b.raios = b.raios.filter(r => r.t < 0.45);
  for (const s of b.sujeira) s.t -= dt;
  b.sujeira = b.sujeira.filter(s => s.t > 0);

  if (b.spawnIdx >= b.fila.length && b.inimigos.length === 0) {
    b.fimTimer += dt;
    if (b.fimTimer > 1.2) vencer(b);
  }
}

function aplicarBuffs(b) {
  for (const p of b.plantas) p.buff = false;
  for (const p of b.plantas) {
    if (p.tipo !== 'trevo') continue;
    for (const q of b.plantas) {
      if (q === p) continue;
      if (Math.abs(q.row - p.row) <= 1 && Math.abs(q.col - p.col) <= 1) q.buff = true;
    }
  }
}

function atualizarPlantas(b, dt) {
  for (const p of b.plantas) {
    if (p.flash > 0) p.flash = Math.max(0, p.flash - dt);
    const d = PLANTAS[p.tipo];
    if (d.tick) d.tick(b, p, dt);
    if (d.regen) p.vida = Math.min(p.vidaMax, p.vida + d.regen * dt);
  }
  const mortas = b.plantas.filter(p => p.vida <= 0);
  if (mortas.length) {
    for (const p of mortas) {
      particulas(b, p.x, p.y, '#6fbf5a', 10);
      b.textos.push({ x: p.x, y: p.y - 16, t: 0, vida: .9, txt: '✕', cor: '#ffb0a0', size: 16 });
    }
    b.plantas = b.plantas.filter(p => p.vida > 0);
    som('morte');
  }
}

function temInimigo(b, p) {
  return b.inimigos.some(e => e.vida > 0 && e.lane === p.row && e.x > p.x - 12);
}

function alvoPlanta(b, e) {
  let alvo = null;
  for (const p of b.plantas) {
    if (p.row !== e.lane) continue;
    const d = e.x - p.x;
    if (d > -16 && d < 58 + e.raio * 0.35) {
      if (!alvo || p.x > alvo.x) alvo = p;
    }
  }
  return alvo;
}

function atualizarInimigos(b, dt) {
  for (const e of b.inimigos) {
    if (e.vida <= 0) continue;
    e.t += dt;
    e.hitT = Math.max(0, e.hitT - dt);
    let slow = 1;
    for (const p of b.plantas) {
      if (p.tipo === 'orquidea' && p.ativa && p.row === e.lane && Math.abs(e.x - p.x) < 330) slow = 0.45;
    }
    if (e.stun > 0) { e.stun -= dt; slow = 0; }
    if (e.boss) atualizarBoss(b, e, dt);
    const alvo = alvoPlanta(b, e);
    if (alvo) {
      if (e.x < alvo.x + 46) e.x = alvo.x + 46;
      alvo.vida -= e.dps * dt;
      alvo.flash = 0.12;
      if (Math.random() < dt * 8) particulas(b, alvo.x + rnd(-10, 10), alvo.y - 8, '#ff7a3a', 1);
      if (alvo.tipo === 'espinhosa') e.vida -= 30 * alvo.danoMult * dt;
      if (INIMIGOS[e.tipo].marreta) {
        e.sujeiraT -= dt;
        if (e.sujeiraT <= 0) { e.sujeiraT = rnd(4.5, 6.5); sujar(b, e); }
      }
    } else {
      e.x -= e.vel * slow * dt;
    }
    if (e.x < GRID.x - 30) {
      e.vida = 0;
      e.atravessou = true;
      b.vidas--;
      b.shake = 0.9;
      particulas(b, GRID.x - 6, e.y, '#ff8a4a', 16);
      b.textos.push({ x: 122, y: e.y - 18, t: 0, vida: 1.1, txt: '-1 ❤️', cor: '#ff8070', size: 17 });
      som('dano');
      if (b.vidas <= 0) perder(b);
    }
  }
  for (const e of b.inimigos) {
    if (e.vida > 0 || e.atravessou) continue;
    particulas(b, e.x, e.y, '#ff8a3a', e.boss ? 44 : 12);
    if (e.boss) {
      b.shake = 1;
      b.boss = null;
      som('boss');
      b.textos.push({ x: e.x, y: e.y - 30, t: 0, vida: 1.6, txt: 'O responsável caiu!', cor: '#ffd76e', size: 20 });
    }
  }
  b.inimigos = b.inimigos.filter(e => e.vida > 0);
}

function atualizarBoss(b, e, dt) {
  e.especialT -= dt;
  if (e.especialT <= 0) {
    e.especialT = e.fase >= 2 ? 6.5 : 8.5;
    if (b.plantas.length) {
      const alvo = b.plantas[Math.floor(Math.random() * b.plantas.length)];
      b.avisos.push({ x: alvo.x, y: alvo.y, t: 1.1, max: 1.1 });
    }
  }
  const frac = e.vida / e.vidaMax;
  if (frac < 0.66 && e.fase === 1) {
    e.fase = 2; e.vel *= 1.3;
    invocar(b, e, 2);
    b.shake = .9; som('boss');
    b.textos.push({ x: e.x, y: e.y - 48, t: 0, vida: 1.4, txt: 'FÚRIA!', cor: '#ff6a4a', size: 20 });
  }
  if (frac < 0.33 && e.fase === 2) {
    e.fase = 3; e.vel *= 1.25; e.dps *= 1.25;
    invocar(b, e, 3);
    b.shake = 1; som('boss');
    b.textos.push({ x: e.x, y: e.y - 48, t: 0, vida: 1.4, txt: 'MAGMA TOTAL!', cor: '#ff4a2a', size: 22 });
  }
}

function invocar(b, e, n) {
  for (let i = 0; i < n; i++) {
    const lane = Math.floor(Math.random() * GRID.rows);
    const novo = spawnInimigo(b, 'rapido', lane);
    novo.x = e.x + rnd(8, 46);
    particulas(b, novo.x, novo.y, '#ff9a3a', 8);
  }
}

function atualizarAvisos(b, dt) {
  for (const a of b.avisos) a.t -= dt;
  const prontos = b.avisos.filter(a => a.t <= 0);
  for (const a of prontos) {
    particulas(b, a.x, a.y, '#ff6a2a', 26);
    b.shake = Math.max(b.shake, .55);
    som('acerto');
    for (const p of b.plantas) {
      if (dist(p.x, p.y, a.x, a.y) < 80) p.vida -= 90;
    }
  }
  b.avisos = b.avisos.filter(a => a.t > 0);
}

function atualizarProjeteis(b, dt) {
  for (const pr of b.projeteis) {
    pr.t = (pr.t || 0) + dt;
    pr.x += pr.vel * dt;
    for (const e of b.inimigos) {
      if (e.lane !== pr.row || e.vida <= 0) continue;
      if (Math.abs(e.x - pr.x) < e.raio + 10) {
        e.vida -= pr.dano;
        e.hitT = .12;
        pr.dead = true;
        particulas(b, pr.x, pr.y, '#ff6a5a', 5);
        som('acerto');
        break;
      }
    }
    if (pr.x > GRID.x + GRID.w + 60) pr.dead = true;
  }
  b.projeteis = b.projeteis.filter(p => !p.dead);
}

function atualizarDrops(b, dt) {
  for (const d of b.drops) {
    d.t += dt;
    if (d.y < d.ty) d.y = Math.min(d.ty, d.y + 110 * dt);
    else d.y = d.ty + Math.sin(d.t * 2.5) * 2;
    d.vida -= dt;
  }
  b.drops = b.drops.filter(d => d.vida > 0);
  b.dropTimer -= dt;
  if (b.dropTimer <= 0 && b.inimigos.length < 22) {
    b.dropTimer = rnd(6.5, 9);
    spawnDropCeu(b);
  }
}

function atualizarParticulas(b, dt) {
  for (const p of b.particulas) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.g * dt;
  }
  b.particulas = b.particulas.filter(p => p.t < p.vida);
  for (const t of b.textos) { t.t += dt; t.y -= 24 * dt; }
  b.textos = b.textos.filter(t => t.t < t.vida);
}

/* ---------------- Ações do jogador ---------------- */
function dropEnergia(b, x, y, valor) {
  b.drops.push({
    x: clamp(x, GRID.x + 16, GRID.x + GRID.w - 16),
    y,
    ty: clamp(y + 46, GRID.y + 44, GRID.y + GRID.h - 34),
    valor, t: 0, vida: 13,
  });
}

function spawnDropCeu(b) {
  const x = rnd(GRID.x + 30, GRID.x + GRID.w - 30);
  b.drops.push({
    x, y: GRID.y - 12,
    ty: rnd(GRID.y + 50, GRID.y + GRID.h - 40),
    valor: 30, t: 0, vida: 15,
  });
}

function coletarDrop(b, d) {
  b.energia += d.valor;
  d.vida = 0;
  particulas(b, d.x, d.y, '#ffe06a', 10);
  b.textos.push({ x: d.x, y: d.y - 14, t: 0, vida: .9, txt: '+' + d.valor, cor: '#ffe28a', size: 16 });
  som('coletar');
}

function dispararSolar(b, p) {
  som('solar');
  b.shake = Math.max(b.shake, .5);
  b.raios.push({ row: p.row, x: p.x, t: 0 });
  for (const e of b.inimigos) {
    if (e.lane !== p.row || e.x < p.x - 20) continue;
    e.vida -= 170 * p.danoMult;
    e.hitT = .2;
    particulas(b, e.x, e.y, '#ffd76e', 8);
  }
}

function latido(b) {
  if (b.latidoCD > 0) return;
  b.latidoCD = 12;
  b.shake = Math.max(b.shake, .5);
  b.onda = { x: 92, y: 470, t: 0 };
  som('latido');
  for (const e of b.inimigos) {
    if (e.x < GRID.x + 340) {
      e.vida -= 38;
      e.stun = 1.4;
      e.x -= 26;
      particulas(b, e.x, e.y, '#ffe28a', 8);
    }
  }
  for (const p of b.plantas) if (p.x < GRID.x + 100) p.vida = Math.min(p.vidaMax, p.vida + 20);
}

function sujar(b, e) {
  const opcoes = [];
  for (let c = 0; c < GRID.cols; c++) {
    if (Math.abs(cellX(c) - e.x) > 230) continue;
    if (b.plantas.some(p => p.row === e.lane && p.col === c)) continue;
    if (b.sujeira.some(s => s.row === e.lane && s.col === c)) continue;
    opcoes.push(c);
  }
  if (!opcoes.length) return;
  const c = opcoes[Math.floor(Math.random() * opcoes.length)];
  b.sujeira.push({ row: e.lane, col: c, t: 9, max: 9 });
  particulas(b, cellX(c), cellY(e.lane) + 16, '#7a4a2a', 8);
}

function tentarPlantar(b, row, col) {
  if (row < 0 || row >= GRID.rows || col < 0 || col >= GRID.cols) return;
  if (b.selecionada === 'shovel') {
    const p = b.plantas.find(q => q.row === row && q.col === col);
    if (p) {
      p.vida = 0;
      b.energia += Math.floor(PLANTAS[p.tipo].custo * 0.3);
      particulas(b, p.x, p.y, '#9adf7a', 9);
      b.textos.push({ x: p.x, y: p.y - 16, t: 0, vida: .8, txt: 'removida', cor: '#c8e8b8', size: 13 });
      som('coletar');
    } else {
      const antes = b.sujeira.length;
      b.sujeira = b.sujeira.filter(s => !(s.row === row && s.col === col));
      if (b.sujeira.length < antes) {
        particulas(b, cellX(col), cellY(row), '#c9b08a', 8);
        som('coletar');
      }
    }
    return;
  }
  const tipo = b.selecionada;
  if (!tipo) return;
  const d = PLANTAS[tipo];
  if (b.recargas[tipo] > 0) return;
  if (b.energia < d.custo) {
    b.textos.push({ x: cellX(col), y: cellY(row) - 14, t: 0, vida: 1, txt: 'Faltam raiozinhos!', cor: '#ff9a8a', size: 14 });
    som('erro');
    return;
  }
  if (b.plantas.some(p => p.row === row && p.col === col)) return;
  if (b.sujeira.some(s => s.row === row && s.col === col)) {
    b.textos.push({ x: cellX(col), y: cellY(row) - 14, t: 0, vida: 1, txt: 'Terreno sujo', cor: '#ffb08a', size: 14 });
    som('erro');
    return;
  }
  criarPlanta(b, tipo, row, col);
  b.energia -= d.custo;
  b.recargas[tipo] = d.recarga;
  som('plantar');
  particulas(b, cellX(col), cellY(row) + 22, '#8fce6a', 9);
}

function particulas(b, x, y, cor, n) {
  for (let i = 0; i < n; i++) {
    b.particulas.push({
      x, y,
      vx: rnd(-70, 70), vy: rnd(-110, -20),
      g: rnd(180, 320), t: 0, vida: rnd(.35, .8),
      r: rnd(1.6, 4), cor,
    });
  }
}

/* ---------------- Fim de batalha ---------------- */
function vencer(b) {
  if (b.estado !== 'jogando') return;
  b.estado = 'vitoria';
  salvarJardim(b);
  setTimeout(() => { if (B === b) mostrarVitoria(b); }, 800);
}

function perder(b) {
  if (b.estado !== 'jogando') return;
  b.estado = 'derrota';
  b.shake = 1;
  salvarJardim(b);
  setTimeout(() => { if (B === b) mostrarDerrota(b); }, 1000);
}

/* =========================================================
   DESENHO — cenário, plantas e inimigos
   ========================================================= */
function folha(x, y, rx, ry, rot, cor) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = cor;
  ctx.fill();
  ctx.restore();
}

function desenharFundo(b, t) {
  const tema = TEMAS[b.nivel.tema];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, tema.ceu[0]);
  g.addColorStop(1, tema.ceu[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (let r = 0; r < GRID.rows; r++) {
    ctx.fillStyle = r % 2 ? tema.chao : tema.chao2;
    ctx.fillRect(GRID.x, GRID.y + r * GRID.ch, GRID.w, GRID.ch);
  }

  desenharDetalhesTema(b, t, tema);
  desenharLaterais(b, t, tema);

  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= GRID.cols; c++) {
    const x = GRID.x + c * GRID.cw;
    ctx.beginPath(); ctx.moveTo(x, GRID.y); ctx.lineTo(x, GRID.y + GRID.h); ctx.stroke();
  }
  for (let r = 0; r <= GRID.rows; r++) {
    const y = GRID.y + r * GRID.ch;
    ctx.beginPath(); ctx.moveTo(GRID.x, y); ctx.lineTo(GRID.x + GRID.w, y); ctx.stroke();
  }

  const vg = ctx.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, 720);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function desenharDetalhesTema(b, t, tema) {
  const temaId = b.nivel.tema;
  ctx.save();
  if (temaId === 'ponte') {
    for (let r = 0; r < GRID.rows; r++) {
      const y = GRID.y + r * GRID.ch;
      ctx.strokeStyle = 'rgba(0,0,0,.18)';
      ctx.lineWidth = 2;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath(); ctx.moveTo(GRID.x, y + k * GRID.ch / 4); ctx.lineTo(GRID.x + GRID.w, y + k * GRID.ch / 4); ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(30,20,10,.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(GRID.x, GRID.y + 6); ctx.lineTo(GRID.x + GRID.w, GRID.y + 6);
    ctx.moveTo(GRID.x, GRID.y + GRID.h - 6); ctx.lineTo(GRID.x + GRID.w, GRID.y + GRID.h - 6);
    ctx.stroke();
  } else if (temaId === 'grecia' || temaId === 'templo') {
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 2;
    for (let r = 0; r < GRID.rows; r++) {
      for (let c = 0; c < GRID.cols; c += 2) {
        const x = GRID.x + c * GRID.cw + (r % 2 ? GRID.cw : 0);
        const y = GRID.y + r * GRID.ch + GRID.ch / 2;
        ctx.beginPath(); ctx.moveTo(x + 10, y); ctx.lineTo(x + GRID.cw - 12, y); ctx.stroke();
      }
    }
  } else if (temaId === 'neve') {
    for (let i = 0; i < 46; i++) {
      const x = GRID.x + ((i * 173 + t * 16) % GRID.w);
      const y = GRID.y + ((i * 97 + t * (22 + (i % 4) * 10)) % GRID.h);
      ctx.fillStyle = `rgba(255,255,255,${0.25 + (i % 5) * 0.11})`;
      ctx.beginPath(); ctx.arc(x, y, 1.4 + (i % 3) * 0.8, 0, Math.PI * 2); ctx.fill();
    }
  } else if (temaId === 'pantano') {
    for (let i = 0; i < 24; i++) {
      const x = GRID.x + ((i * 211) % GRID.w);
      const y = GRID.y + ((i * 137) % GRID.h);
      const r = 3 + Math.sin(t * 1.5 + i) * 2;
      ctx.strokeStyle = 'rgba(160,220,150,.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2); ctx.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const x = GRID.x + ((i * 157) % GRID.w);
      const y = GRID.y + ((i * 89) % GRID.h);
      ctx.strokeStyle = 'rgba(40,80,40,.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(t + i) * 3, y - 14); ctx.stroke();
    }
  } else if (temaId === 'rio') {
    ctx.lineWidth = 2;
    for (let r = 0; r < GRID.rows; r++) {
      const y = GRID.y + r * GRID.ch + GRID.ch / 2;
      ctx.strokeStyle = 'rgba(220,245,255,.3)';
      for (let k = 0; k < 3; k++) {
        const off = ((t * 40 + k * 90 + r * 30) % 180) - 90;
        ctx.beginPath();
        ctx.moveTo(GRID.x + 60 + off, y - 18 + k * 14);
        ctx.quadraticCurveTo(GRID.x + 100 + off, y - 26 + k * 14, GRID.x + 140 + off, y - 18 + k * 14);
        ctx.stroke();
      }
    }
  } else if (temaId === 'escadas') {
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    ctx.lineWidth = 3;
    for (let r = 0; r < GRID.rows; r++) {
      const y = GRID.y + r * GRID.ch + GRID.ch / 2;
      ctx.beginPath(); ctx.moveTo(GRID.x, y + 16); ctx.lineTo(GRID.x + GRID.w, y + 16); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.14)';
      ctx.beginPath(); ctx.moveTo(GRID.x, y + 20); ctx.lineTo(GRID.x + GRID.w, y + 20); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.22)';
    }
  } else if (temaId === 'vulcao') {
    for (let i = 0; i < 20; i++) {
      const x = GRID.x + ((i * 181 + t * 8) % GRID.w);
      const y = GRID.y + ((i * 113 + t * 5) % GRID.h);
      const pulso = 0.3 + 0.3 * Math.sin(t * 2 + i);
      ctx.strokeStyle = `rgba(255,90,30,${pulso})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 12, y + 8);
      ctx.lineTo(x + 6, y + 18);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function desenharLaterais(b, t, tema) {
  // lado esquerdo: cidade tecnológica
  ctx.fillStyle = 'rgba(7,11,18,.62)';
  ctx.fillRect(0, GRID.y, 140, GRID.h);
  for (let i = 0; i < 5; i++) {
    const bx = 8 + i * 26;
    const bh = 60 + ((i * 53) % 120);
    const by = GRID.y + GRID.h - bh;
    ctx.fillStyle = i % 2 ? '#152032' : '#1b2940';
    ctx.fillRect(bx, by, 21, bh);
    ctx.fillStyle = 'rgba(120,220,255,.5)';
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 3; k++) {
        if ((i + j + k) % 3 === 0) continue;
        ctx.fillRect(bx + 4 + k * 5, by + 8 + j * 11, 2.5, 4);
      }
    }
  }

  // lado direito: portal de magma
  ctx.fillStyle = 'rgba(8,5,7,.68)';
  ctx.fillRect(GRID.x + GRID.w, GRID.y, W - (GRID.x + GRID.w), GRID.h);
  const px = GRID.x + GRID.w + 26;
  const pulso = 0.55 + Math.sin(t * 2) * 0.2;
  const rg = ctx.createRadialGradient(px, GRID.y + GRID.h / 2, 4, px, GRID.y + GRID.h / 2, 90);
  rg.addColorStop(0, `rgba(255,120,40,${pulso})`);
  rg.addColorStop(1, 'rgba(255,60,20,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(GRID.x + GRID.w, GRID.y, W - (GRID.x + GRID.w), GRID.h);
  ctx.strokeStyle = 'rgba(255,130,60,.45)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(px, GRID.y + GRID.h / 2, 36, -1.2, 1.2);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const y = GRID.y + 40 + i * 80 + Math.sin(t + i) * 6;
    ctx.fillStyle = `rgba(255,110,40,${0.15 + 0.15 * Math.sin(t * 3 + i)})`;
    ctx.beginPath(); ctx.arc(px - 8 + (i % 3) * 14, y, 3 + (i % 3), 0, Math.PI * 2); ctx.fill();
  }
}

function desenharSujeira(b, t) {
  for (const s of b.sujeira) {
    const x = GRID.x + s.col * GRID.cw;
    const y = GRID.y + s.row * GRID.ch;
    ctx.save();
    ctx.fillStyle = 'rgba(46,28,18,.82)';
    rrect(x + 7, y + 8, GRID.cw - 14, GRID.ch - 16, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,120,50,.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 22, y + 26);
    ctx.lineTo(x + 40, y + 44);
    ctx.lineTo(x + 30, y + 64);
    ctx.stroke();
    const p = 1 - s.t / s.max;
    ctx.fillStyle = 'rgba(255,140,60,.16)';
    ctx.beginPath(); ctx.ellipse(x + GRID.cw / 2, y + GRID.ch / 2, 18 + p * 8, 8 + p * 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function desenharPlanta(p, t) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.beginPath(); ctx.ellipse(0, 26, 19, 6, 0, 0, Math.PI * 2); ctx.fill();
  desenharFormaPlanta(p.tipo, 1, t, p);
  if (p.flash > 0) {
    ctx.globalAlpha = p.flash * 2.2;
    circulo(0, 0, 24, '#fff');
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (p.vida < p.vidaMax - 0.5) {
    const w = 46, y = p.y - 34;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(p.x - w / 2, y, w, 5);
    const f = clamp(p.vida / p.vidaMax, 0, 1);
    ctx.fillStyle = f > .5 ? '#6fe08a' : f > .25 ? '#ffd35a' : '#ff6a4d';
    ctx.fillRect(p.x - w / 2, y, w * f, 5);
  }

  if (p.tipo === 'orquidea' || p.tipo === 'solar') {
    const w = 44, y = p.y + 30;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    rrect(p.x - w / 2, y, w, 5, 2.5); ctx.fill();
    const f = p.tipo === 'solar' ? (p.pronto ? 1 : p.carga) : p.carga;
    ctx.fillStyle = p.ativa || p.pronto ? '#8fe8ff' : '#5aa8d8';
    const largura = Math.max(2, w * clamp(f, 0, 1));
    rrect(p.x - w / 2, y, largura, 5, 2.5); ctx.fill();
  }
}

function desenharFormaPlanta(tipo, s, t, p) {
  ctx.save();
  ctx.scale(s, s);

  if (tipo === 'girassol') {
    ctx.strokeStyle = '#3f8f4a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 26); ctx.lineTo(0, 2); ctx.stroke();
    folha(-12, 16, 9, 4.5, -0.5, '#4aa354');
    folha(12, 13, 9, 4.5, 0.5, '#3f8f4a');
    for (let i = 0; i < 11; i++) {
      const a = i * Math.PI * 2 / 11 + Math.sin(t * 1.4) * 0.04;
      ctx.save(); ctx.rotate(a);
      ctx.fillStyle = i % 2 ? '#ffd23f' : '#ffc21f';
      ctx.beginPath(); ctx.ellipse(0, -16, 6.5, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    circulo(0, 0, 10.5, '#7a4a22');
    circulo(0, 0, 8, '#8a5a2a');
    circulo(-4, -1, 3, '#fff'); circulo(4, -1, 3, '#fff');
    circulo(-4, -1, 1.6, '#2b1a0f'); circulo(4, -1, 1.6, '#2b1a0f');
    ctx.strokeStyle = '#2b1a0f'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 2, 4, 0.2, Math.PI - 0.2); ctx.stroke();
  }

  else if (tipo === 'macieira') {
    ctx.fillStyle = '#6b4326';
    rrect(-4.5, 6, 9, 22, 3); ctx.fill();
    folha(0, -8, 17, 15, 0, '#3f8f45');
    folha(-11, 1, 11, 10, -0.3, '#4aa354');
    folha(11, 0, 10, 9, 0.3, '#357d3c');
    circulo(-8, -12, 4, '#e0443a');
    circulo(9, -4, 4, '#e0443a');
    circulo(2, 5, 3.5, '#e0443a');
    circulo(-5, -7, 2.6, '#fff'); circulo(5, -7, 2.6, '#fff');
    circulo(-5, -7, 1.3, '#2b1a0f'); circulo(5, -7, 1.3, '#2b1a0f');
  }

  else if (tipo === 'orquidea') {
    const ativa = p && p.ativa;
    ctx.strokeStyle = '#3f8a55'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 26); ctx.lineTo(0, 4); ctx.stroke();
    ctx.save();
    if (ativa) { ctx.shadowColor = '#c78cff'; ctx.shadowBlur = 14; }
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + Math.sin(t * 1.1) * 0.05;
      ctx.save(); ctx.rotate(a);
      ctx.fillStyle = ativa ? '#cf9cff' : '#b878e0';
      ctx.beginPath(); ctx.ellipse(0, -14, 5.5, 9.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    circulo(0, 0, 7, '#f3e6ff');
    circulo(0, 0, 3.5, '#ffd76e');
  }

  else if (tipo === 'samambaia') {
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i - 3.5) * 0.34 + Math.sin(t * 1.3 + i) * 0.03;
      ctx.save(); ctx.rotate(a);
      ctx.strokeStyle = i % 2 ? '#3f9147' : '#57ab5b';
      ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.quadraticCurveTo(4, -8, 2, -26); ctx.stroke();
      ctx.fillStyle = i % 2 ? '#4aa354' : '#63bd66';
      for (let j = 0; j < 4; j++) {
        const yy = -6 - j * 5;
        ctx.beginPath(); ctx.ellipse(-4, yy, 3.5, 2, 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(4, yy, 3.5, 2, -0.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    circulo(0, 16, 4, '#2f6b35');
  }

  else if (tipo === 'espinhosa') {
    ctx.fillStyle = '#315c2c';
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.16) * 15, Math.sin(a - 0.16) * 15);
      ctx.lineTo(Math.cos(a) * 29, Math.sin(a) * 29);
      ctx.lineTo(Math.cos(a + 0.16) * 15, Math.sin(a + 0.16) * 15);
      ctx.closePath(); ctx.fill();
    }
    circulo(0, 0, 16, '#3f7a37');
    circulo(0, 0, 11, '#4c8f42');
    circulo(-4, -3, 2.6, '#ffe14a'); circulo(4, -3, 2.6, '#ffe14a');
    circulo(-4, -3, 1.3, '#22300f'); circulo(4, -3, 1.3, '#22300f');
  }

  else if (tipo === 'trevo') {
    ctx.strokeStyle = '#3f8f4a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 26); ctx.lineTo(0, 4); ctx.stroke();
    const brilho = p && p.buff;
    ctx.save();
    if (brilho) { ctx.shadowColor = '#a8ff9a'; ctx.shadowBlur = 10; }
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate(Math.PI / 4 + i * Math.PI / 2);
      ctx.fillStyle = i % 2 ? '#59b45f' : '#4aa354';
      ctx.beginPath(); ctx.ellipse(0, -11, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    circulo(0, 0, 3, '#ffd76e');
  }

  else if (tipo === 'solar') {
    const pronto = p && (p.pronto || p.carga > 0.95);
    ctx.save();
    if (pronto) { ctx.shadowColor = '#ffb43e'; ctx.shadowBlur = 18; }
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI * 2 / 12 + t * 0.35;
      ctx.save(); ctx.rotate(a);
      ctx.fillStyle = i % 2 ? '#ffb43e' : '#ff8a2e';
      ctx.beginPath(); ctx.ellipse(0, -18, 4.5, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    circulo(0, 0, 11, '#ff7a1a');
    circulo(0, 0, 7.5, '#ffe06a');
    if (pronto) circulo(0, 0, 15, 'rgba(255,220,120,.22)');
    ctx.restore();
  }

  ctx.restore();
}

function desenharInimigo(e, t) {
  const d = INIMIGOS[e.tipo];
  const s = e.raio / 20;
  const bob = Math.sin(t * 7 + e.t * 3) * 1.8;
  ctx.save();
  ctx.translate(e.x, e.y + bob);

  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(0, 24 * s, 19 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();

  if (e.tipo === 'rapido') {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = `rgba(255,${120 + i * 40},40,${0.28 - i * 0.07})`;
      ctx.beginPath();
      ctx.moveTo(10 * s, -4 * s);
      ctx.lineTo((28 + i * 8) * s, (-2 + i * 3) * s);
      ctx.lineTo(12 * s, 10 * s);
      ctx.closePath(); ctx.fill();
    }
  }

  ctx.save();
  ctx.scale(s, s);

  ctx.fillStyle = '#2a0f0c';
  rrect(-11, 12, 7, 14, 3); ctx.fill();
  rrect(4, 12, 7, 14, 3); ctx.fill();

  const grad = ctx.createRadialGradient(-6, -10, 4, 0, 0, 27);
  grad.addColorStop(0, e.tipo === 'casca' ? '#9a6a3a' : '#b1542f');
  grad.addColorStop(.55, '#63241a');
  grad.addColorStop(1, '#2b0e0b');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.ellipse(0, 0, 20, 23, 0, 0, Math.PI * 2); ctx.fill();

  if (e.tipo === 'casca') {
    ctx.fillStyle = '#4a3428';
    for (const pl of [[-8, -8, 7, 6], [6, -12, 6, 5], [-2, 6, 8, 5], [9, 2, 5, 4]]) {
      ctx.beginPath(); ctx.ellipse(pl[0], pl[1], pl[2], pl[3], 0.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.save();
  ctx.strokeStyle = '#ff8a2b';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.shadowColor = '#ff5a10';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(-13, -8); ctx.lineTo(-5, -1); ctx.lineTo(-10, 7); ctx.lineTo(-3, 13);
  ctx.moveTo(2, -14); ctx.lineTo(7, -5); ctx.lineTo(4, 3);
  ctx.moveTo(12, 6); ctx.lineTo(6, 9);
  ctx.stroke();
  ctx.restore();

  if (e.boss) {
    circulo(-8, -8, 5, '#ffe14a');
    circulo(2, -11, 5, '#ffe14a');
    circulo(11, -6, 4, '#ffe14a');
    circulo(-8, -8, 2, '#3a0d05');
    circulo(2, -11, 2, '#3a0d05');
    circulo(11, -6, 1.8, '#3a0d05');
  } else {
    circulo(-6, -7, 4.2, '#ffe14a');
    circulo(6, -7, 4.2, '#ffe14a');
    circulo(-6, -6, 2, '#3a0d05');
    circulo(6, -6, 2, '#3a0d05');
  }

  ctx.strokeStyle = '#ffb04a';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 6, 6, 0.15, Math.PI - 0.15);
  ctx.stroke();

  if (e.boss) {
    ctx.fillStyle = '#ff7a2a';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 6 - 3, -20);
      ctx.lineTo(i * 6, -34 + i * i * 2);
      ctx.lineTo(i * 6 + 3, -20);
      ctx.closePath(); ctx.fill();
    }
  }

  if (d.marreta) {
    ctx.save();
    ctx.translate(16, 4);
    ctx.rotate(Math.sin(t * 4) * 0.15 - 0.4);
    ctx.fillStyle = '#6b4326';
    rrect(-2, -2, 4, 22, 2); ctx.fill();
    ctx.fillStyle = '#8a8f9a';
    rrect(-8, -12, 20, 13, 3); ctx.fill();
    ctx.fillStyle = '#b7bcc6';
    rrect(-8, -12, 20, 5, 2); ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  if (e.hitT > 0) {
    ctx.globalAlpha = Math.min(1, e.hitT * 3);
    circulo(0, 0, 22 * s, '#fff');
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (!e.boss) {
    const w = Math.max(34, e.raio * 2.2);
    const y = e.y - e.raio - 16 + bob;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(e.x - w / 2, y, w, 5);
    const f = clamp(e.vida / e.vidaMax, 0, 1);
    ctx.fillStyle = f > .5 ? '#6fe08a' : f > .25 ? '#ffd35a' : '#ff6a4d';
    ctx.fillRect(e.x - w / 2, y, w * f, 5);
  }
}

/* -------- Agachuri Sal -------- */
function desenharAgachuri(t, latidoCD) {
  const x = 68, y = 486;
  const respira = Math.sin(t * 2) * 1.5;
  ctx.save();
  ctx.translate(x, y + respira);

  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(0, 54, 26, 8, 0, 0, Math.PI * 2); ctx.fill();

  // rabo
  ctx.strokeStyle = '#7c858f'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(14, 22);
  ctx.quadraticCurveTo(38, 10 + Math.sin(t * 8) * 8, 40, -8 + Math.sin(t * 8) * 6);
  ctx.stroke();

  // corpo
  const grad = ctx.createLinearGradient(-20, -20, 20, 50);
  grad.addColorStop(0, '#aeb7c0');
  grad.addColorStop(1, '#6d7681');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.ellipse(0, 26, 24, 27, 0, 0, Math.PI * 2); ctx.fill();

  // patas
  ctx.fillStyle = '#5c646e';
  rrect(-16, 44, 12, 9, 4); ctx.fill();
  rrect(5, 44, 12, 9, 4); ctx.fill();

  // cabeça
  ctx.fillStyle = '#9aa3ad';
  circulo(0, -8, 22, '#9aa3ad');
  // orelhas
  ctx.fillStyle = '#7c858f';
  ctx.beginPath(); ctx.ellipse(-18, -20, 7, 13, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(18, -20, 7, 13, 0.5, 0, Math.PI * 2); ctx.fill();
  // focinho
  ctx.fillStyle = '#c3cbd3';
  ctx.beginPath(); ctx.ellipse(0, 2, 13, 10, 0, 0, Math.PI * 2); ctx.fill();
  circulo(0, -2, 4, '#2c333b');
  // olhos
  circulo(-8, -12, 3.6, '#20262d');
  circulo(8, -12, 3.6, '#20262d');
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  circulo(-7, -13, 1.2, '#fff');
  circulo(9, -13, 1.2, '#fff');
  // língua
  if (latidoCD > 0) {
    ctx.fillStyle = '#e88a9a';
    ctx.beginPath(); ctx.ellipse(0, 9, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  texto('Agachuri Sal', x, y + 74, 11, '#c9d5e3', 'center');
  if (latidoCD > 0) {
    texto('latido', x, y - 46, 10, '#ffd76e', 'center');
  } else {
    texto('latido!', x, y - 46 - Math.sin(t * 4) * 2, 10, '#ffd76e', 'center');
  }
}

/* =========================================================
   DESENHO — efeitos, HUD e cena de menu
   ========================================================= */
function desenharProjeteis(b, t) {
  for (const pr of b.projeteis) {
    if (pr.tipo === 'maca') {
      circulo(pr.x, pr.y, 7, '#d93b34');
      circulo(pr.x - 2, pr.y - 2, 2.2, 'rgba(255,255,255,.55)');
      ctx.fillStyle = '#4aa354';
      ctx.beginPath(); ctx.ellipse(pr.x + 2, pr.y - 7, 4, 2, -0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function desenharDrops(b, t) {
  for (const d of b.drops) {
    const pulso = 1 + Math.sin(d.t * 4) * 0.08;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.scale(pulso, pulso);
    ctx.strokeStyle = 'rgba(255,215,90,.75)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      ctx.save(); ctx.rotate(i * Math.PI / 4 + t * 0.6);
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -19); ctx.stroke();
      ctx.restore();
    }
    circulo(0, 0, 11, '#ffd24a');
    circulo(0, 0, 7.5, '#fff0a8');
    ctx.restore();
    if (d.vida < 4) {
      const a = 0.3 + 0.3 * Math.sin(t * 12);
      ctx.strokeStyle = `rgba(255,120,90,${a})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(d.x, d.y, 17, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

function desenharParticulas(b) {
  for (const p of b.particulas) {
    const a = 1 - p.t / p.vida;
    ctx.globalAlpha = Math.max(0, a);
    circulo(p.x, p.y, p.r * (0.5 + a * 0.6), p.cor);
  }
  ctx.globalAlpha = 1;
  for (const t of b.textos) {
    const a = 1 - t.t / t.vida;
    ctx.globalAlpha = Math.max(0, a);
    texto(t.txt, t.x, t.y, t.size || 14, t.cor || '#fff', 'center');
  }
  ctx.globalAlpha = 1;
}

function desenharAvisos(b, t) {
  for (const a of b.avisos) {
    const p = 1 - a.t / a.max;
    ctx.fillStyle = 'rgba(255,80,30,.1)';
    ctx.beginPath(); ctx.arc(a.x, a.y, 80, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,90,40,${0.55 + 0.45 * Math.sin(t * 22)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(a.x, a.y, 22 + p * 58, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(a.x - 10, a.y); ctx.lineTo(a.x + 10, a.y);
    ctx.moveTo(a.x, a.y - 10); ctx.lineTo(a.x, a.y + 10);
    ctx.stroke();
  }
}

function desenharRaios(b) {
  for (const r of b.raios) {
    const a = 1 - r.t / 0.45;
    const y = cellY(r.row);
    const g = ctx.createLinearGradient(r.x, 0, GRID.x + GRID.w, 0);
    g.addColorStop(0, `rgba(255,245,180,${a})`);
    g.addColorStop(.5, `rgba(255,180,60,${a * 0.7})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    const h = 30 * a + 6;
    ctx.fillRect(r.x, y - h / 2, GRID.x + GRID.w - r.x, h);
    ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`;
    ctx.fillRect(r.x, y - 2, GRID.x + GRID.w - r.x, 4);
  }
}

function desenharOnda(b) {
  if (!b.onda) return;
  const p = b.onda.t / 0.6;
  ctx.strokeStyle = `rgba(255,225,140,${1 - p})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(b.onda.x, b.onda.y, 26 + p * 280, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,180,90,${(1 - p) * 0.6})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(b.onda.x, b.onda.y, 10 + p * 220, 0, Math.PI * 2);
  ctx.stroke();
}

function desenharGhost(b, t) {
  if (!b.hover || !b.selecionada) return;
  const { row, col } = b.hover;
  const x = GRID.x + col * GRID.cw;
  const y = GRID.y + row * GRID.ch;
  if (b.selecionada === 'shovel') {
    ctx.fillStyle = 'rgba(255,210,120,.12)';
    rrect(x + 3, y + 3, GRID.cw - 6, GRID.ch - 6, 10); ctx.fill();
    return;
  }
  const ocupado = b.plantas.some(p => p.row === row && p.col === col);
  const sujo = b.sujeira.some(s => s.row === row && s.col === col);
  const ok = !ocupado && !sujo && b.energia >= PLANTAS[b.selecionada].custo && b.recargas[b.selecionada] <= 0;
  ctx.fillStyle = ok ? 'rgba(120,255,160,.12)' : 'rgba(255,90,70,.14)';
  rrect(x + 3, y + 3, GRID.cw - 6, GRID.ch - 6, 10); ctx.fill();
  ctx.strokeStyle = ok ? 'rgba(140,255,180,.5)' : 'rgba(255,110,90,.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = .55;
  ctx.translate(cellX(col), cellY(row));
  desenharFormaPlanta(b.selecionada, 1, t, null);
  ctx.restore();
}

function desenharSol(x, y, r, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#ffcf4a';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    ctx.save(); ctx.rotate(i * Math.PI / 4 + t * 0.4);
    ctx.beginPath(); ctx.moveTo(0, -r - 2); ctx.lineTo(0, -r - 7); ctx.stroke();
    ctx.restore();
  }
  circulo(0, 0, r, '#ffd24a');
  circulo(0, 0, r * 0.64, '#fff0a8');
  ctx.restore();
}

function cartaRect(i) {
  return { x: 148 + i * 80, y: 12, w: 72, h: 80 };
}

function desenharCarta(b, tipo, i, t) {
  const r = cartaRect(i);
  const d = PLANTAS[tipo];
  const sel = b.selecionada === tipo;
  const rec = b.recargas[tipo] || 0;
  const pode = b.energia >= d.custo && rec <= 0;

  rrect(r.x, r.y, r.w, r.h, 10);
  ctx.fillStyle = sel ? 'rgba(255,210,90,.2)' : 'rgba(255,255,255,.07)';
  ctx.fill();
  ctx.lineWidth = sel ? 2 : 1;
  ctx.strokeStyle = sel ? '#ffd76e' : 'rgba(255,255,255,.14)';
  ctx.stroke();

  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + 33);
  ctx.globalAlpha = pode ? 1 : .5;
  desenharFormaPlanta(tipo, 0.58, t, null);
  ctx.globalAlpha = 1;
  ctx.restore();

  circulo(r.x + 13, r.y + r.h - 14, 4, '#ffcf4a');
  texto(d.custo, r.x + 21, r.y + r.h - 14, 14, pode ? '#ffe28a' : '#ff9a8a');
  texto(String(i + 1), r.x + r.w - 9, r.y + r.h - 14, 10, 'rgba(255,255,255,.42)', 'right');

  if (rec > 0) {
    const f = clamp(rec / d.recarga, 0, 1);
    ctx.fillStyle = 'rgba(4,8,14,.72)';
    rrect(r.x, r.y, r.w, Math.max(6, r.h * f), 10); ctx.fill();
    texto(String(Math.ceil(rec)), r.x + r.w / 2, r.y + r.h / 2, 17, 'rgba(255,255,255,.75)', 'center');
  } else if (!pode) {
    ctx.fillStyle = 'rgba(4,8,14,.45)';
    rrect(r.x, r.y, r.w, r.h, 10); ctx.fill();
  }
}

function desenharCoracao(x, y, s, cheio) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(-11, -3, -8, -13, 0, -7);
  ctx.bezierCurveTo(8, -13, 11, -3, 0, 6);
  ctx.closePath();
  ctx.fillStyle = cheio ? '#ff5a6e' : 'rgba(255,255,255,.14)';
  ctx.fill();
  if (!cheio) {
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

function desenharBotaoHUD(r, icone) {
  rrect(r.x, r.y, r.w, r.h, 9);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
  texto(icone, r.x + r.w / 2, r.y + r.h / 2 + 1, 15, '#dbe6f5', 'center');
}

function desenharHUD(b, t) {
  ctx.fillStyle = 'rgba(9,13,21,.84)';
  ctx.fillRect(0, 0, W, 104);
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.fillRect(0, 104, W, 1);

  rrect(10, 12, 126, 80, 14);
  ctx.fillStyle = 'rgba(255,196,60,.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,196,60,.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  desenharSol(38, 42, 15, t);
  texto(String(Math.floor(b.energia)), 62, 38, 26, '#ffe28a');
  texto('RAIOZINHOS', 62, 62, 8.5, '#c9a94f');

  b.cartas.forEach((tipo, i) => desenharCarta(b, tipo, i, t));

  circulo(724, 30, 9, '#ffcf4a');
  circulo(724, 30, 6, '#ffe9a0');
  texto(String(S.moedas), 740, 30, 16, '#ffe28a');
  texto('PERIGO x' + (1 + S.perigo), 712, 58, 11, '#ffb3a0');
  texto('Fase ' + (b.idx + 1), 712, 80, 11, '#8fa2bb');

  desenharBotaoHUD({ x: 906, y: 12, w: 34, h: 34 }, S.mudo ? '🔇' : '🔊');
  desenharBotaoHUD({ x: 950, y: 12, w: 34, h: 34 }, '❚❚');

  /* barra inferior */
  ctx.fillStyle = 'rgba(9,13,21,.84)';
  ctx.fillRect(0, 584, W, 56);

  const lb = { x: 146, y: 590, w: 214, h: 44 };
  const pronto = b.latidoCD <= 0;
  rrect(lb.x, lb.y, lb.w, lb.h, 11);
  ctx.fillStyle = pronto ? 'rgba(255,210,90,.18)' : 'rgba(255,255,255,.05)';
  ctx.fill();
  ctx.strokeStyle = pronto ? 'rgba(255,210,90,.55)' : 'rgba(255,255,255,.12)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  texto(pronto ? '🐕 LATIDO' : '🐕 recarregando…', lb.x + 14, lb.y + 16, 13, pronto ? '#ffe28a' : '#8fa2bb');
  texto('Espaço', lb.x + 14, lb.y + 32, 10, 'rgba(255,255,255,.4)', 'left', false);
  if (!pronto) {
    const f = 1 - b.latidoCD / 12;
    ctx.fillStyle = 'rgba(255,210,90,.3)';
    rrect(lb.x, lb.y + lb.h - 6, lb.w * f, 6, 3); ctx.fill();
    texto(b.latidoCD.toFixed(1) + 's', lb.x + lb.w - 14, lb.y + 22, 12, '#c9d5e3', 'right');
  }

  const sb = { x: 372, y: 590, w: 44, h: 44 };
  rrect(sb.x, sb.y, sb.w, sb.h, 11);
  ctx.fillStyle = b.selecionada === 'shovel' ? 'rgba(255,210,90,.2)' : 'rgba(255,255,255,.06)';
  ctx.fill();
  ctx.strokeStyle = b.selecionada === 'shovel' ? 'rgba(255,210,90,.6)' : 'rgba(255,255,255,.12)';
  ctx.stroke();
  ctx.save();
  ctx.translate(sb.x + 22, sb.y + 22);
  ctx.rotate(-0.5);
  ctx.fillStyle = '#8a6a45';
  rrect(-2, -12, 4, 20, 2); ctx.fill();
  ctx.fillStyle = '#b7bcc6';
  ctx.beginPath();
  ctx.moveTo(-7, 6); ctx.lineTo(7, 6); ctx.lineTo(5, 15); ctx.lineTo(-5, 15);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  texto('Fase ' + (b.idx + 1) + ' · ' + b.nivel.nome, 432, 602, 14, '#e9eef7');
  texto('1-7 escolhem · Espaço late · ESC pausa · pá limpa terreno', 432, 622, 10.5, '#7f90a8', 'left', false);

  for (let i = 0; i < 3; i++) {
    desenharCoracao(828 + i * 30, 610, 1.15, i < b.vidas);
  }
}

function desenharBarraChefe(b) {
  const e = b.boss;
  if (!e) return;
  const x = 156, y = 116, w = 776, h = 9;
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  rrect(x - 2, y - 2, w + 4, h + 4, 6); ctx.fill();
  ctx.fillStyle = '#38120f';
  rrect(x, y, w, h, 4); ctx.fill();
  const f = clamp(e.vida / e.vidaMax, 0, 1);
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#ff8a2e');
  g.addColorStop(1, '#ff3a2a');
  ctx.fillStyle = g;
  rrect(x, y, Math.max(4, w * f), h, 4); ctx.fill();
  texto(
    '🌋 ' + INIMIGOS.boss.nome + ' — ' + (e.fase === 1 ? 'observando' : e.fase === 2 ? 'em fúria' : 'MAGMA TOTAL'),
    x, y + 24, 11, '#ffb3a0'
  );
}

function desenharDica(b) {
  if (b.dica <= 0) return;
  const a = Math.min(1, b.dica / 2);
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  rrect(W / 2 - 250, GRID.y + GRID.h - 46, 500, 30, 15); ctx.fill();
  texto('Clique numa carta e plante na grama · colete os raiozinhos ☀', W / 2, GRID.y + GRID.h - 31, 12.5, '#ffe9b0', 'center');
  ctx.globalAlpha = 1;
}

function desenharBatalha(b, t) {
  ctx.save();
  if (b.shake > 0.01) {
    const m = b.shake * 5;
    ctx.translate(rnd(-m, m), rnd(-m, m));
  }
  desenharFundo(b, t);
  desenharSujeira(b, t);
  const plantas = b.plantas.slice().sort((p, q) => p.row - q.row);
  for (const p of plantas) desenharPlanta(p, t);
  const inimigos = b.inimigos.slice().sort((p, q) => p.lane - q.lane);
  for (const e of inimigos) desenharInimigo(e, t);
  desenharProjeteis(b, t);
  desenharDrops(b, t);
  desenharAvisos(b, t);
  desenharRaios(b);
  desenharParticulas(b);
  desenharOnda(b);
  desenharGhost(b, t);
  ctx.restore();

  desenharAgachuri(t, b.latidoCD);
  desenharHUD(b, t);
  desenharBarraChefe(b);
  desenharDica(b);
}

/* ---------------- Cena de fundo (menu/mapa) ---------------- */
function desenharCena(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#070c16');
  g.addColorStop(.42, '#211a38');
  g.addColorStop(.76, '#4a2130');
  g.addColorStop(1, '#120a10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 90; i++) {
    const x = (i * 173.3) % W;
    const y = (i * 97.7) % 380;
    const a = 0.25 + 0.55 * Math.abs(Math.sin(t * 1.3 + i));
    ctx.fillStyle = `rgba(220,235,255,${a * 0.7})`;
    ctx.beginPath(); ctx.arc(x, y, i % 5 === 0 ? 1.6 : 1, 0, Math.PI * 2); ctx.fill();
  }

  ctx.save();
  ctx.shadowColor = 'rgba(255,220,170,.6)';
  ctx.shadowBlur = 44;
  circulo(148, 118, 34, '#ffe9c4');
  ctx.restore();

  // vulcão
  ctx.fillStyle = '#180c11';
  ctx.beginPath();
  ctx.moveTo(650, 500);
  ctx.lineTo(800, 196);
  ctx.lineTo(846, 232);
  ctx.lineTo(950, 500);
  ctx.closePath();
  ctx.fill();
  const lava = 0.5 + 0.35 * Math.sin(t * 1.7);
  ctx.fillStyle = `rgba(255,110,40,${lava})`;
  ctx.beginPath(); ctx.ellipse(816, 210, 20, 7, 0.16, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 5; i++) {
    const y = 180 - i * 26 - ((t * 12) % 26);
    const a = Math.max(0, 0.22 - i * 0.035);
    ctx.fillStyle = `rgba(90,70,80,${a})`;
    ctx.beginPath(); ctx.arc(816 + Math.sin(t + i) * 12, y, 18 + i * 7, 0, Math.PI * 2); ctx.fill();
  }

  // cidade tecnológica
  for (let i = 0; i < 9; i++) {
    const bx = 20 + i * 46;
    const bh = 90 + ((i * 61) % 150);
    const by = 500 - bh;
    ctx.fillStyle = i % 2 ? '#0d1624' : '#111d30';
    ctx.fillRect(bx, by, 38, bh);
    ctx.fillStyle = 'rgba(120,220,255,.5)';
    for (let j = 0; j < 6; j++) {
      for (let k = 0; k < 3; k++) {
        if ((i + j + k) % 4 === 0) continue;
        ctx.fillRect(bx + 6 + k * 9, by + 12 + j * 16, 4, 6);
      }
    }
  }

  // abismo e ponte
  ctx.fillStyle = '#08060c';
  ctx.fillRect(0, 500, W, 140);
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(300, 486, 420, 18);
  ctx.fillStyle = '#52331f';
  ctx.fillRect(300, 486, 420, 6);
  ctx.strokeStyle = 'rgba(0,0,0,.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const x = 312 + i * 50;
    ctx.beginPath(); ctx.moveTo(x, 504); ctx.lineTo(x, 520); ctx.stroke();
  }
  ctx.strokeStyle = '#5a4a3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(300, 470); ctx.quadraticCurveTo(510, 380, 720, 470);
  ctx.stroke();
  for (let i = 0; i <= 8; i++) {
    const x = 300 + i * 52.5;
    const y = 470 - Math.sin((i / 8) * Math.PI) * 62;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, 486); ctx.stroke();
  }

  // brasas
  for (let i = 0; i < 34; i++) {
    const x = (i * 211 + t * 18) % W;
    const y = H - ((i * 97 + t * (24 + (i % 5) * 10)) % H);
    const a = 0.2 + 0.4 * Math.abs(Math.sin(t * 2 + i));
    ctx.fillStyle = `rgba(255,140,60,${a})`;
    ctx.beginPath(); ctx.arc(x, y, 1.6 + (i % 3), 0, Math.PI * 2); ctx.fill();
  }

  // Agachuri e uma floralina na ponte
  ctx.save();
  ctx.translate(520, 466);
  ctx.scale(.72, .72);
  desenharFormaPlanta('girassol', 1, t, null);
  ctx.restore();
  ctx.save();
  ctx.translate(430, 452);
  ctx.scale(.62, .62);
  // silhueta do cachorro
  ctx.fillStyle = 'rgba(10,10,16,.75)';
  ctx.beginPath(); ctx.ellipse(0, 30, 24, 26, 0, 0, Math.PI * 2); ctx.fill();
  circulo(0, -6, 21, 'rgba(10,10,16,.75)');
  ctx.beginPath(); ctx.ellipse(-16, -18, 7, 13, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(16, -18, 7, 13, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(10,10,16,.75)';
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(14, 26); ctx.quadraticCurveTo(38, 14, 40, -8 + Math.sin(t * 6) * 8); ctx.stroke();
  ctx.restore();
}

/* =========================================================
   ENTRADA / LOOP
   ========================================================= */
function pos(ev) {
  const r = cv.getBoundingClientRect();
  return {
    x: (ev.clientX - r.left) * W / r.width,
    y: (ev.clientY - r.top) * H / r.height,
  };
}

const BTN_PAUSA = { x: 950, y: 12, w: 34, h: 34 };
const BTN_MUDO = { x: 906, y: 12, w: 34, h: 34 };
const BTN_LATIDO = { x: 146, y: 590, w: 214, h: 44 };
const BTN_PA = { x: 372, y: 590, w: 44, h: 44 };

function tratarClique(p) {
  const b = B;
  if (!b || b.estado !== 'jogando' || S.pausado) return;

  if (dentro(p.x, p.y, BTN_PAUSA)) { pausar(); return; }
  if (dentro(p.x, p.y, BTN_MUDO)) { S.mudo = !S.mudo; salvar(); return; }
  if (dentro(p.x, p.y, BTN_LATIDO)) { latido(b); return; }
  if (dentro(p.x, p.y, BTN_PA)) {
    b.selecionada = b.selecionada === 'shovel' ? null : 'shovel';
    return;
  }

  for (let i = 0; i < b.cartas.length; i++) {
    if (dentro(p.x, p.y, cartaRect(i))) {
      const tipo = b.cartas[i];
      b.selecionada = b.selecionada === tipo ? null : tipo;
      return;
    }
  }

  let melhor = null, md = 30;
  for (const d of b.drops) {
    const dd = dist(p.x, p.y, d.x, d.y);
    if (dd < md) { md = dd; melhor = d; }
  }
  if (melhor) { coletarDrop(b, melhor); return; }

  if (p.x >= GRID.x && p.x < GRID.x + GRID.w && p.y >= GRID.y && p.y < GRID.y + GRID.h) {
    const col = Math.floor((p.x - GRID.x) / GRID.cw);
    const row = Math.floor((p.y - GRID.y) / GRID.ch);
    tentarPlantar(b, row, col);
  }
}

function atualizarHover(p) {
  const b = B;
  if (!b || S.pausado) return;
  if (p.x >= GRID.x && p.x < GRID.x + GRID.w && p.y >= GRID.y && p.y < GRID.y + GRID.h) {
    b.hover = {
      col: Math.floor((p.x - GRID.x) / GRID.cw),
      row: Math.floor((p.y - GRID.y) / GRID.ch),
    };
  } else {
    b.hover = null;
  }
}

cv.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  audio();
  if (S.tela !== 'batalha') return;
  tratarClique(pos(ev));
});
cv.addEventListener('pointermove', ev => {
  if (S.tela !== 'batalha') return;
  atualizarHover(pos(ev));
});
cv.addEventListener('pointerleave', () => { if (B) B.hover = null; });

window.addEventListener('keydown', ev => {
  if (S.tela !== 'batalha' || !B) return;
  if (ev.key === 'Escape') {
    ev.preventDefault();
    if (S.pausado) { S.pausado = false; fecharOverlay(); }
    else pausar();
    return;
  }
  if (S.pausado) return;
  if (ev.key === ' ') {
    ev.preventDefault();
    latido(B);
    return;
  }
  if (/^[1-7]$/.test(ev.key)) {
    const i = Number(ev.key) - 1;
    if (i < B.cartas.length) {
      const tipo = B.cartas[i];
      B.selecionada = B.selecionada === tipo ? null : tipo;
    }
  }
  if (ev.key === 'q' || ev.key === 'Q') {
    B.selecionada = B.selecionada === 'shovel' ? null : 'shovel';
  }
});

/* ---------------- Loop ---------------- */
let ultimoTs = 0;
function loop(ts) {
  const dt = Math.min(0.05, ultimoTs ? (ts - ultimoTs) / 1000 : 0);
  ultimoTs = ts;

  if (S.tela === 'batalha' && B && !S.pausado) updateBatalha(dt);

  const t = ts / 1000;
  ctx.clearRect(0, 0, W, H);
  if (S.tela === 'batalha' && B) desenharBatalha(B, t);
  else desenharCena(t);

  requestAnimationFrame(loop);
}

/* ---------------- Boot ---------------- */
mostrarMenu();
requestAnimationFrame(loop);
