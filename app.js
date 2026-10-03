const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const $ = s => document.querySelector(s);
const home = $("#home"), game = $("#game");
const visual = $("#gameVisual"), text = $("#gameText"), title = $("#gameTitle");
const playBtn = $("#playBtn");
let currentGame = null;
let score = Number(localStorage.getItem("chekushki_arcade_score") || 0);

function saveScore(){localStorage.setItem("chekushki_arcade_score",String(score));$("#score").textContent=score.toLocaleString("ru-RU")}
function addScore(n){score+=n;saveScore();toast((n>=0?"+":"")+n+" очков")}
function toast(t){const x=$("#toast");x.textContent=t;x.classList.add("show");setTimeout(()=>x.classList.remove("show"),1300)}
saveScore();

if(tg?.initDataUnsafe?.user){
  const u=tg.initDataUnsafe.user;
  $("#name").textContent=[u.first_name,u.last_name].filter(Boolean).join(" ")||"Игрок";
  $("#username").textContent=u.username?"@"+u.username:"Telegram";
  $("#avatar").textContent=(u.first_name||"?")[0].toUpperCase();
}

const games={
 dice:{title:"🎲 Кубик",start:"Нажми ИГРАТЬ — бросим кубик.",play(){
   visual.className="game-visual bounce"; visual.textContent="🎲"; text.textContent="Кубик летит...";
   setTimeout(()=>{let n=1+Math.floor(Math.random()*6);visual.className="game-visual";visual.textContent=["⚀","⚁","⚂","⚃","⚄","⚅"][n-1];text.textContent=`Выпало: ${n}`;addScore(n*10)},700)
 }},
 coin:{title:"🪙 Монетка",start:"Подбрось монетку и узнай сторону.",play(){
   visual.className="game-visual spin";visual.textContent="🪙";text.textContent="Подбрасываем...";
   setTimeout(()=>{let r=Math.random()<.5?"ОРЁЛ 🦅":"РЕШКА 🪙";visual.className="game-visual";visual.textContent="🪙";text.textContent=r;addScore(25)},750)
 }},
 plinko:{title:"🔵 Plinko",start:"Шарик падает через поле и ловит очки.",play(){
   visual.className="game-visual";visual.textContent="🔵";text.textContent="Падает...";
   let i=0; const timer=setInterval(()=>{visual.style.transform=`translate(${(Math.random()-.5)*90}px,${i*7}px)`;i++;if(i>8){clearInterval(timer);visual.style.transform="";let n=[10,20,30,50,100][Math.floor(Math.random()*5)];text.textContent=`Карман: +${n} очков`;addScore(n)}},100)
 }},
 rocket:{title:"🚀 Rocket",start:"Набери высоту. Здесь нет ставок — только рекорд.",play(){
   visual.className="game-visual";visual.textContent="🚀";let x=1.0;let stopped=false;text.textContent="Высота x1.00";
   playBtn.disabled=true;
   const timer=setInterval(()=>{x+=Math.random()*.35+.05;visual.style.transform=`translateY(${-Math.min(180,(x-1)*45)}px)`;text.textContent=`Высота x${x.toFixed(2)}`;if(x>2.5&&Math.random()<.25){clearInterval(timer);visual.style.transform="";text.textContent=`🚀 Рекорд: x${x.toFixed(2)} — +${Math.floor(x*20)} очков`;addScore(Math.floor(x*20));playBtn.disabled=false}},220)
 }},
 cards:{title:"🃏 Карты — 21",start:"Собери число как можно ближе к 21.",play(){
   visual.className="game-visual";let a=2+Math.floor(Math.random()*10),b=2+Math.floor(Math.random()*10),sum=a+b;visual.textContent="🃏";text.textContent=`Карты: ${a} + ${b} = ${sum}`;addScore(sum===21?100:sum>21?0:sum*5)
 }},
 slots:{title:"🎰 Слоты",start:"Три символа. Попробуй собрать комбинацию.",play(){
   const s=["🍒","🍋","🔔","💎","7️⃣"];visual.className="game-visual shake";visual.textContent="🎰";text.textContent="Крутим...";
   setTimeout(()=>{let a=s[Math.floor(Math.random()*s.length)],b=s[Math.floor(Math.random()*s.length)],c=s[Math.floor(Math.random()*s.length)];visual.className="game-visual";visual.textContent=`${a} ${b} ${c}`;let n=a===b&&b===c?150:a===b||b===c||a===c?50:5;text.textContent=n>5?`Комбинация: +${n} очков`:"Без комбинации: +5 очков";addScore(n)},800)
 }}
};

document.querySelectorAll(".game-card").forEach(b=>b.onclick=()=>{
 currentGame=games[b.dataset.game]; title.textContent=currentGame.title;
 home.classList.remove("active");game.classList.add("active");visual.textContent="";text.textContent=currentGame.start;playBtn.disabled=false;
});
$("#backBtn").onclick=()=>{game.classList.remove("active");home.classList.add("active")};
$("#closeBtn").onclick=()=>tg?.close();
playBtn.onclick=()=>currentGame?.play();
