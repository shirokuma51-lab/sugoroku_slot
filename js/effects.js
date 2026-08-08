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

/** キャラクター画像パス（プロフィールで選択した boy/girl に応じて切り替える）。
 *  管理画面(admin.html)でカスタム画像がアップロードされている場合はそちらを優先する
 *  （setCharacterImageOverridesで上書き。未設定ならこの標準画像を使う）。 */
const DEFAULT_CHARACTER_IMAGES = {
  boy: 'assets/img/characters/boy.png',
  girl: 'assets/img/characters/girl.png',
};
let characterImageOverrides = { boy: null, girl: null };

/** main.js側がFirestore(gameSettings/characters)を購読して呼び出す。dataURL、または未設定ならnullを渡す。 */
export function setCharacterImageOverrides(map){
  characterImageOverrides = {
    boy: map && map.boy ? map.boy : null,
    girl: map && map.girl ? map.girl : null,
  };
}

export function getCharacterImageUrl(key){
  const k = key === 'girl' ? 'girl' : 'boy';
  return characterImageOverrides[k] || DEFAULT_CHARACTER_IMAGES[k];
}

/** モンスターのアイコンをHTML文字列として組み立てる（絵文字 or 画像アップロード、どちらにも対応）。 */
function monsterIconHtml(opts, sizePx){
  if(opts.iconType === 'image' && opts.iconImage){
    return `<img src="${opts.iconImage}" style="width:${sizePx}px;height:${sizePx}px;object-fit:contain;">`;
  }
  return `<div class="battle-monster-emoji" style="filter:hue-rotate(${opts.hueRotate||0}deg)">${opts.monsterEmoji||'👾'}</div>`;
}

/**
 * モンスターマス到着時の戦闘演出。プレイヤー立ち絵とモンスターを対面させ、
 * HPバーが被ダメージ分だけ減るアニメーションを見せてから自動で消える。
 * opts: { playerCharacter, monsterName, monsterEmoji, iconType, iconImage, hueRotate, hpBefore, hpAfter, maxHp,
 *         damage, defeated, bonus, alreadyCleared }
 */
export function showBattleEffect(opts){
  const overlay = document.createElement('div');
  overlay.className = 'battle-overlay';

  const playerImg = getCharacterImageUrl(opts.playerCharacter);

  if(opts.alreadyCleared){
    overlay.innerHTML = `
      <div class="battle-card">
        <div class="battle-side battle-player"><img src="${playerImg}" alt=""></div>
        <div class="battle-vs">探索</div>
        <div class="battle-side battle-monster"><div class="battle-monster-emoji">🗺️</div></div>
      </div>
      <div class="battle-result-text">この場所はすでに探索済み…</div>
    `;
  } else {
    const pctBefore = Math.max(0, Math.round((opts.hpBefore / opts.maxHp) * 100));
    const pctAfter = Math.max(0, Math.round((opts.hpAfter / opts.maxHp) * 100));
    overlay.innerHTML = `
      <div class="battle-card">
        <div class="battle-side battle-player"><img src="${playerImg}" alt=""></div>
        <div class="battle-vs">VS</div>
        <div class="battle-side battle-monster">
          ${monsterIconHtml(opts, 48)}
          <div class="battle-monster-name">${opts.monsterName || ''}</div>
        </div>
      </div>
      <div class="battle-hp-track"><div class="battle-hp-fill" id="battleHpFillTmp" style="width:${pctBefore}%"></div></div>
      <div class="battle-damage-text">-${opts.damage}</div>
      <div class="battle-result-text">${opts.defeated ? `討伐！ +${opts.bonus}コイン` : ''}</div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(()=>{
      const fill = overlay.querySelector('#battleHpFillTmp');
      if(fill) fill.style.width = pctAfter + '%';
    });
    if(opts.defeated){
      setTimeout(()=>{
        const rect = overlay.querySelector('.battle-monster').getBoundingClientRect();
        spawnConfetti(rect.left+rect.width/2, rect.top+rect.height/2, 24, ['#FFD23F','#FF5FA2','#8BFF5F','#5FD0FF']);
      }, 350);
    }
    setTimeout(()=>overlay.remove(), 1550);
    return;
  }

  document.body.appendChild(overlay);
  setTimeout(()=>overlay.remove(), 1250);
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
