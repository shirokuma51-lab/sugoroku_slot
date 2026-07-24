// ============================================================
// aikotoba-page.js — あいことば専用ページ(aikotoba.html)のロジック
//
// ゲーム画面(main.js/game.js)には依存しない独立したページ。
// このページ単体をブックマークやキャンペーンで配布するURLとして使う想定。
// URLに ?code=XXXX を付けると、あいことば欄に自動入力される。
//
// 引き換えに成功すると Firestore 上の players/{uid}.pendingCoins に加算されるだけで、
// このページ自体はゲームのコイン表示を持たない。実際の受け取りは
// ゲーム画面(index.html)を開いたタイミングで自動的に行われる（main.js参照）。
// ============================================================
import { ensurePlayerAuth } from './auth.js';
import { redeemPassword } from './password.js';
import { Sound } from './sound.js';

const input = document.getElementById('aikotobaInput');
const submitBtn = document.getElementById('aikotobaSubmitBtn');
const resultEl = document.getElementById('resultMessage');

function showResult(message, isSuccess){
  resultEl.textContent = message;
  resultEl.className = 'result-message ' + (isSuccess ? 'success' : 'error');
}

async function init(){
  submitBtn.disabled = true;
  showResult('準備中...', true);

  let uid = null;
  try{
    const user = await ensurePlayerAuth();
    uid = user.uid;
    showResult('', true);
  }catch(e){
    showResult('ログインに失敗しました。通信環境をご確認ください。', false);
    return;
  }
  submitBtn.disabled = false;

  // ?code=XXXX が付いていれば自動入力
  const params = new URLSearchParams(location.search);
  const prefilled = params.get('code');
  if(prefilled) input.value = prefilled;

  submitBtn.addEventListener('click', ()=> submit(uid));
  input.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') submit(uid); });
}

let submitting = false;
async function submit(uid){
  if(submitting) return;
  submitting = true;
  submitBtn.disabled = true;

  const result = await redeemPassword(uid, input.value);
  if(result.success){
    Sound.passwordSuccess();
    showResult(result.message, true);
    input.value = '';
  } else {
    Sound.passwordFail();
    showResult(result.message, false);
  }

  submitBtn.disabled = false;
  submitting = false;
}

init();
