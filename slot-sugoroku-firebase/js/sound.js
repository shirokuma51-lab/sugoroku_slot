// ============================================================
// sound.js — WebAudioによる効果音（外部音源ファイル不使用・既存仕様を踏襲）
// ============================================================

let ctx = null;
function getCtx(){
  if(!ctx){
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  if(ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, type, vol, delay){
  try{
    const c = getCtx();
    const t0 = c.currentTime + (delay||0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol||0.15, t0+0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0+dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0+dur+0.02);
  }catch(e){ /* audio not available */ }
}

export const Sound = {
  click(){ tone(520,0.06,'square',0.12); },
  spinTick(){ tone(300+Math.random()*120,0.03,'square',0.05); },
  stop(){ tone(220,0.12,'triangle',0.18); tone(440,0.1,'triangle',0.1,0.05); },
  coin(){ tone(880,0.08,'sine',0.15); tone(1180,0.12,'sine',0.15,0.06); },
  perfect(){ [660,880,1100,1320].forEach((f,i)=>tone(f,0.16,'triangle',0.16,i*0.08)); },
  miss(){ tone(160,0.25,'sawtooth',0.15); },
  bonus(){ [523,659,784,1046,1318].forEach((f,i)=>tone(f,0.22,'triangle',0.18,i*0.09)); },
  gameover(){ [420,360,300,220].forEach((f,i)=>tone(f,0.3,'sawtooth',0.15,i*0.18)); },

  // ---- 追加分 ----
  achievementUnlock(){ [700,900,1200,1500].forEach((f,i)=>tone(f,0.18,'sine',0.17,i*0.07)); },
  luckyProc(){ [500,750,1000,1250,1500].forEach((f,i)=>tone(f,0.14,'triangle',0.18,i*0.06)); },
  trapHit(){ tone(150,0.2,'sawtooth',0.18); tone(100,0.25,'sawtooth',0.12,0.1); },
  passwordSuccess(){ [660,990,1320].forEach((f,i)=>tone(f,0.15,'sine',0.16,i*0.08)); },
  passwordFail(){ tone(180,0.3,'sawtooth',0.15); },

  // ---- 💀 ----
  skull(){
    tone(90,0.5,'sawtooth',0.2);
    tone(60,0.6,'sawtooth',0.16,0.15);
  },
};
