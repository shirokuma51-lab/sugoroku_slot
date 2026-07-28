// ============================================================
// game.js — スロット×双六 ゲーム本体
//
// ★既存ゲーム性・アニメーション・UI要素(id/class)は元の単一HTML版から
//   変更していない。追加したのは以下のみ：
//     ・イベントマス種別（通常/Lucky/Trap/Bonus/Bonus10）の反映
//     ・Lucky Meter（外れるたびに+1、MAXでLucky Number 50%抽選）
//     ・各種フックコールバック（Firestore連携はここでは行わず、
//       main.js側でstatistics.js/profile.js/achievement.jsに委譲する）
// これによりgame.js自体はFirebaseに直接依存しない＝単体テスト・再利用がしやすい。
// ============================================================
import { Sound } from './sound.js';
import {
  showFloatPop, flyCoinToHud, spawnConfetti, flashScreen,
  showJudgeBanner, showBonusBanner, showLuckyProcEffect, showTrapEffect,
  showSkullEffect,
} from './effects.js';
import { generateTileEvents, TILE_TYPES, LuckyMeter } from './events.js';

export const SKULL = 'SKULL';

export const CONFIG = {
  initialCoins: 100,
  spinCost: 5,
  minCoinsToPlay: 5,
  boardSize: 10,
  reelSymbols: [1,2,3,4,5,6],
  bonusTile: 10,
  bonusAmount: 100,
  stepAnimDelay: 260,
  spinCycleInterval: 70,
  decelSteps: 6,

  // ---- 当たり確率の補正 ----
  // 何もしないと3つとも独立ランダムなので揃う確率は 1/36(約2.8%) しかない。
  // 「既に止めた他のリールの数字」に少しだけ寄せることで、極端に不自然にならない
  // 範囲で当たりやすくしている（実際のスロット台の「重み付きリール」に近い考え方）。
  matchBoostSecond: 0.32, // 1つ目が停止済みの状態で2つ目を止めたとき、その数字に揃える確率
  matchBoostThird:  0.55, // 2つが既に同じ数字で停止している状態で3つ目を止めたとき、揃える確率

  // ---- 💀（強制終了シンボル）----
  // 3リール中1つだけを毎スピンランダムに選び、そのリールでのみ💀が出現しうる
  // （残り2リールには絶対に出ない）。これによりゲームオーバー確率を約1/3に抑えている。
  skullChance: 0.05,      // 💀許可リールが実際に💀で停止する確率（5%）
  skullTickChance: 0.06,  // 💀許可リールの回転中表示にも演出として💀をたまに混ぜる確率
};

const TILE_TYPE_ICON = {
  [TILE_TYPES.NORMAL]: '',
  [TILE_TYPES.LUCKY]: '★',
  [TILE_TYPES.TRAP]: '⚠',
  [TILE_TYPES.BONUS]: '🎁',
  [TILE_TYPES.BONUS10]: '🌈',
};

function randomFrom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

/** 高速回転／減速中の「見た目だけ」の表示用（結果には影響しない）。
 *  演出として💀もたまに混ぜるが、💀が出うるリール(isSkullEligible)以外では絶対に出さない。 */
function randomTickSymbol(isSkullEligible){
  if(isSkullEligible && Math.random() < CONFIG.skullTickChance) return SKULL;
  return randomFrom(CONFIG.reelSymbols);
}

export const Game = (function(){
  const state = {
    coins: 0,
    score: 0,
    position: 1,
    gameOver: false,
    tileEvents: {},
    reels: [
      { value: 1, spinning: false, stopped: true, intervalId: null },
      { value: 1, spinning: false, stopped: true, intervalId: null },
      { value: 1, spinning: false, stopped: true, intervalId: null },
    ],
    resolving: false,
    skullReelIndex: null, // このスピンで💀が出うるリールの番号（null=未決定）
  };

  const luckyMeter = new LuckyMeter(10);
  let hooks = {};
  let el = {};

  function cacheDom(){
    el = {
      coinValue: document.getElementById('coinValue'),
      scoreValue: document.getElementById('scoreValue'),
      spinBtn: document.getElementById('spinBtn'),
      board: document.getElementById('board'),
      slotWrap: document.getElementById('slotWrap'),
      judgeBanner: document.getElementById('judgeBanner'),
      gameoverOverlay: document.getElementById('gameoverOverlay'),
      gameoverTitle: document.querySelector('#gameoverOverlay .gameover-title'),
      gameoverSub: document.querySelector('#gameoverOverlay .gameover-sub'),
      reelWindows: [0,1,2].map(i => document.getElementById('reelWindow'+i)),
      reelValues: [0,1,2].map(i => document.getElementById('reelValue'+i)),
      stopBtns: [0,1,2].map(i => document.getElementById('stopBtn'+i)),
      luckyMeterFill: document.getElementById('luckyMeterFill'),
      luckyMeterLabel: document.getElementById('luckyMeterLabel'),
    };
  }

  function renderCoins(){
    el.coinValue.textContent = state.coins;
    if(hooks.onCoinsChange) hooks.onCoinsChange(state.coins);
  }
  function renderScore(bump){
    el.scoreValue.textContent = state.score;
    if(bump){
      el.scoreValue.classList.remove('bump');
      void el.scoreValue.offsetWidth;
      el.scoreValue.classList.add('bump');
    }
    if(hooks.onScoreChange) hooks.onScoreChange(state.score);
  }

  function renderLuckyMeter(){
    if(!el.luckyMeterFill) return;
    const pct = (luckyMeter.value / luckyMeter.max) * 100;
    el.luckyMeterFill.style.width = pct + '%';
    el.luckyMeterFill.classList.toggle('ready', luckyMeter.isReady());
    if(el.luckyMeterLabel){
      el.luckyMeterLabel.textContent = luckyMeter.isReady()
        ? 'LUCKY READY!'
        : `LUCKY METER ${luckyMeter.value}/${luckyMeter.max}`;
    }
  }

  function renderBoard(){
    el.board.innerHTML = '';
    for(let i=1;i<=CONFIG.boardSize;i++){
      const evt = state.tileEvents[i];
      const tile = document.createElement('div');
      tile.className = 'tile' + (i===CONFIG.boardSize ? ' bonus':'') + ' tile-' + evt.type;
      tile.id = 'tile-'+i;
      if(i === state.position){ tile.classList.add('current','player-here'); }

      const num = document.createElement('div');
      num.className = 'tile-num';
      num.textContent = i + 'マス';

      const reward = document.createElement('div');
      reward.className = 'tile-reward';
      reward.textContent = (evt.amount >= 0 ? '+' : '') + evt.amount;

      tile.appendChild(num);
      tile.appendChild(reward);

      if(TILE_TYPE_ICON[evt.type]){
        const badge = document.createElement('div');
        badge.className = 'tile-badge';
        badge.textContent = TILE_TYPE_ICON[evt.type];
        tile.appendChild(badge);
      }
      el.board.appendChild(tile);
    }
  }

  function setCurrentTile(pos){
    document.querySelectorAll('.tile.current').forEach(t=>t.classList.remove('current','player-here'));
    const tile = document.getElementById('tile-'+pos);
    if(tile) tile.classList.add('current','player-here');
    return tile;
  }

  function setSpinButtonEnabled(enabled){ el.spinBtn.disabled = !enabled; }

  function startSpin(){
    if(state.gameOver || state.resolving) return;
    if(state.coins < CONFIG.spinCost) return;

    Sound.click();
    state.coins -= CONFIG.spinCost;
    renderCoins();

    // このスピンで💀が出る可能性があるリールを1つだけランダムに決める（残り2つには一切出ない）
    state.skullReelIndex = Math.floor(Math.random() * state.reels.length);

    setSpinButtonEnabled(false);
    el.judgeBanner.className = 'judge-banner';

    state.reels.forEach((reel, idx)=>{
      reel.spinning = true;
      reel.stopped = false;
      el.reelWindows[idx].classList.remove('landed','glow');
      el.reelWindows[idx].classList.add('spinning');
      el.stopBtns[idx].disabled = false;

      reel.intervalId = setInterval(()=>{
        reel.value = randomTickSymbol(idx === state.skullReelIndex);
        el.reelValues[idx].textContent = reel.value === SKULL ? '💀' : reel.value;
        Sound.spinTick();
      }, CONFIG.spinCycleInterval);
    });
  }

  function stopReel(idx){
    const reel = state.reels[idx];
    if(!reel.spinning || reel.stopped) return;

    clearInterval(reel.intervalId);
    reel.spinning = false;
    el.stopBtns[idx].disabled = true;

    let count = 0;
    const decel = setInterval(()=>{
      reel.value = randomTickSymbol(idx === state.skullReelIndex);
      el.reelValues[idx].textContent = reel.value === SKULL ? '💀' : reel.value;
      count++;
      if(count >= CONFIG.decelSteps){
        clearInterval(decel);
        finalizeReel(idx);
      }
    }, 60 + count*10);
    reel.decelIntervalId = decel;
  }

  /**
   * リール停止時の最終値を決める。
   *   1) まず低確率で💀を抽選（当たるとその場で強制終了）
   *   2) 💀でなければ、既に止まっている他のリールの数字に少し寄せて当たりやすくする
   */
  function pickFinalValue(idx){
    if(idx === state.skullReelIndex && Math.random() < CONFIG.skullChance) return SKULL;

    const others = state.reels.filter((r,i)=> i!==idx && r.stopped && r.value !== SKULL);
    if(others.length === 2 && others[0].value === others[1].value){
      if(Math.random() < CONFIG.matchBoostThird) return others[0].value;
    } else if(others.length === 1){
      if(Math.random() < CONFIG.matchBoostSecond) return others[0].value;
    }
    return randomFrom(CONFIG.reelSymbols);
  }

  function finalizeReel(idx){
    if(state.gameOver) return;

    const reel = state.reels[idx];
    const finalValue = pickFinalValue(idx);
    reel.value = finalValue;
    el.reelValues[idx].textContent = finalValue === SKULL ? '💀' : finalValue;
    reel.stopped = true;

    el.reelWindows[idx].classList.remove('spinning');
    el.reelWindows[idx].classList.add('landed');

    if(finalValue === SKULL){
      el.reelWindows[idx].classList.add('skull');
      Sound.skull();
      triggerSkullGameOver(idx);
      return;
    }

    Sound.stop();

    if(state.reels.every(r=>r.stopped)){
      state.resolving = true;
      setTimeout(resolveSpin, 250);
    }
  }

  /** 💀が出た時：他のリールも強制的に止めて即ゲームオーバーにする */
  function triggerSkullGameOver(idx){
    state.resolving = true;

    state.reels.forEach((r, i)=>{
      if(i !== idx){
        clearInterval(r.intervalId);
        clearInterval(r.decelIntervalId);
        r.spinning = false;
        r.stopped = true;
        el.reelWindows[i].classList.remove('spinning');
        el.reelWindows[i].classList.add('landed');
      }
      el.stopBtns[i].disabled = true;
    });

    showSkullEffect();
    setTimeout(()=>{
      triggerGameOver('skull');
    }, 700);
  }

  function resolveSpin(){
    const values = state.reels.map(r=>r.value);
    let allSame = values[0]===values[1] && values[1]===values[2];
    let steps = allSame ? values[0] : 0;
    let wasLucky = false;

    // Lucky Meter: 外れるたびに+1、MAXに達していれば発動判定（成否に関わらず0にリセット）
    // ※通常の3つ揃いではメーターは変化させない（仕様上「外れるたびに+1」のみ規定のため）
    if(!allSame && luckyMeter.tryActivate()){
      allSame = true;
      steps = randomFrom(CONFIG.reelSymbols);
      wasLucky = true;
    } else if(!allSame){
      luckyMeter.onMiss();
    }
    renderLuckyMeter();

    if(allSame){
      Sound.perfect();
      flashScreen();
      state.reels.forEach((_,i)=>el.reelWindows[i].classList.add('glow'));
      showJudgeBanner(wasLucky ? 'LUCKY!!' : 'PERFECT!!', 'perfect');
      const rect = el.slotWrap.getBoundingClientRect();
      spawnConfetti(rect.left+rect.width/2, rect.top+40, 26);
      if(wasLucky){ Sound.luckyProc(); showLuckyProcEffect(); }

      setTimeout(()=>{
        state.reels.forEach((_,i)=>el.reelWindows[i].classList.remove('glow'));
        movePlayer(steps, (tileResult)=>{
          finishTurn({ isMatch:true, steps, coinsEarned: tileResult.amount, tileType: tileResult.type, wasLucky });
        });
      }, 500);
    } else {
      Sound.miss();
      showJudgeBanner('MISS','miss');
      el.slotWrap.classList.remove('shake');
      void el.slotWrap.offsetWidth;
      el.slotWrap.classList.add('shake');
      setTimeout(()=>{
        finishTurn({ isMatch:false, steps:0, coinsEarned:0, tileType:null, wasLucky:false });
      }, 500);
    }
  }

  function finishTurn(result){
    state.resolving = false;
    if(hooks.onSpinResolved) hooks.onSpinResolved(result);

    if(state.coins < CONFIG.minCoinsToPlay){
      triggerGameOver('coins');
    } else {
      setSpinButtonEnabled(true);
    }
  }

  function movePlayer(steps, onComplete){
    let remaining = steps;
    function stepOnce(){
      if(remaining <= 0){
        const tileResult = onTileArrive();
        if(onComplete) onComplete(tileResult);
        return;
      }
      state.position = ((state.position - 1 + 1) % CONFIG.boardSize) + 1;
      const tile = setCurrentTile(state.position);
      if(tile){
        tile.classList.add('jump');
        setTimeout(()=>tile.classList.remove('jump'), 300);
      }
      remaining--;
      setTimeout(stepOnce, CONFIG.stepAnimDelay);
    }
    stepOnce();
  }

  function onTileArrive(){
    const pos = state.position;
    const evt = state.tileEvents[pos];
    const tile = document.getElementById('tile-'+pos);

    if(tile){
      tile.classList.add('step-glow');
      setTimeout(()=>tile.classList.remove('step-glow'), 400);
    }

    state.coins += evt.amount;
    if(evt.amount > 0){
      state.score += evt.amount; // Trap(マイナス)はスコアに影響させない
    }
    if(state.coins < 0) state.coins = 0;

    if(tile){
      const r = tile.getBoundingClientRect();
      showFloatPop((evt.amount>=0?'+':'') + evt.amount, r.left + r.width/2 - 14, r.top - 6,
        evt.amount < 0 ? '#ff5252' : undefined);
      if(evt.amount > 0) flyCoinToHud(tile);
    }

    if(evt.type === TILE_TYPES.TRAP){
      Sound.trapHit();
      showTrapEffect(tile);
    } else {
      Sound.coin();
    }

    renderCoins();
    renderScore(true);

    if(evt.type === TILE_TYPES.BONUS10){
      Sound.bonus();
      showBonusBanner('BONUS +' + evt.amount + '!!');
      if(tile){
        const r = tile.getBoundingClientRect();
        spawnConfetti(r.left+r.width/2, r.top, 40, ['#FFD23F','#FF5FA2','#8BFF5F','#5FD0FF','#FFFFFF']);
      }
    }

    return evt;
  }

  function triggerGameOver(reason){
    state.gameOver = true;
    Sound.gameover();

    if(reason === 'skull'){
      if(el.gameoverTitle) el.gameoverTitle.textContent = '💀 GAME OVER';
      if(el.gameoverSub) el.gameoverSub.textContent = '💀が出てしまい強制終了となりました…リセットして再挑戦しよう！';
    } else {
      if(el.gameoverTitle) el.gameoverTitle.textContent = 'GAME OVER';
      if(el.gameoverSub) el.gameoverSub.textContent = 'コインが尽きました。リセットして再挑戦しよう！';
    }

    el.gameoverOverlay.classList.add('active');
    setSpinButtonEnabled(false);
    el.stopBtns.forEach(b=>b.disabled = true);
    if(hooks.onGameOver) hooks.onGameOver(reason);
  }

  function resetInternal(){
    state.coins = CONFIG.initialCoins;
    state.score = 0;
    state.position = 1;
    state.gameOver = false;
    state.resolving = false;
    state.skullReelIndex = null;
    state.tileEvents = generateTileEvents(CONFIG.boardSize, CONFIG.bonusTile, CONFIG.bonusAmount);
    luckyMeter.reset();
    state.reels.forEach(r=>{
      clearInterval(r.intervalId);
      clearInterval(r.decelIntervalId);
      r.value = 1; r.spinning=false; r.stopped=true;
    });

    el.reelValues.forEach(v=>{ v.textContent = '1'; });
    el.reelWindows.forEach(w=>w.classList.remove('spinning','landed','glow','skull'));
    el.stopBtns.forEach(b=>b.disabled = true);
    el.judgeBanner.className = 'judge-banner';
    el.gameoverOverlay.classList.remove('active');
    if(el.gameoverTitle) el.gameoverTitle.textContent = 'GAME OVER';
    if(el.gameoverSub) el.gameoverSub.textContent = 'コインが尽きました。リセットして再挑戦しよう！';

    renderCoins();
    renderScore(false);
    renderBoard();
    renderLuckyMeter();
    setSpinButtonEnabled(true);
  }

  return {
    /**
     * @param {object} hookFns
     *   onCoinsChange(coins), onScoreChange(score),
     *   onSpinResolved({isMatch, steps, coinsEarned, tileType, wasLucky}),
     *   onGameOver(), onReset()
     */
    init(hookFns){
      hooks = hookFns || {};
      cacheDom();
      resetInternal();

      el.spinBtn.addEventListener('click', startSpin);
      el.stopBtns.forEach((btn, idx)=> btn.addEventListener('click', ()=>{ Sound.click(); stopReel(idx); }));
    },
    reset(){
      resetInternal();
      if(hooks.onReset) hooks.onReset();
    },
    getScore(){ return state.score; },
    getCoins(){ return state.coins; },
    addCoins(amount){
      state.coins += amount;
      renderCoins();
    },
    isGameOver(){ return state.gameOver; },
  };
})();
