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
    debtPeriod: 3600000,
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
  // период начисления: мафия — 10 мин, остальные — 1 час
  const periodMs = state.debtPeriod || 3600000;
  const ticks = Math.floor((now - last) / periodMs);
  if (ticks < 1) return;
  // сложные проценты: debt *= (1 + rate/100)^ticks
  const rate = state.debtRate || 0;
  if (rate <= 0) {
    state.lastInterest = now;
    saveState();
    return;
  }
  let debt = state.debt;
  for (let i = 0; i < ticks; i++) {
    debt = Math.floor(debt * (1 + rate / 100));
  }
  if (debt > state.debt) {
    state.debt = debt;
    state.lastInterest = last + ticks * periodMs;
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
    const periodLabel = (state.debtPeriod && state.debtPeriod <= 600000)
      ? `${state.debtRate}% / 10 мин`
      : `${state.debtRate}%/ч`;
    const zero = state.debtRate <= 0 ? ' · без %' : '';
    $('#debtInfo').innerHTML = `💳 Долг: <b>${fmt(state.debt)}</b> (${periodLabel}${zero})`;
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
  friend: { name: '🤝 Знакомый', rate: 0.4, max: 10000, period: 3600000, periodLabel: '%/ч' },
  bank: { name: '🏦 Банк', rate: 0.8, max: 50000, period: 3600000, periodLabel: '%/ч' },
  pawnshop: { name: '💍 Ломбард', rate: 1.0, max: 150000, period: 3600000, periodLabel: '%/ч' },
  loan_shark: { name: '🦈 Ростовщик', rate: 1.5, max: 500000, period: 3600000, periodLabel: '%/ч' },
  mafia: { name: '🔫 Мафия', rate: 10, max: 2000000, period: 600000, periodLabel: '% / 10 мин' }
};

function openCreditModal() {
  if (state.debt > 0) return toast('Сначала погаси текущий долг (можно частично)');
  const body = Object.entries(CREDITORS).map(([k, v]) => `
    <button class="job-item" data-cred="${k}" style="margin-bottom:6px">
      <div class="job-info"><b>${v.name}</b><small>${v.rate}${v.periodLabel} · до ${fmt(v.max)}</small></div>
    </button>
  `).join('');
  showModal('Взять кредит', body + `<input type="number" id="creditAmount" class="input" placeholder="Сумма" style="margin-top:10px">`, [
    { text: 'Отмена', action: closeModal }
  ]);
  setTimeout(() => {
    $$('[data-cred]').forEach(btn => {
      btn.onclick = () => {
        $$('[data-cred]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });
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
  // Кредит на 1 — +100% ставка, чтобы не абьюзили «Всё или ничего»
  let rate = info.rate;
  if (amount === 1) rate = 100;
  state.debt = amount;
  state.debtRate = rate;
  state.debtPeriod = info.period;
  state.creditor = key;
  state.lastInterest = Date.now();
  changeBalance(amount, `Кредит: ${info.name}`);
  const pl = info.periodLabel || '%/ч';
  toast(`💳 +${fmt(amount)} (${rate}${pl})`);
}

function repayCredit() {
  if (state.debt <= 0) return toast('Долгов нет');
  processInterest();
  const debtNow = state.debt;
  showModal('Погасить долг', `
    <div style="font-size:14px;margin-bottom:10px">
      Текущий долг: <b>${fmt(debtNow)}</b><br>
      Баланс: <b>${fmt(state.balance)}</b><br>
      <small style="color:var(--muted)">Можно погасить частично — введи любую сумму</small>
    </div>
    <input type="number" id="repayAmount" class="input" placeholder="Сумма погашения" min="1" max="${debtNow}">
  `, [{ text: 'Отмена', action: closeModal }]);
  setTimeout(() => {
    const actions = $('#modalActions');
    actions.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = 'btn secondary';
    allBtn.textContent = 'Весь долг';
    allBtn.onclick = () => {
      $('#repayAmount').value = Math.min(state.balance, state.debt);
    };
    const payBtn = document.createElement('button');
    payBtn.className = 'btn';
    payBtn.textContent = 'Погасить';
    payBtn.onclick = () => {
      processInterest();
      let amount = parseInt($('#repayAmount')?.value || '0', 10);
      if (!amount || amount <= 0) return toast('Введи сумму');
      if (amount > state.debt) amount = state.debt;
      if (state.balance < amount) return toast(`Не хватает денег (нужно ${fmt(amount)})`);
      changeBalance(-amount, 'Погашение долга');
      state.debt -= amount;
      if (state.debt <= 0) {
        state.debt = 0;
        state.debtRate = 0;
        state.debtPeriod = 3600000;
        state.creditor = '';
        toast('✅ Долг полностью погашен!');
      } else {
        toast(`💸 Внесено ${fmt(amount)}. Остаток: ${fmt(state.debt)}`);
      }
      saveState();
      renderAll();
      closeModal();
    };
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn secondary';
    cancelBtn.textContent = 'Отмена';
    cancelBtn.onclick = closeModal;
    actions.append(allBtn, payBtn, cancelBtn);
  }, 50);
}

// ===================== GAMES =====================
const GAME_META = {
  coin: { title: '🪙 Монетка', needChoice: true, casino: 'classic' },
  dice: { title: '🎲 Кубик', needChoice: true, casino: 'classic' },
  number: { title: '🔢 Угадай число', needChoice: true, casino: 'classic' },
  slots: { title: '🎰 Слоты', needChoice: false, casino: 'classic' },
  bj: { title: '🃏 Блэкджек', needChoice: false, casino: 'classic' },
  roulette: { title: '💎 Рулетка', needChoice: true, casino: 'classic' },
  rocket: { title: '🚀 Ракета', needChoice: false, casino: 'arcade' },
  plinko: { title: '🔮 Плинко', needChoice: false, casino: 'arcade' },
  diamond: { title: '💠 Бриллиант', needChoice: false, casino: 'arcade' },
  allin: { title: '💀 Всё или ничего', needChoice: false, casino: 'extreme' }
};

const CASINO_META = {
  classic: { title: '🎰 Классика', bets: [100, 1000, 10000, 50000, 100000] },
  arcade: { title: '🔮 Аркада', bets: [1000, 10000, 50000, 100000, 500000] },
  extreme: { title: '💀 Экстрим', bets: [] }
};

const CASINO_GAMES = {
  classic: [
    { id: 'coin', icon: '🪙', name: 'Монетка', desc: 'Сторона · x2' },
    { id: 'dice', icon: '🎲', name: 'Кубик', desc: 'Число · x5' },
    { id: 'number', icon: '🔢', name: 'Угадай число', desc: '1–10 · x8' },
    { id: 'slots', icon: '🎰', name: 'Слоты', desc: 'Три символа' },
    { id: 'bj', icon: '🃏', name: 'Блэкджек', desc: 'Hit / Stand' },
    { id: 'roulette', icon: '💎', name: 'Рулетка', desc: 'Красное / Чёрное' }
  ],
  arcade: [
    { id: 'plinko', icon: '🔮', name: 'Плинко', desc: 'Несколько шаров' },
    { id: 'rocket', icon: '🚀', name: 'Ракета', desc: 'Crash · забери' },
    { id: 'diamond', icon: '💠', name: 'Бриллиант', desc: 'Найди все алмазы' }
  ],
  extreme: [
    { id: 'allin', icon: '💀', name: 'Всё или ничего', desc: '50/50 · 500x или долг 5 млрд' }
  ]
};

const DIAMOND_BOARDS = {
  35: { cells: 35, gems: 5, oneMult: 10, cols: 7 },
  100: { cells: 100, gems: 10, oneMult: 50, cols: 10 },
  250: { cells: 250, gems: 25, oneMult: 100, cols: 10 }
};

// Blackjack state
let bjPlayer = [];
let bjDealer = [];
let bjDeck = [];
let bjActive = false;
let bjBet = 0;

// Plinko state
let plinkoRunning = false;
let plinkoBallCount = 1;

// Diamond state
let diamondBoardSize = 35;
let diamondSelected = new Set();
let diamondGems = new Set();
let diamondRevealed = false;

let currentCasino = null;

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

function openCasino(id) {
  currentCasino = id;
  $('#casinoSelect').classList.add('hidden');
  $('#gamesListWrap').classList.remove('hidden');
  $('#gameScreen').classList.add('hidden');
  $('#casinoTitle').textContent = CASINO_META[id].title;
  const grid = $('#gamesGrid');
  grid.innerHTML = CASINO_GAMES[id].map(g => `
    <button class="game-card" data-game="${g.id}">
      <div class="gc-icon">${g.icon}</div>
      <b>${g.name}</b>
      <small>${g.desc}</small>
    </button>
  `).join('');
  $$('#gamesGrid .game-card').forEach(b => {
    b.onclick = () => openGame(b.dataset.game);
  });
}

function backToCasinos() {
  currentCasino = null;
  closeGame();
  $('#gamesListWrap').classList.add('hidden');
  $('#casinoSelect').classList.remove('hidden');
  $('#gameScreen').classList.add('hidden');
}

function setBetButtons(bets) {
  const box = $('#betControls');
  if (!bets || !bets.length) {
    $('#betBox').classList.add('hidden');
    return;
  }
  $('#betBox').classList.remove('hidden');
  box.innerHTML = bets.map(b => {
    const label = b >= 1000000 ? (b / 1000000) + 'M' : b >= 1000 ? (b / 1000) + 'k' : b;
    return `<button class="bet-btn" data-bet="${b}">${label}</button>`;
  }).join('') + `<button class="bet-btn" data-bet="all">Всё</button>`;
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
  if (bets[1]) {
    currentBet = bets[1];
    $('#customBet').value = currentBet;
    box.querySelectorAll('.bet-btn')[1]?.classList.add('active');
  }
}

function diamondMult(size, picks) {
  const cfg = DIAMOND_BOARDS[size];
  if (!cfg || picks < 1) return 0;
  // 1 клетка = oneMult, ~10 клеток на 35 → ~1x (oneMult / picks)
  const m = cfg.oneMult / picks;
  return Math.max(0.01, Math.round(m * 100) / 100);
}

function openGame(id) {
  currentGame = id;
  currentChoice = null;
  rocketRunning = false;
  plinkoRunning = false;
  bjActive = false;
  diamondSelected = new Set();
  diamondRevealed = false;
  clearInterval(rocketTimer);
  $('#gamesListWrap').classList.add('hidden');
  $('#gameScreen').classList.remove('hidden');
  $('#gameTitle').textContent = GAME_META[id].title;
  $('#gameVisual').innerHTML = '—';
  $('#gameVisual').className = 'game-visual';
  $('#rocketMult').classList.add('hidden');
  $('#cashoutBtn').classList.add('hidden');
  $('#hitBtn').classList.add('hidden');
  $('#standBtn').classList.add('hidden');
  $('#playGameBtn').classList.remove('hidden');
  $('#playGameBtn').disabled = false;
  $('#extraBetControls').classList.add('hidden');
  $('#extraBetControls').innerHTML = '';

  const casino = GAME_META[id].casino || currentCasino || 'classic';
  setBetButtons(CASINO_META[casino]?.bets || [100, 1000, 10000]);

  if (id === 'plinko') {
    $('#playGameBtn').textContent = 'ВЫПУСТИТЬ';
    $('#gameStatus').textContent = 'Ставка за 1 шар · можно несколько сразу';
    $('#betLabel').textContent = 'Ставка за один шар';
    $('#extraBetControls').classList.remove('hidden');
    $('#extraBetControls').innerHTML = `
      <label style="font-size:12px;color:var(--muted);display:block;margin:10px 0 6px">Количество шаров</label>
      <div class="bet-controls" id="ballCountBtns">
        <button class="bet-btn active" data-balls="1">1</button>
        <button class="bet-btn" data-balls="5">5</button>
        <button class="bet-btn" data-balls="10">10</button>
        <button class="bet-btn" data-balls="25">25</button>
        <button class="bet-btn" data-balls="50">50</button>
      </div>
      <input type="number" id="customBalls" class="input" placeholder="Своё число шаров" min="1" style="margin-top:8px">
    `;
    plinkoBallCount = 1;
    setTimeout(() => {
      $$('#ballCountBtns .bet-btn').forEach(b => {
        b.onclick = () => {
          $$('#ballCountBtns .bet-btn').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          plinkoBallCount = parseInt(b.dataset.balls, 10);
          $('#customBalls').value = plinkoBallCount;
        };
      });
    }, 30);
  } else if (id === 'diamond') {
    $('#playGameBtn').textContent = 'ОТКРЫТЬ';
    $('#gameStatus').textContent = 'Выбери размер поля и отметь клетки';
    $('#betLabel').textContent = 'Ставка';
    setupDiamondUI();
  } else if (id === 'allin') {
    $('#betBox').classList.add('hidden');
    $('#playGameBtn').textContent = 'ИГРАТЬ 50/50';
    $('#gameStatus').textContent = 'Либо 500x баланса, либо обнуление + долг 5 млрд без %';
    $('#gameVisual').innerHTML = `<div class="allin-preview">
      <div style="font-size:42px">💀</div>
      <div style="margin-top:8px;font-size:14px;color:var(--muted);line-height:1.5">
        50% → баланс × 500<br>
        50% → баланс = 500 + кредит 5 000 000 000 (0%)
      </div>
    </div>`;
  } else {
    $('#playGameBtn').textContent = 'ИГРАТЬ';
    $('#gameStatus').textContent = 'Выбери параметры и нажми Играть';
    $('#betLabel').textContent = 'Ставка (любая сумма)';
  }

  const box = $('#choiceBox');
  if (id !== 'diamond') box.innerHTML = '';
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
    box.innerHTML = `<div class="plinko-hint">Каждый шар — отдельная ставка. Итог считается по слоту, куда прилетел шар.</div>`;
  }
  $$('.choice-btn').forEach(b => {
    b.onclick = () => {
      $$('.choice-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      currentChoice = b.dataset.c;
    };
  });
}

function setupDiamondUI() {
  const box = $('#choiceBox');
  box.innerHTML = `
    <div class="diamond-size-row">
      <button class="choice-btn active" data-dsize="35">35 клеток · 5💎 · 1→x10</button>
      <button class="choice-btn" data-dsize="100">100 клеток · 10💎 · 1→x50</button>
      <button class="choice-btn" data-dsize="250">250 клеток · 25💎 · 1→x100</button>
    </div>
    <div class="plinko-hint" id="diamondHint">Выбери клетки. Чем больше — тем меньше x. Все выбранные должны быть с алмазами.</div>
  `;
  diamondBoardSize = 35;
  $$('[data-dsize]').forEach(b => {
    b.onclick = () => {
      $$('[data-dsize]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      diamondBoardSize = parseInt(b.dataset.dsize, 10);
      diamondSelected = new Set();
      diamondRevealed = false;
      renderDiamondBoard();
    };
  });
  renderDiamondBoard();
}

function renderDiamondBoard() {
  const cfg = DIAMOND_BOARDS[diamondBoardSize];
  const picks = diamondSelected.size;
  const mult = picks ? diamondMult(diamondBoardSize, picks) : cfg.oneMult;
  let cells = '';
  for (let i = 0; i < cfg.cells; i++) {
    const sel = diamondSelected.has(i) ? ' selected' : '';
    const rev = diamondRevealed ? (diamondGems.has(i) ? ' gem' : ' empty') : '';
    const mark = diamondRevealed
      ? (diamondGems.has(i) ? '💎' : '·')
      : (diamondSelected.has(i) ? '◆' : '');
    cells += `<button class="d-cell${sel}${rev}" data-di="${i}" ${diamondRevealed ? 'disabled' : ''}>${mark}</button>`;
  }
  $('#gameVisual').innerHTML = `
    <div class="diamond-board cols-${cfg.cols}" id="diamondBoard">${cells}</div>
    <div class="diamond-info">Выбрано: <b>${picks}</b> · Множитель: <b>x${mult}</b> · Алмазов на поле: ${cfg.gems}</div>
  `;
  $('#gameVisual').className = 'game-visual diamond-mode';
  if (!diamondRevealed) {
    $$('.d-cell').forEach(c => {
      c.onclick = () => {
        const i = parseInt(c.dataset.di, 10);
        if (diamondSelected.has(i)) diamondSelected.delete(i);
        else {
          if (diamondSelected.size >= cfg.gems) {
            return toast(`Макс. ${cfg.gems} клеток (столько алмазов на поле)`);
          }
          diamondSelected.add(i);
        }
        renderDiamondBoard();
      };
    });
  }
  $('#gameStatus').textContent = picks
    ? `Ставка × ${mult} если ВСЕ ${picks} клеток — алмазы`
    : 'Отметь клетки, затем Открыть';
}

function closeGame() {
  clearInterval(rocketTimer);
  rocketRunning = false;
  plinkoRunning = false;
  bjActive = false;
  currentGame = null;
  $('#gameScreen').classList.add('hidden');
  $('#hitBtn').classList.add('hidden');
  $('#standBtn').classList.add('hidden');
  if (currentCasino) {
    $('#gamesListWrap').classList.remove('hidden');
  } else {
    $('#casinoSelect').classList.remove('hidden');
  }
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

  // === ВСЁ ИЛИ НИЧЕГО (без обычной ставки) ===
  if (currentGame === 'allin') {
    playAllIn();
    return;
  }

  // === БРИЛЛИАНТ ===
  if (currentGame === 'diamond') {
    playDiamond();
    return;
  }

  let bet = getBet();
  if (bet <= 0) return toast('Укажи ставку');

  // Плинко: несколько шаров
  let balls = 1;
  if (currentGame === 'plinko') {
    const customB = parseInt($('#customBalls')?.value, 10);
    balls = customB > 0 ? customB : plinkoBallCount;
    if (balls < 1) balls = 1;
    plinkoBallCount = balls;
    const total = bet * balls;
    if (state.balance < total) return toast(`Нужно ${fmt(total)} (${balls} × ${fmt(bet)})`);
    if (!changeBalance(-total, `Плинко: ${balls} шар(ов)`)) return;
    applyStress(total);
    startPlinkoMulti(bet, balls);
    return;
  }

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

// ===================== PLINKO (multi-ball) =====================
const PLINKO_MULTS = [20, 5, 2, 1, 0.5, 0.2, 0.5, 1, 2, 5, 20];
const PLINKO_ROWS = 9;

function buildPlinkoPath() {
  const path = [];
  let pos = 5;
  for (let r = 0; r < PLINKO_ROWS; r++) {
    const bias = (5.5 - pos) * 0.08;
    const goRight = Math.random() < 0.5 + bias;
    if (goRight) pos = Math.min(10, pos + 0.5);
    else pos = Math.max(0, pos - 0.5);
    path.push(pos);
  }
  const finalSlot = Math.round(Math.max(0, Math.min(10, pos)));
  return { path, finalSlot, mult: PLINKO_MULTS[finalSlot] };
}

async function startPlinkoMulti(betPerBall, ballCount) {
  if (plinkoRunning) return;
  plinkoRunning = true;
  $('#playGameBtn').disabled = true;
  $('#playGameBtn').textContent = 'Шары летят...';

  const vis = $('#gameVisual');
  const status = $('#gameStatus');
  const wrap = $('.game-visual-wrap');

  let pegsHTML = '';
  for (let r = 0; r < PLINKO_ROWS; r++) {
    const count = r % 2 === 0 ? 10 : 11;
    const offset = r % 2 === 0 ? ' offset' : '';
    pegsHTML += `<div class="plinko-row${offset}">`;
    for (let c = 0; c < count; c++) pegsHTML += `<div class="plinko-peg"></div>`;
    pegsHTML += `</div>`;
  }
  const slotsHTML = PLINKO_MULTS.map((m, i) => {
    const cls = m >= 10 ? 'hot' : m >= 2 ? 'warm' : m < 1 ? 'cold' : '';
    return `<div class="plinko-slot ${cls}" data-slot="${i}"><span>x${m}</span></div>`;
  }).join('');

  vis.innerHTML = `
    <div class="plinko-board" id="plinkoBoard">
      <div class="plinko-pegs">${pegsHTML}</div>
      <div class="plinko-slots">${slotsHTML}</div>
    </div>
    <div id="plinkoResults" class="plinko-results"></div>`;
  vis.className = 'game-visual plinko-mode';

  const board = document.getElementById('plinkoBoard');
  const boardW = board?.clientWidth || 300;
  const boardH = board?.clientHeight || 320;
  const slotW = boardW / 11;
  const rowH = (boardH - 40) / (PLINKO_ROWS + 1);

  let totalWin = 0;
  let wins = 0;

  for (let b = 0; b < ballCount; b++) {
    status.textContent = `Шар ${b + 1} / ${ballCount}...`;
    const { path, finalSlot, mult } = buildPlinkoPath();

    const ball = document.createElement('div');
    ball.className = 'plinko-ball';
    ball.style.opacity = '1';
    ball.style.left = (boardW / 2) + 'px';
    ball.style.top = '4px';
    board.appendChild(ball);

    await new Promise(resolve => {
      let step = 0;
      const animate = () => {
        if (step > PLINKO_ROWS) {
          const landX = finalSlot * slotW + slotW / 2;
          ball.style.transition = 'all 0.2s ease-out';
          ball.style.left = landX + 'px';
          ball.style.top = (boardH - 28) + 'px';
          setTimeout(() => {
            const slotEl = document.querySelector(`.plinko-slot[data-slot="${finalSlot}"]`);
            if (slotEl) {
              slotEl.classList.add('landed');
              setTimeout(() => slotEl.classList.remove('landed'), 400);
            }
            const win = Math.floor(betPerBall * mult);
            totalWin += win;
            if (win > 0) wins++;
            const res = document.getElementById('plinkoResults');
            if (res) {
              res.innerHTML = `<span class="${win > betPerBall ? 'pos' : 'neg'}">#${b + 1}: x${mult} → ${win > 0 ? '+' : ''}${fmt(win)}</span>` +
                (res.innerHTML ? ' · ' + res.innerHTML : '');
            }
            ball.style.opacity = '0.35';
            resolve();
          }, 220);
          return;
        }
        const t = path[step] / 10;
        ball.style.transition = 'all 0.14s cubic-bezier(0.25,0.46,0.45,0.94)';
        ball.style.left = (t * boardW) + 'px';
        ball.style.top = (8 + (step + 1) * rowH) + 'px';
        ball.style.transform = 'translate(-50%,-50%) scale(1.12)';
        setTimeout(() => { ball.style.transform = 'translate(-50%,-50%) scale(1)'; }, 70);
        step++;
        setTimeout(animate, Math.max(90, 160 - Math.min(ballCount, 20) * 3));
      };
      setTimeout(animate, 80);
    });
  }

  if (totalWin > 0) {
    changeBalance(totalWin, `Плинко ${ballCount} шар(ов)`);
    recordGame(wins > 0, totalWin);
    status.textContent = `Итого ${ballCount} шаров · +${fmt(totalWin)}`;
    wrap.classList.add('flash-win');
    if (totalWin > betPerBall * ballCount) confetti();
  } else {
    recordGame(false, 0);
    status.textContent = `Итого ${ballCount} шаров · всё сгорело`;
    wrap.classList.add('flash-lose');
  }
  setTimeout(() => wrap.classList.remove('flash-win', 'flash-lose'), 700);
  plinkoRunning = false;
  $('#playGameBtn').disabled = false;
  $('#playGameBtn').textContent = 'ВЫПУСТИТЬ';
}

// ===================== DIAMOND =====================
function playDiamond() {
  if (diamondRevealed) {
    diamondRevealed = false;
    diamondSelected = new Set();
    renderDiamondBoard();
    $('#playGameBtn').textContent = 'ОТКРЫТЬ';
    return;
  }
  const picks = diamondSelected.size;
  if (picks < 1) return toast('Выбери хотя бы одну клетку');
  const cfg = DIAMOND_BOARDS[diamondBoardSize];
  if (picks > cfg.gems) return toast(`Максимум ${cfg.gems} клеток`);

  const bet = getBet();
  if (bet <= 0) return toast('Укажи ставку');
  if (state.balance < bet) return toast('Недостаточно чекушек');
  if (!changeBalance(-bet, 'Ставка: Бриллиант')) return;
  applyStress(bet);

  diamondGems = new Set();
  while (diamondGems.size < cfg.gems) {
    diamondGems.add(Math.floor(Math.random() * cfg.cells));
  }

  diamondRevealed = true;
  renderDiamondBoard();

  let allGems = true;
  for (const i of diamondSelected) {
    if (!diamondGems.has(i)) { allGems = false; break; }
  }

  const mult = diamondMult(diamondBoardSize, picks);
  const wrap = $('.game-visual-wrap');

  if (allGems) {
    const win = Math.floor(bet * mult);
    changeBalance(win, `Бриллиант x${mult}`);
    recordGame(true, win);
    $('#gameStatus').textContent = `💎 Все алмазы! x${mult} · +${fmt(win)}`;
    wrap.classList.add('flash-win');
    confetti();
  } else {
    recordGame(false, 0);
    $('#gameStatus').textContent = `Пустая клетка… проигрыш`;
    wrap.classList.add('flash-lose');
  }
  setTimeout(() => wrap.classList.remove('flash-win', 'flash-lose'), 700);
  $('#playGameBtn').textContent = 'ЕЩЁ РАЗ';
}

// ===================== ALL OR NOTHING =====================
function playAllIn() {
  if (state.balance < 500) return toast('Нужно минимум 500 чекушек');
  const bal = state.balance;
  applyStress(Math.min(bal, 1000000));

  const vis = $('#gameVisual');
  const status = $('#gameStatus');
  const wrap = $('.game-visual-wrap');
  $('#playGameBtn').disabled = true;
  status.textContent = 'Монетка судьбы...';
  vis.innerHTML = `<div class="allin-spin">🎲</div>`;

  setTimeout(() => {
    const win = Math.random() < 0.5;
    if (win) {
      const prize = bal * 500;
      const gain = prize - bal;
      state.balance = prize;
      if (gain > 0) state.totalEarned += gain;
      if (gain > state.biggestWin) state.biggestWin = gain;
      addHistory('Всё или ничего x500', gain);
      saveState();
      renderAll();
      popBalance();
      recordGame(true, prize);
      vis.innerHTML = `<div style="font-size:48px">🤑</div>`;
      status.textContent = `🎉 500x! Баланс: ${fmt(prize)}`;
      wrap.classList.add('flash-win');
      confetti();
    } else {
      const oldDebt = state.debt || 0;
      state.balance = 500;
      state.debt = oldDebt + 5000000000;
      state.debtRate = 0;
      state.debtPeriod = 3600000;
      state.creditor = 'allin';
      state.lastInterest = Date.now();
      addHistory('Всё или ничего: проигрыш', -(bal - 500));
      saveState();
      renderAll();
      popBalance();
      recordGame(false, 0);
      vis.innerHTML = `<div style="font-size:48px">💀</div>`;
      status.textContent = `Проигрыш. Баланс 500 · долг ${fmt(state.debt)} (0%)`;
      wrap.classList.add('flash-lose');
      toast('💀 Обнуление + кредит 5 млрд без %');
    }
    setTimeout(() => wrap.classList.remove('flash-win', 'flash-lose'), 800);
    $('#playGameBtn').disabled = false;
  }, 1200);
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
      if (btn.dataset.tab === 'games') {
        closeGame();
        $('#gameScreen').classList.add('hidden');
        $('#gamesListWrap').classList.add('hidden');
        $('#casinoSelect').classList.remove('hidden');
        currentCasino = null;
      }
    };
  });

  // Actions
  $$('.action-card').forEach(b => {
    b.onclick = () => doAction(b.dataset.action);
  });

  // Casinos
  $$('.casino-card').forEach(b => {
    b.onclick = () => openCasino(b.dataset.casino);
  });
  $('#casinoBack').onclick = backToCasinos;
  $('#gameBack').onclick = closeGame;
  $('#playGameBtn').onclick = playCurrentGame;
  $('#cashoutBtn').onclick = cashoutRocket;
  $('#hitBtn').onclick = bjHit;
  $('#standBtn').onclick = bjStand;

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
