const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#0b0e17');
  tg.setBackgroundColor('#0b0e17');
}

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const OWNER = 'paois';

// ===================== STATE =====================
const STORAGE_KEY = 'chekushki_life_v2';
const PROMO_KEY = 'chekushki_promos_v1';

function defaultState() {
  return {
    balance: 5000,
    level: 1,
    xp: 0,
    health: 100,
    energy: 100,
    stress: 0,
    hunger: 100,
    mood: 100,
    debt: 0,
    debtRate: 0,
    creditor: '',
    lastInterest: 0,
    lastDaily: '',
    lastWork: 0,
    job: '',
    gamesPlayed: 0,
    gamesWon: 0,
    totalEarned: 0,
    biggestWin: 0,
    firstGame: null,
    history: [],
    usedPromos: [],
    prefix: '',
    lastUpdate: Date.now()
  };
}

let state = loadState();
let currentGame = null;
let currentChoice = null;
let currentBet = 1000;
let rocketRunning = false;
let rocketMult = 1;
let rocketTimer = null;
let rocketCrashed = false;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch (_) {}
  return defaultState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadPromos() {
  try {
    return JSON.parse(localStorage.getItem(PROMO_KEY) || '{}');
  } catch (_) { return {}; }
}

function savePromos(p) {
  localStorage.setItem(PROMO_KEY, JSON.stringify(p));
}

// ===================== UTILS =====================
function fmt(n) {
  return Number(n).toLocaleString('ru-RU');
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function toast(msg, ms = 1800) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

function popBalance() {
  const el = $('#balancePill');
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  setTimeout(() => el.classList.remove('pop'), 300);
}

function confetti() {
  const fx = $('#fx');
  const colors = ['#6c5ce7', '#00a8ff', '#00d68f', '#ff9f43', '#ff5e7a', '#a29bfe'];
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('div');
    p.className = 'fx-piece';
    p.style.left = Math.random() * 100 + '%';
    p.style.top = '30%';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDelay = (Math.random() * 0.3) + 's';
    p.style.width = (6 + Math.random() * 8) + 'px';
    p.style.height = p.style.width;
    fx.appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }
}

function addHistory(text, amount) {
  state.history.unshift({ text, amount, time: Date.now() });
  if (state.history.length > 30) state.history.pop();
}

function changeBalance(amount, reason) {
  if (state.balance + amount < 0) return false;
  state.balance += amount;
  if (amount > 0) state.totalEarned += amount;
  if (amount > state.biggestWin) state.biggestWin = amount;
  addHistory(reason, amount);
  saveState();
  renderAll();
  popBalance();
  return true;
}

function addXp(n) {
  state.xp += n;
  let required = 100 + (state.level - 1) * 75;
  while (state.xp >= required) {
    state.xp -= required;
    state.level++;
    required = 100 + (state.level - 1) * 75;
    toast(`🎉 Уровень ${state.level}!`);
    confetti();
  }
  saveState();
}

function processInterest() {
  if (state.debt <= 0) return;
  const now = Date.now();
  const last = state.lastInterest || now;
  const hours = Math.floor((now - last) / 3600000);
  if (hours < 1) return;
  const interest = Math.floor(state.debt * (state.debtRate / 100) * hours);
  if (interest > 0) {
    state.debt += interest;
    state.lastInterest = now;
    saveState();
  }
}

function updateNeeds() {
  const now = Date.now();
  const elapsed = now - (state.lastUpdate || now);
  if (elapsed < 60000) {
    processInterest();
    return;
  }
  const minutes = Math.floor(elapsed / 60000);
  state.energy = clamp(state.energy - Math.min(10, Math.floor(minutes / 3)));
  state.hunger = clamp(state.hunger - Math.min(10, Math.floor(minutes / 2)));
  if (state.energy < 20) state.stress = clamp(state.stress + Math.min(10, Math.floor(minutes / 4)));
  if (state.hunger < 20) state.health = clamp(state.health - Math.min(5, Math.floor(minutes / 5)));
  state.lastUpdate = now;
  processInterest();
  saveState();
}

// ===================== RENDER =====================
function renderAll() {
  updateNeeds();
  $('#topBalance').textContent = fmt(state.balance);
  $('#statHealth').textContent = state.health;
  $('#statEnergy').textContent = state.energy;
  $('#statStress').textContent = state.stress;
  $('#statHunger').textContent = state.hunger;

  const required = 100 + (state.level - 1) * 75;
  const pct = Math.min(100, (state.xp / required) * 100);
  $('#levelFill').style.width = pct + '%';
  $('#levelText').textContent = `Ур. ${state.level}`;

  // Debt
  if (state.debt > 0) {
    $('#debtInfo').innerHTML = `💳 Долг: <b>${fmt(state.debt)}</b> (${state.debtRate}%/ч)`;
  } else {
    $('#debtInfo').textContent = 'Долгов нет ✅';
  }

  // Stats tab
  $('#sGames').textContent = state.gamesPlayed;
  $('#sWins').textContent = state.gamesWon;
  $('#sEarned').textContent = fmt(state.totalEarned);
  $('#sBiggest').textContent = fmt(state.biggestWin);
  $('#sFirst').textContent = state.firstGame
    ? new Date(state.firstGame).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  $('#sDebt').textContent = fmt(state.debt);
  $('#sLevel').textContent = state.level;
  $('#sXp').textContent = `${state.xp} / ${required}`;

  // History
  const hl = $('#historyList');
  hl.innerHTML = state.history.slice(0, 15).map(h => `
    <div class="history-item">
      <span>${h.text}</span>
      <span class="amt ${h.amount >= 0 ? 'pos' : 'neg'}">${h.amount >= 0 ? '+' : ''}${fmt(h.amount)}</span>
    </div>
  `).join('') || '<div class="history-item"><span>Пока пусто</span></div>';
}

function renderJobs() {
  const jobs = [
    { id: 'cleaner', icon: '🧹', name: 'Уборщик', min: 150, max: 300, energy: 10, cd: 60 },
    { id: 'loader', icon: '📦', name: 'Грузчик', min: 250, max: 500, energy: 15, cd: 120 },
    { id: 'barista', icon: '☕', name: 'Бариста', min: 300, max: 600, energy: 15, cd: 180 },
    { id: 'freelance', icon: '💻', name: 'Фриланс', min: 400, max: 900, energy: 20, cd: 240 },
    { id: 'taxi', icon: '🚕', name: 'Таксист', min: 500, max: 1200, energy: 25, cd: 300 },
    { id: 'trader', icon: '📈', name: 'Криптотрейдер', min: 2000, max: 5000, energy: 30, cd: 420 },
    { id: 'biz', icon: '👔', name: 'Бизнесмен', min: 5000, max: 15000, energy: 40, cd: 600 },
    { id: 'dev', icon: '🚀', name: 'Айтишник', min: 10000, max: 30000, energy: 50, cd: 900 }
  ];
  $('#jobList').innerHTML = jobs.map(j => `
    <button class="job-item" data-job="${j.id}">
      <div class="job-icon">${j.icon}</div>
      <div class="job-info">
        <b>${j.name}</b>
        <small>⚡${j.energy} · КД ${Math.floor(j.cd / 60)} мин</small>
      </div>
      <div class="job-pay">${fmt(j.min)}–${fmt(j.max)}</div>
    </button>
  `).join('');

  $$('.job-item').forEach(btn => {
    btn.onclick = () => doJob(jobs.find(j => j.id === btn.dataset.job));
  });
}

// ===================== ACTIONS =====================
function doAction(type) {
  if (type === 'rest') {
    state.energy = clamp(state.energy + 25);
    state.stress = clamp(state.stress - 15);
    toast('😴 Отдых: +25 энергии, −15 стресса');
  } else if (type === 'eat') {
    if (state.balance < 100) return toast('Нужно 100 чекушек');
    changeBalance(-100, 'Еда');
    state.hunger = clamp(state.hunger + 40);
    toast('🍗 Сытость +40');
  } else if (type === 'meditate') {
    state.stress = clamp(state.stress - 40);
    toast('🧘 Стресс −40');
  } else if (type === 'shower') {
    state.mood = clamp(state.mood + 20);
    state.stress = clamp(state.stress - 10);
    toast('🚿 Настроение +20, стресс −10');
  }
  saveState();
  renderAll();
}

function doJob(job) {
  if (state.energy < job.energy) return toast(`Нужно ${job.energy} энергии`);
  const now = Date.now() / 1000;
  if (now - (state.lastWork || 0) < job.cd) {
    const left = Math.ceil(job.cd - (now - state.lastWork));
    return toast(`Отдохни ещё ${Math.floor(left / 60)}м ${left % 60}с`);
  }
  const reward = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;
  state.energy = clamp(state.energy - job.energy);
  state.stress = clamp(state.stress + Math.floor(Math.random() * 5) + 2);
  state.lastWork = now;
  changeBalance(reward, `Работа: ${job.name}`);
  addXp(Math.floor(Math.random() * 16) + 10);
  toast(`${job.icon} +${fmt(reward)} чекушек`);
  confetti();
}

// ===================== DAILY & PROMO =====================
function claimDaily() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastDaily === today) return toast('Уже получено сегодня');
  const reward = Math.floor(Math.random() * 2001) + 1000;
  state.lastDaily = today;
  changeBalance(reward, 'Ежедневка');
  addXp(20);
  toast(`🎁 +${fmt(reward)} чекушек`);
  confetti();
}

function openPromoModal() {
  showModal('Промокод', `
    <input type="text" id="promoInput" class="input" placeholder="Введи код" style="margin-bottom:8px">
  `, [
    { text: 'Активировать', primary: true, action: () => {
      const code = ($('#promoInput')?.value || '').trim().toUpperCase();
      if (!code) return toast('Введи код');
      activatePromo(code);
      closeModal();
    }},
    { text: 'Отмена', action: closeModal }
  ]);
  setTimeout(() => $('#promoInput')?.focus(), 100);
}

function activatePromo(code) {
  const promos = loadPromos();
  const p = promos[code];
  if (!p) return toast('Промокод не найден');
  if (p.usesLeft <= 0) return toast('Промокод исчерпан');
  if (state.usedPromos.includes(code)) return toast('Уже использован');
  p.usesLeft--;
  state.usedPromos.push(code);
  savePromos(promos);
  changeBalance(p.reward, `Промо: ${code}`);
  toast(`🎟 +${fmt(p.reward)} чекушек!`);
  confetti();
}

// ===================== CREDITS =====================
const CREDITORS = {
  friend: { name: '🤝 Знакомый', rate: 0.4, max: 10000 },
  bank: { name: '🏦 Банк', rate: 0.8, max: 50000 },
  pawnshop: { name: '💍 Ломбард', rate: 1.0, max: 150000 },
  loan_shark: { name: '🦈 Ростовщик', rate: 1.5, max: 500000 }
};

function openCreditModal() {
  if (state.debt > 0) return toast('Сначала погаси текущий долг');
  const body = Object.entries(CREDITORS).map(([k, v]) => `
    <button class="job-item" data-cred="${k}" style="margin-bottom:6px">
      <div class="job-info"><b>${v.name}</b><small>${v.rate}%/ч · до ${fmt(v.max)}</small></div>
    </button>
  `).join('');
  showModal('Взять кредит', body + `<input type="number" id="creditAmount" class="input" placeholder="Сумма" style="margin-top:10px">`, [
    { text: 'Взять', primary: true, action: () => {
      const key = document.querySelector('[data-cred].active')?.dataset.cred ||
        document.querySelector('[data-cred]')?.dataset.cred;
      // re-bind selection
      let selected = null;
      $$('[data-cred]').forEach(b => {
        if (b.classList.contains('active')) selected = b.dataset.cred;
      });
      if (!selected) {
        // first click sets active
        return;
      }
      const amount = parseInt($('#creditAmount')?.value || '0', 10);
      takeCredit(selected, amount);
      closeModal();
    }},
    { text: 'Отмена', action: closeModal }
  ]);
  setTimeout(() => {
    $$('[data-cred]').forEach(btn => {
      btn.onclick = () => {
        $$('[data-cred]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });
    // Override take button
    const actions = $('#modalActions');
    actions.innerHTML = '';
    const takeBtn = document.createElement('button');
    takeBtn.className = 'btn';
    takeBtn.textContent = 'Взять';
    takeBtn.onclick = () => {
      let selected = null;
      $$('[data-cred]').forEach(b => { if (b.classList.contains('active')) selected = b.dataset.cred; });
      if (!selected) return toast('Выбери кредитора');
      const amount = parseInt($('#creditAmount')?.value || '0', 10);
      if (!amount || amount <= 0) return toast('Введи сумму');
      takeCredit(selected, amount);
      closeModal();
    };
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn secondary';
    cancelBtn.textContent = 'Отмена';
    cancelBtn.onclick = closeModal;
    actions.append(takeBtn, cancelBtn);
  }, 50);
}

function takeCredit(key, amount) {
  const info = CREDITORS[key];
  if (!info) return;
  if (amount > info.max) return toast(`Макс. ${fmt(info.max)}`);
  if (key === 'friend' && Math.random() < 0.2) return toast('🤝 Знакомый отказал...');
  state.debt = amount;
  state.debtRate = info.rate;
  state.creditor = key;
  state.lastInterest = Date.now();
  changeBalance(amount, `Кредит: ${info.name}`);
  toast(`💳 +${fmt(amount)} (${info.rate}%/ч)`);
}

function repayCredit() {
  if (state.debt <= 0) return toast('Долгов нет');
  processInterest();
  if (state.balance < state.debt) return toast(`Нужно ${fmt(state.debt)}`);
  const d = state.debt;
  changeBalance(-d, 'Погашение долга');
  state.debt = 0;
  state.debtRate = 0;
  state.creditor = '';
  saveState();
  renderAll();
  toast('✅ Долг погашен!');
}

// ===================== GAMES =====================
const GAME_META = {
  coin: { title: '🪙 Монетка', needChoice: true },
  dice: { title: '🎲 Кубик', needChoice: true },
  number: { title: '🔢 Угадай число', needChoice: true },
  slots: { title: '🎰 Слоты', needChoice: false },
  bj: { title: '🃏 Блэкджек', needChoice: false },
  roulette: { title: '💎 Рулетка', needChoice: true },
  rocket: { title: '🚀 Ракета', needChoice: false },
  plinko: { title: '🔮 Плинко', needChoice: false }
};

// Blackjack state
let bjPlayer = [];
let bjDealer = [];
let bjDeck = [];
let bjActive = false;
let bjBet = 0;

// Plinko state
let plinkoRunning = false;

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardValue(c) {
  if (['J', 'Q', 'K'].includes(c.rank)) return 10;
  if (c.rank === 'A') return 11;
  return parseInt(c.rank, 10);
}

function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function cardHTML(c, hidden = false) {
  if (hidden) return `<div class="playing-card face-down"><span>?</span></div>`;
  const red = (c.suit === '♥' || c.suit === '♦') ? ' red' : '';
  return `<div class="playing-card${red}"><span class="cr">${c.rank}</span><span class="cs">${c.suit}</span></div>`;
}

function openGame(id) {
  currentGame = id;
  currentChoice = null;
  rocketRunning = false;
  plinkoRunning = false;
  bjActive = false;
  clearInterval(rocketTimer);
  $('#gamesGrid').classList.add('hidden');
  $('#gameScreen').classList.remove('hidden');
  $('#gameTitle').textContent = GAME_META[id].title;
  $('#gameVisual').innerHTML = '—';
  $('#gameVisual').className = 'game-visual';
  $('#gameStatus').textContent = id === 'plinko'
    ? 'Укажи ставку за 1 шар и нажми Выпустить'
    : 'Выбери параметры и нажми Играть';
  $('#rocketMult').classList.add('hidden');
  $('#cashoutBtn').classList.add('hidden');
  $('#hitBtn').classList.add('hidden');
  $('#standBtn').classList.add('hidden');
  $('#playGameBtn').classList.remove('hidden');
  $('#playGameBtn').disabled = false;
  $('#playGameBtn').textContent = id === 'plinko' ? 'ВЫПУСТИТЬ ШАР' : 'ИГРАТЬ';

  const box = $('#choiceBox');
  box.innerHTML = '';
  if (id === 'coin') {
    box.innerHTML = `
      <button class="choice-btn" data-c="OREL">🦅 Орёл</button>
      <button class="choice-btn" data-c="RESHKA">🪙 Решка</button>
    `;
  } else if (id === 'dice') {
    for (let i = 1; i <= 6; i++) {
      box.innerHTML += `<button class="choice-btn" data-c="${i}">${i}</button>`;
    }
  } else if (id === 'number') {
    for (let i = 1; i <= 10; i++) {
      box.innerHTML += `<button class="choice-btn" data-c="${i}">${i}</button>`;
    }
  } else if (id === 'roulette') {
    box.innerHTML = `
      <button class="choice-btn" data-c="RED">🔴 Красное</button>
      <button class="choice-btn" data-c="BLACK">⬛ Чёрное</button>
    `;
  } else if (id === 'plinko') {
    box.innerHTML = `<div class="plinko-hint">Ставка = цена одного шара. Шар падает сквозь колышки — множитель зависит от слота, куда прилетит.</div>`;
  }
  $$('.choice-btn').forEach(b => {
    b.onclick = () => {
      $$('.choice-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      currentChoice = b.dataset.c;
    };
  });
}

function closeGame() {
  clearInterval(rocketTimer);
  rocketRunning = false;
  plinkoRunning = false;
  bjActive = false;
  currentGame = null;
  $('#gameScreen').classList.add('hidden');
  $('#gamesGrid').classList.remove('hidden');
  $('#hitBtn').classList.add('hidden');
  $('#standBtn').classList.add('hidden');
}

function getBet() {
  const custom = parseInt($('#customBet').value, 10);
  if (custom > 0) return custom;
  return currentBet;
}

function applyStress(bet) {
  // Только накапливает стресс; обморок проверяется ПОСЛЕ результата ставки
  let add = 3;
  if (bet >= 500000) add = 40;
  else if (bet >= 100000) add = 25;
  else if (bet >= 50000) add = 18;
  else if (bet >= 10000) add = 12;
  else if (bet >= 1000) add = 6;
  state.stress = clamp(state.stress + add);
  saveState();
}

function checkFaint(won) {
  // Обморок после завершения ставки: выигрыш → 15%, проигрыш → 10%
  if (state.stress < 100) return;
  if (Math.random() >= 0.55) return;
  const pct = won ? 0.15 : 0.10;
  const pen = Math.floor(state.balance * pct);
  if (pen <= 0) {
    state.stress = 50;
    state.health = 50;
    saveState();
    return;
  }
  changeBalance(-pen, 'Обморок / медпомощь');
  state.stress = 50;
  state.health = 50;
  toast(`🚑 Обморок! −${Math.round(pct * 100)}% баланса (${fmt(pen)}), больница`);
  saveState();
  renderAll();
}

function recordGame(won, profit) {
  if (!state.firstGame) state.firstGame = Date.now();
  state.gamesPlayed++;
  if (won) state.gamesWon++;
  if (profit > state.biggestWin) state.biggestWin = profit;
  saveState();
  renderAll();
  // Обморок только после того, как ставка уже сыграла
  checkFaint(won);
}

async function playCurrentGame() {
  if (rocketRunning || plinkoRunning) return;
  const bet = getBet();
  if (bet <= 0) return toast('Укажи ставку');
  if (state.balance < bet) return toast('Недостаточно чекушек');

  if (GAME_META[currentGame].needChoice && !currentChoice) {
    return toast('Сначала сделай выбор');
  }

  if (!changeBalance(-bet, `Ставка: ${GAME_META[currentGame].title}`)) return;
  applyStress(bet);

  const vis = $('#gameVisual');
  const status = $('#gameStatus');
  const wrap = $('.game-visual-wrap');

  if (currentGame === 'coin') {
    vis.innerHTML = `<div class="coin-stage"><div class="coin-3d flipping" id="coin3d">
      <div class="coin-face front">🦅</div>
      <div class="coin-face back">🪙</div>
    </div></div>`;
    vis.className = 'game-visual';
    status.textContent = 'Монетка крутится...';
    await wait(1400);
    const out = Math.random() < 0.5 ? 'OREL' : 'RESHKA';
    const coinEl = document.getElementById('coin3d');
    if (coinEl) {
      coinEl.classList.remove('flipping');
      coinEl.classList.add(out === 'OREL' ? 'show-heads' : 'show-tails');
    }
    const txt = out === 'OREL' ? '🦅 Орёл' : '🪙 Решка';
    if (out === currentChoice) {
      const win = bet * 2;
      changeBalance(win, 'Выигрыш: Монетка');
      recordGame(true, win);
      status.textContent = `🎉 Угадал! ${txt} · +${fmt(win)}`;
      wrap.classList.add('flash-win');
      confetti();
    } else {
      recordGame(false, 0);
      status.textContent = `😅 Не угадал. Выпало ${txt}`;
      wrap.classList.add('flash-lose');
    }
  }

  else if (currentGame === 'dice') {
    vis.innerHTML = `<div class="dice-stage"><div class="dice-3d rolling" id="dice3d">
      <div class="dice-face" data-side="1">⚀</div>
      <div class="dice-face" data-side="2">⚁</div>
      <div class="dice-face" data-side="3">⚂</div>
      <div class="dice-face" data-side="4">⚃</div>
      <div class="dice-face" data-side="5">⚄</div>
      <div class="dice-face" data-side="6">⚅</div>
    </div></div>`;
    vis.className = 'game-visual';
    status.textContent = 'Кубик летит...';
    await wait(1300);
    const result = 1 + Math.floor(Math.random() * 6);
    const diceEl = document.getElementById('dice3d');
    if (diceEl) {
      diceEl.classList.remove('rolling');
      diceEl.classList.add('show-' + result);
    }
    const faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    if (String(result) === String(currentChoice)) {
      const win = bet * 5;
      changeBalance(win, 'Выигрыш: Кубик');
      recordGame(true, win);
      status.textContent = `🎉 Выпало ${faces[result]} (${result})! x5 · +${fmt(win)}`;
      wrap.classList.add('flash-win');
      confetti();
    } else {
      recordGame(false, 0);
      status.textContent = `Выпало ${faces[result]} (${result}), ты выбрал ${currentChoice}`;
      wrap.classList.add('flash-lose');
    }
  }

  else if (currentGame === 'number') {
    vis.textContent = '🔢';
    vis.className = 'game-visual anim-bounce';
    status.textContent = 'Загадываем число...';
    await wait(800);
    const secret = 1 + Math.floor(Math.random() * 10);
    vis.className = 'game-visual';
    vis.textContent = secret;
    if (String(secret) === String(currentChoice)) {
      const win = bet * 8;
      changeBalance(win, 'Выигрыш: Число');
      recordGame(true, win);
      status.textContent = `🎉 Невероятно! x8 · +${fmt(win)}`;
      wrap.classList.add('flash-win');
      confetti();
    } else {
      recordGame(false, 0);
      status.textContent = `Загадали ${secret}, ты выбрал ${currentChoice}`;
      wrap.classList.add('flash-lose');
    }
  }

  else if (currentGame === 'slots') {
    const symbols = ['🍒', '🍋', '🔔', '💎', '7️⃣'];
    vis.innerHTML = `<div class="slots-reels">
      <div class="slot-reel spinning" id="r0"><span>🍒</span></div>
      <div class="slot-reel spinning" id="r1"><span>🍋</span></div>
      <div class="slot-reel spinning" id="r2"><span>🔔</span></div>
    </div>`;
    vis.className = 'game-visual';
    status.textContent = 'Барабаны крутятся...';
    const final = [0,1,2].map(() => symbols[Math.floor(Math.random() * symbols.length)]);
    for (let step = 0; step < 12; step++) {
      for (let r = 0; r < 3; r++) {
        if (step < 8 + r * 2) {
          const el = document.getElementById('r' + r);
          if (el) el.innerHTML = `<span>${symbols[Math.floor(Math.random()*5)]}</span>`;
        }
      }
      await wait(90);
    }
    for (let r = 0; r < 3; r++) {
      const el = document.getElementById('r' + r);
      if (el) {
        el.classList.remove('spinning');
        el.innerHTML = `<span>${final[r]}</span>`;
      }
      await wait(120);
    }
    let mult = 0;
    if (final[0] === final[1] && final[1] === final[2]) {
      mult = final[0] === '7️⃣' ? 15 : final[0] === '💎' ? 10 : 5;
    } else if (final[0] === final[1] || final[1] === final[2] || final[0] === final[2]) {
      mult = 2;
    }
    if (mult > 0) {
      const win = bet * mult;
      changeBalance(win, 'Выигрыш: Слоты');
      recordGame(true, win);
      status.textContent = `🎉 x${mult} · +${fmt(win)}`;
      wrap.classList.add('flash-win');
      confetti();
    } else {
      recordGame(false, 0);
      status.textContent = 'Проигрыш';
      wrap.classList.add('flash-lose');
    }
  }

  else if (currentGame === 'bj') {
    startBlackjack(bet);
    return;
  }

  else if (currentGame === 'plinko') {
    startPlinko(bet);
    return;
  }

  else if (currentGame === 'roulette') {
    vis.innerHTML = `<div class="roulette-wheel spinning"><div class="roulette-ball"></div></div>`;
    vis.className = 'game-visual';
    status.textContent = 'Колесо крутится...';
    await wait(2000);
    const num = Math.floor(Math.random() * 37);
    const color = num === 0 ? 'ZERO' : (num % 2 === 0 ? 'BLACK' : 'RED');
    const colorTxt = num === 0 ? '🟢 Зеро' : color === 'RED' ? '🔴 Красное' : '⬛ Чёрное';
    vis.innerHTML = `<div style="font-size:48px;font-weight:800">${num}</div><div style="font-size:22px;margin-top:6px">${colorTxt}</div>`;
    if (color === currentChoice) {
      const win = bet * 2;
      changeBalance(win, 'Выигрыш: Рулетка');
      recordGame(true, win);
      status.textContent = `🎉 Угадал! +${fmt(win)}`;
      wrap.classList.add('flash-win');
      confetti();
    } else {
      recordGame(false, 0);
      status.textContent = `Выпало ${colorTxt}`;
      wrap.classList.add('flash-lose');
    }
  }

  else if (currentGame === 'rocket') {
    startRocket(bet);
    return;
  }

  setTimeout(() => wrap.classList.remove('flash-win', 'flash-lose'), 700);
}

function startRocket(bet) {
  rocketRunning = true;
  rocketCrashed = false;
  rocketMult = 1.0;
  $('#playGameBtn').classList.add('hidden');
  $('#cashoutBtn').classList.remove('hidden');
  $('#rocketMult').classList.remove('hidden');
  $('#gameVisual').textContent = '🚀';
  $('#gameVisual').className = 'game-visual anim-fly';
  $('#gameStatus').textContent = 'Летим! Забери вовремя';
  $('#rocketMult').textContent = 'x1.00';

  // Crash point (hidden)
  const crashAt = 1.1 + Math.random() * 4.5;

  rocketTimer = setInterval(() => {
    if (!rocketRunning) return;
    rocketMult = Math.round((rocketMult + 0.03 + rocketMult * 0.008) * 100) / 100;
    $('#rocketMult').textContent = 'x' + rocketMult.toFixed(2);

    if (rocketMult >= crashAt) {
      // CRASH
      clearInterval(rocketTimer);
      rocketRunning = false;
      rocketCrashed = true;
      $('#cashoutBtn').classList.add('hidden');
      $('#playGameBtn').classList.remove('hidden');
      $('#gameVisual').textContent = '💥';
      $('#gameVisual').className = 'game-visual anim-shake';
      $('#gameStatus').textContent = `Ракета взорвалась на x${rocketMult.toFixed(2)}! Ставка сгорела`;
      $('#rocketMult').classList.add('hidden');
      recordGame(false, 0);
      $('.game-visual-wrap').classList.add('flash-lose');
      setTimeout(() => $('.game-visual-wrap').classList.remove('flash-lose'), 600);
    }
  }, 80);
}

function cashoutRocket() {
  if (!rocketRunning || rocketCrashed) return;
  clearInterval(rocketTimer);
  rocketRunning = false;
  const bet = getBet();
  const win = Math.floor(bet * rocketMult);
  changeBalance(win, `Ракета x${rocketMult.toFixed(2)}`);
  recordGame(true, win);
  $('#cashoutBtn').classList.add('hidden');
  $('#playGameBtn').classList.remove('hidden');
  $('#gameVisual').textContent = '💰';
  $('#gameVisual').className = 'game-visual anim-glow';
  $('#gameStatus').textContent = `Забрано x${rocketMult.toFixed(2)} · +${fmt(win)}`;
  $('#rocketMult').classList.add('hidden');
  $('.game-visual-wrap').classList.add('flash-win');
  confetti();
  setTimeout(() => $('.game-visual-wrap').classList.remove('flash-win'), 700);
}

// ===================== BLACKJACK =====================
function renderBJ(hideDealer = true) {
  const pVal = handValue(bjPlayer);
  const dVal = hideDealer ? cardValue(bjDealer[0]) : handValue(bjDealer);
  const dealerCards = hideDealer
    ? cardHTML(bjDealer[0]) + cardHTML(null, true)
    : bjDealer.map(c => cardHTML(c)).join('');
  const playerCards = bjPlayer.map(c => cardHTML(c)).join('');
  $('#gameVisual').innerHTML = `
    <div class="bj-table">
      <div class="bj-hand">
        <div class="bj-label">Дилер ${hideDealer ? '' : '· ' + dVal}</div>
        <div class="bj-cards">${dealerCards}</div>
      </div>
      <div class="bj-hand">
        <div class="bj-label">Ты · ${pVal}</div>
        <div class="bj-cards">${playerCards}</div>
      </div>
    </div>`;
  $('#gameVisual').className = 'game-visual';
}

function startBlackjack(bet) {
  bjBet = bet;
  bjDeck = makeDeck();
  bjPlayer = [bjDeck.pop(), bjDeck.pop()];
  bjDealer = [bjDeck.pop(), bjDeck.pop()];
  bjActive = true;
  $('#playGameBtn').classList.add('hidden');
  renderBJ(true);

  const pVal = handValue(bjPlayer);
  const dVal = handValue(bjDealer);

  // Natural blackjack checks
  if (pVal === 21 && dVal === 21) {
    finishBJ('push');
    return;
  }
  if (pVal === 21) {
    finishBJ('blackjack');
    return;
  }
  if (dVal === 21) {
    finishBJ('lose');
    return;
  }

  $('#hitBtn').classList.remove('hidden');
  $('#standBtn').classList.remove('hidden');
  $('#gameStatus').textContent = 'Ещё карту или хватит?';
}

function bjHit() {
  if (!bjActive) return;
  bjPlayer.push(bjDeck.pop());
  renderBJ(true);
  const pVal = handValue(bjPlayer);
  if (pVal > 21) {
    finishBJ('bust');
  } else if (pVal === 21) {
    bjStand();
  } else {
    $('#gameStatus').textContent = `У тебя ${pVal}. Ещё или хватит?`;
  }
}

async function bjStand() {
  if (!bjActive) return;
  bjActive = false;
  $('#hitBtn').classList.add('hidden');
  $('#standBtn').classList.add('hidden');
  $('#gameStatus').textContent = 'Дилер берёт карты...';

  // Reveal dealer
  renderBJ(false);
  await wait(600);

  while (handValue(bjDealer) < 17) {
    bjDealer.push(bjDeck.pop());
    renderBJ(false);
    await wait(500);
  }

  const p = handValue(bjPlayer);
  const d = handValue(bjDealer);
  if (d > 21) finishBJ('dealer_bust');
  else if (p > d) finishBJ('win');
  else if (p === d) finishBJ('push');
  else finishBJ('lose');
}

function finishBJ(result) {
  bjActive = false;
  $('#hitBtn').classList.add('hidden');
  $('#standBtn').classList.add('hidden');
  $('#playGameBtn').classList.remove('hidden');
  renderBJ(false);

  const wrap = $('.game-visual-wrap');
  let winAmt = 0;
  let msg = '';

  if (result === 'blackjack') {
    winAmt = Math.floor(bjBet * 2.5);
    msg = '🎉 БЛЭКДЖЕК! x2.5';
  } else if (result === 'win' || result === 'dealer_bust') {
    winAmt = bjBet * 2;
    msg = result === 'dealer_bust' ? '✅ Дилер перебрал!' : '✅ Победа!';
  } else if (result === 'push') {
    winAmt = bjBet;
    msg = '🤝 Ничья — ставка возвращена';
  } else if (result === 'bust') {
    msg = '💥 Перебор!';
  } else {
    msg = '❌ Проигрыш';
  }

  if (winAmt > 0) {
    changeBalance(winAmt, 'Выигрыш: Блэкджек');
    recordGame(true, winAmt);
    wrap.classList.add('flash-win');
    if (winAmt > bjBet) confetti();
  } else {
    recordGame(false, 0);
    wrap.classList.add('flash-lose');
  }
  const net = winAmt - bjBet;
  $('#gameStatus').textContent = `${msg} · ${net >= 0 ? '+' : ''}${fmt(net)}`;
  setTimeout(() => wrap.classList.remove('flash-win', 'flash-lose'), 700);
}

// ===================== PLINKO =====================
const PLINKO_MULTS = [20, 5, 2, 1, 0.5, 0.2, 0.5, 1, 2, 5, 20];
const PLINKO_ROWS = 9;
const PLINKO_COLS = 11;

function startPlinko(bet) {
  if (plinkoRunning) return;
  plinkoRunning = true;
  $('#playGameBtn').disabled = true;
  $('#playGameBtn').textContent = 'Шарик летит...';

  const vis = $('#gameVisual');
  const status = $('#gameStatus');
  const wrap = $('.game-visual-wrap');

  // Build board HTML
  let pegsHTML = '';
  for (let r = 0; r < PLINKO_ROWS; r++) {
    const count = r % 2 === 0 ? 10 : 11;
    const offset = r % 2 === 0 ? ' offset' : '';
    pegsHTML += `<div class="plinko-row${offset}">`;
    for (let c = 0; c < count; c++) {
      pegsHTML += `<div class="plinko-peg"></div>`;
    }
    pegsHTML += `</div>`;
  }

  let slotsHTML = PLINKO_MULTS.map((m, i) => {
    const cls = m >= 10 ? 'hot' : m >= 2 ? 'warm' : m < 1 ? 'cold' : '';
    return `<div class="plinko-slot ${cls}" data-slot="${i}"><span>x${m}</span></div>`;
  }).join('');

  vis.innerHTML = `
    <div class="plinko-board" id="plinkoBoard">
      <div class="plinko-ball" id="plinkoBall"></div>
      <div class="plinko-pegs">${pegsHTML}</div>
      <div class="plinko-slots">${slotsHTML}</div>
    </div>`;
  vis.className = 'game-visual plinko-mode';
  status.textContent = 'Шар падает...';

  // Simulate path: at each row ball goes L or R with slight bias toward center
  const path = [];
  let pos = 5; // start roughly center (0..10 for 11 slots)
  for (let r = 0; r < PLINKO_ROWS; r++) {
    // bias: slight pull to center
    const bias = (5.5 - pos) * 0.08;
    const goRight = Math.random() < 0.5 + bias;
    if (goRight) pos = Math.min(10, pos + 0.5);
    else pos = Math.max(0, pos - 0.5);
    path.push(pos);
  }
  // Final slot (0..10)
  const finalSlot = Math.round(Math.max(0, Math.min(10, pos)));
  const mult = PLINKO_MULTS[finalSlot];

  // Animate ball
  const ball = document.getElementById('plinkoBall');
  const board = document.getElementById('plinkoBoard');
  if (!ball || !board) {
    plinkoRunning = false;
    $('#playGameBtn').disabled = false;
    $('#playGameBtn').textContent = 'ВЫПУСТИТЬ ШАР';
    return;
  }

  const boardW = board.clientWidth || 300;
  const boardH = board.clientHeight || 320;
  const slotW = boardW / 11;
  const startX = boardW / 2;
  const rowH = (boardH - 40) / (PLINKO_ROWS + 1);

  ball.style.left = startX + 'px';
  ball.style.top = '4px';
  ball.style.opacity = '1';

  let step = 0;
  const animate = () => {
    if (step > PLINKO_ROWS) {
      // Land in slot
      const landX = finalSlot * slotW + slotW / 2;
      ball.style.transition = 'all 0.25s ease-out';
      ball.style.left = landX + 'px';
      ball.style.top = (boardH - 28) + 'px';
      setTimeout(() => {
        // Highlight slot
        const slotEl = document.querySelector(`.plinko-slot[data-slot="${finalSlot}"]`);
        if (slotEl) slotEl.classList.add('landed');

        const win = Math.floor(bet * mult);
        if (win > 0) {
          changeBalance(win, `Плинко x${mult}`);
          recordGame(true, win);
          status.textContent = `🎯 Слот x${mult} · +${fmt(win)}`;
          wrap.classList.add('flash-win');
          if (mult >= 2) confetti();
        } else {
          recordGame(false, 0);
          status.textContent = `Слот x${mult} · шар сгорел`;
          wrap.classList.add('flash-lose');
        }
        setTimeout(() => wrap.classList.remove('flash-win', 'flash-lose'), 700);
        plinkoRunning = false;
        $('#playGameBtn').disabled = false;
        $('#playGameBtn').textContent = 'ВЫПУСТИТЬ ШАР';
      }, 280);
      return;
    }

    const t = path[step] / 10; // 0..1
    const x = t * boardW;
    const y = 8 + (step + 1) * rowH;
    ball.style.transition = 'all 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    ball.style.left = x + 'px';
    ball.style.top = y + 'px';
    // bounce scale
    ball.style.transform = 'translate(-50%, -50%) scale(1.15)';
    setTimeout(() => { if (ball) ball.style.transform = 'translate(-50%, -50%) scale(1)'; }, 90);
    step++;
    setTimeout(animate, 200);
  };

  // small delay then start
  setTimeout(animate, 150);
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ===================== MODAL =====================
function showModal(title, bodyHtml, actions) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  const act = $('#modalActions');
  act.innerHTML = '';
  (actions || []).forEach(a => {
    const b = document.createElement('button');
    b.className = 'btn' + (a.primary ? '' : ' secondary');
    b.textContent = a.text;
    b.onclick = a.action;
    act.appendChild(b);
  });
  $('#modal').classList.remove('hidden');
}

function closeModal() {
  $('#modal').classList.add('hidden');
}

// ===================== ADMIN =====================
function setupAdmin() {
  const user = tg?.initDataUnsafe?.user;
  const uname = (user?.username || '').toLowerCase();
  if (uname === OWNER.toLowerCase()) {
    $('#adminPanel').classList.remove('hidden');
  }
}

// ===================== PARTICLES =====================
function spawnParticles() {
  const box = $('#particles');
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (8 + Math.random() * 14) + 's';
    p.style.animationDelay = (Math.random() * 10) + 's';
    p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
    box.appendChild(p);
  }
}

// ===================== INIT =====================
function initUser() {
  const u = tg?.initDataUnsafe?.user;
  if (u) {
    $('#displayName').textContent = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Игрок';
    $('#displayUsername').textContent = u.username ? '@' + u.username : 'Telegram';
    $('#avatar').textContent = (u.first_name || '?')[0].toUpperCase();
  }
}

function bindUI() {
  // Tabs
  $$('.nav-item').forEach(btn => {
    btn.onclick = () => {
      $$('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.tab').forEach(t => t.classList.remove('active'));
      $(`#tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'games') closeGame();
    };
  });

  // Actions
  $$('.action-card').forEach(b => {
    b.onclick = () => doAction(b.dataset.action);
  });

  // Games
  $$('.game-card').forEach(b => {
    b.onclick = () => openGame(b.dataset.game);
  });
  $('#gameBack').onclick = closeGame;
  $('#playGameBtn').onclick = playCurrentGame;
  $('#cashoutBtn').onclick = cashoutRocket;
  $('#hitBtn').onclick = bjHit;
  $('#standBtn').onclick = bjStand;

  // Bet buttons
  $$('.bet-btn').forEach(b => {
    b.onclick = () => {
      $$('.bet-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      if (b.dataset.bet === 'all') {
        currentBet = state.balance;
        $('#customBet').value = state.balance;
      } else {
        currentBet = parseInt(b.dataset.bet, 10);
        $('#customBet').value = currentBet;
      }
    };
  });
  // default
  $$('.bet-btn')[1]?.classList.add('active');

  // Daily / Promo
  $('#dailyBtn').onclick = claimDaily;
  $('#promoBtn').onclick = openPromoModal;

  // Credit
  $('#takeCreditBtn').onclick = openCreditModal;
  $('#repayBtn').onclick = repayCredit;

  // Profile btn
  $('#profileBtn').onclick = () => {
    showModal('Профиль', `
      <div style="font-size:14px;line-height:1.7">
        💰 Баланс: <b>${fmt(state.balance)}</b><br>
        🏆 Уровень: <b>${state.level}</b><br>
        ❤️ ${state.health} · ⚡ ${state.energy} · 😰 ${state.stress} · 🍗 ${state.hunger}<br>
        💳 Долг: <b>${fmt(state.debt)}</b>
      </div>
    `, [{ text: 'Закрыть', action: closeModal }]);
  };

  // Admin
  $('#adminSetBalance').onclick = () => {
    const amount = parseInt($('#adminAmount').value, 10);
    if (isNaN(amount)) return toast('Введи сумму');
    state.balance = Math.max(0, state.balance + amount);
    addHistory('Админ: изменение баланса', amount);
    saveState();
    renderAll();
    toast(`Баланс изменён на ${amount >= 0 ? '+' : ''}${fmt(amount)}`);
  };

  $('#createPromoBtn').onclick = () => {
    const code = ($('#promoCodeNew').value || '').trim().toUpperCase();
    const reward = parseInt($('#promoReward').value, 10);
    const uses = parseInt($('#promoUses').value, 10);
    if (!code || !reward || !uses) return toast('Заполни все поля');
    const promos = loadPromos();
    promos[code] = { reward, usesLeft: uses };
    savePromos(promos);
    toast(`Промо ${code} создан (${uses} исп.)`);
    $('#promoCodeNew').value = '';
    $('#promoReward').value = '';
    $('#promoUses').value = '';
  };

  // Modal close on overlay
  $('#modal').onclick = e => {
    if (e.target === $('#modal')) closeModal();
  };
}

// Boot
initUser();
setupAdmin();
renderJobs();
renderAll();
bindUI();
spawnParticles();

// Soft tick for needs
setInterval(() => {
  updateNeeds();
  renderAll();
}, 60000);
