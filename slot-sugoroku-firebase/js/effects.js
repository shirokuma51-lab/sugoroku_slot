// ============================================================
// effects.js — 演出ヘルパー（元の単一HTML版から移設・既存挙動は変更なし）
// 新規追加：Lucky発動エフェクト / Trap演出 / 実績アンロック演出
// ============================================================

export function showFloatPop(text, x, y, color){
  const p = document.createElement('div');
  p.className = 'float-pop';
  p.textContent = text;
  p.style.left = x + 'px';
  p.style.top = y + 'px';
  if(color) p.style.color = color;
  document.body.appendChild(p);
  setTimeout(()=>p.remove(), 1050);
}

export function flyCoinToHud(fromEl){
  const hudCoinEl = document.querySelector('.coin-icon');
  if(!hudCoinEl || !fromEl) return;
  const hudCoin = hudCoinEl.getBoundingClientRect();
  const fromRect = fromEl.getBoundingClientRect();
  const count = 5;
  for(let i=0;i<count;i++){
    setTimeout(()=>{
      const c = document.createElement('div');
      c.className = 'coin-fly';
      const startX = fromRect.left + fromRect.width/2 + (Math.random()*20-10);
      const startY = fromRect.top + fromRect.height/2;
      c.style.left = startX + 'px';
      c.style.top = startY + 'px';
      document.body.appendChild(c);
      const endX = hudCoin.left + hudCoin.width/2;
      const endY = hudCoin.top + hudCoin.height/2;
      const anim = c.animate([
        { transform:'translate(0,0) scale(1)', opacity:1 },
        { transform:`translate(${endX-startX}px, ${endY-startY}px) scale(.4)`, opacity:.9 }
      ], { duration: 520, easing:'cubic-bezier(.3,.6,.4,1)' });
      anim.onfinish = ()=> c.remove();
    }, i*40);
  }
}

export function spawnConfetti(originX, originY, count, colors){
  colors = colors || ['#FFD23F','#1B6FF2','#FF5FA2','#8BFF5F','#5FD0FF'];
  for(let i=0;i<count;i++){
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = (originX + (Math.random()*160-80)) + 'px';
    p.style.top = (originY - 20) + 'px';
    p.style.background = colors[Math.floor(Math.random()*colors.length)];
    p.style.animationDelay = (Math.random()*0.15)+'s';
    p.style.transform = `rotate(${Math.random()*360}deg)`;
    document.body.appendChild(p);
    setTimeout(()=>p.remove(), 1300);
  }
}

export function flashScreen(){
  const el = document.getElementById('flashOverlay');
  if(!el) return;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

export function showJudgeBanner(text, kind){
  const el = document.getElementById('judgeBanner');
  if(!el) return;
  el.textContent = text;
  el.className = 'judge-banner';
  void el.offsetWidth;
  el.classList.add(kind==='perfect' ? 'show-perfect' : 'show-miss');
  setTimeout(()=>{ el.className = 'judge-banner'; }, 900);
}

export function showBonusBanner(text){
  const b = document.createElement('div');
  b.className = 'bonus-banner';
  b.textContent = text || 'BONUS!!';
  document.body.appendChild(b);
  setTimeout(()=>b.remove(), 1450);
  const app = document.getElementById('app');
  if(app){
    app.classList.add('zoom-pulse');
    setTimeout(()=>app.classList.remove('zoom-pulse'), 650);
  }
}

/** Lucky Meter発動時の演出（虹色グロー＋バナー） */
export function showLuckyProcEffect(){
  const slotWrap = document.getElementById('slotWrap');
  if(slotWrap){
    slotWrap.classList.add('lucky-proc-glow');
    setTimeout(()=>slotWrap.classList.remove('lucky-proc-glow'), 900);
  }
  showBonusBanner('LUCKY NUMBER!!');
}

/** Trapマスに止まった時の演出（赤フラッシュ＋振動） */
export function showTrapEffect(tileEl){
  const app = document.getElementById('app');
  if(app){
    app.classList.add('trap-shake');
    setTimeout(()=>app.classList.remove('trap-shake'), 400);
  }
  if(tileEl){
    tileEl.classList.add('trap-flash');
    setTimeout(()=>tileEl.classList.remove('trap-flash'), 500);
  }
}

/** 実績アンロック演出（トーストはui.js側、ここでは画面演出のみ） */
export function showAchievementEffect(){
  flashScreen();
  const rect = { left: window.innerWidth/2, top: 80 };
  spawnConfetti(rect.left, rect.top, 22, ['#FFD23F','#FFFFFF','#5FD0FF']);
}

/** 💀（強制終了シンボル）が出た時の演出 */
export function showSkullEffect(){
  const app = document.getElementById('app');
  if(app){
    app.classList.add('trap-shake');
    setTimeout(()=>app.classList.remove('trap-shake'), 500);
  }
  const b = document.createElement('div');
  b.className = 'skull-banner';
  b.textContent = '💀 GAME OVER 💀';
  document.body.appendChild(b);
  setTimeout(()=>b.remove(), 1700);
}
