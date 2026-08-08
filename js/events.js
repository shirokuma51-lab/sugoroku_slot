// ============================================================
// events.js — イベントマス & Lucky Meter
//
// 【イベントマスの種類】（1〜9マスにランダム配置。10マス目は固定BONUS100）
//   通常     : 既存仕様どおり +5〜+30 からランダム
//   Lucky    : 通常の2倍相当（+10〜+60）を獲得
//   Trap     : 所持コインが少し減る（スコアには影響しない＝罠なので実績としては数えない）
//   Bonus    : 大きめ報酬 +50〜+80（10マス目の固定BONUSとは別枠の“プチボーナス”）
//   Monster  : モンスターが出現。到着するたびに攻撃してHPを削り、倒すと討伐ボーナス獲得
//              （倒すまでHPは引き継がれ、倒すと一定確率で新しいモンスターが再出現する。
//              詳細は monsters.js 参照）
//
// 将来「イベントマス設定」をFirestore(gameSettings/eventTiles)側で管理し、
// 出現率や報酬レンジを運営側から調整できるようにする拡張を見込んだ構成にしている
// （現状はデフォルト値埋め込み。settings.jsに相当する読み込み処理を足すだけで拡張可）。
// ============================================================
import { createMonsterInstance } from './monsters.js';

export const TILE_TYPES = {
  NORMAL: 'normal',
  LUCKY:  'lucky',
  TRAP:   'trap',
  BONUS:  'bonus',
  MONSTER:'monster',
  BONUS10:'bonus10', // 10マス目固定
};

// 出現率（1〜9マス用）。合計が100になるように調整。
// ※Trap（マイナスコイン）の出現率を高めに調整済み（ユーザー要望対応）
// ※Monsterマスの追加にともない、既存4種の比率は保ったまま全体を圧縮して枠を確保した
//   （元: 通常50/Lucky15/Trap25/Bonus10 → Monster枠25を新設し、残り75を同じ比率で配分）
const TILE_TYPE_WEIGHTS = [
  { type: TILE_TYPES.NORMAL,  weight: 37 },
  { type: TILE_TYPES.LUCKY,   weight: 11 },
  { type: TILE_TYPES.TRAP,    weight: 19 },
  { type: TILE_TYPES.BONUS,   weight: 8  },
  { type: TILE_TYPES.MONSTER, weight: 25 },
];

const NORMAL_REWARD_POOL = [5,10,15,20,25,30];
const TRAP_LOSS_POOL     = [10,15,20,25,30];
const BONUS_REWARD_POOL  = [50,60,70,80];

function randomFrom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function pickWeightedType(){
  const total = TILE_TYPE_WEIGHTS.reduce((s,w)=>s+w.weight, 0);
  let r = Math.random()*total;
  for(const w of TILE_TYPE_WEIGHTS){
    if(r < w.weight) return w.type;
    r -= w.weight;
  }
  return TILE_TYPES.NORMAL;
}

/**
 * 1〜boardSizeマスぶんのイベントマス設定を生成する。
 * 戻り値: { [マス番号]: { type, amount } }
 *   amount は正=コイン獲得 / 負=コイン減少（Trap）
 */
export function generateTileEvents(boardSize, bonusTileNumber, bonusAmount, monsterCatalog){
  const events = {};
  for(let i=1;i<boardSize;i++){
    const type = pickWeightedType();
    let amount;
    let monster = null;
    switch(type){
      case TILE_TYPES.LUCKY:   amount = randomFrom(NORMAL_REWARD_POOL) * 2; break;
      case TILE_TYPES.TRAP:    amount = -randomFrom(TRAP_LOSS_POOL); break;
      case TILE_TYPES.BONUS:   amount = randomFrom(BONUS_REWARD_POOL); break;
      case TILE_TYPES.MONSTER: amount = 0; monster = createMonsterInstance(monsterCatalog); break;
      default:                  amount = randomFrom(NORMAL_REWARD_POOL);
    }
    events[i] = { type, amount, monster };
  }
  events[bonusTileNumber] = { type: TILE_TYPES.BONUS10, amount: bonusAmount, monster: null };
  return events;
}

// ------------------------------------------------------------
// Lucky Meter
//   ・外れる(MISS)たびに +1、MAX10
//   ・10に達した状態で迎えたスピンで「発動」→ 50%で強制揃い(Lucky Number)
//   ・発動後（成功でも失敗でも）は0にリセット
// ------------------------------------------------------------
export class LuckyMeter {
  constructor(max = 10){
    this.max = max;
    this.value = 0;
  }

  onMiss(){
    this.value = Math.min(this.max, this.value + 1);
  }

  isReady(){
    return this.value >= this.max;
  }

  /**
   * スピン解決時に呼ぶ。MAXに達していれば50%抽選を行い、結果に関わらずメーターをリセットする。
   * @returns {boolean} true = Lucky Number 発動（強制的に3つ揃い扱いにする）
   */
  tryActivate(){
    if(!this.isReady()) return false;
    const success = Math.random() < 0.5;
    this.value = 0;
    return success;
  }

  reset(){
    this.value = 0;
  }
}
