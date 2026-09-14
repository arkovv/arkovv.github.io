
"use strict";

/* ============================================================
   1. CONFIG + STATE
   ============================================================ */

const DEFAULTS = {
  cardsPerPlayer: 3,      // K
  desireBudget: 100,      // B_D
  defenseBudget: 100,
  weeklyRefill: 100,
  expectedRefills: 4,     // refills per set
  avgSetReward: 400,      // R_avg
  packCost: 50,           // C
  failRefund: 10,         // F
  targetHits: 4,          // T
  bidderFailReward: 20,
  legacyTrigger: 0.20,
  scarcityExponent: 2,    // exponent in S_c
  boostBase: 6,           // G
  legacyAgeExponent: 1    // gamma
};

const CFG_LABELS = {
  cardsPerPlayer:"Cards per player (K)", desireBudget:"Desire budget (B_D)",
  defenseBudget:"Defense budget", weeklyRefill:"Weekly reward", expectedRefills:"Refills per set",
  avgSetReward:"Average set reward", packCost:"Pack cost (C)", failRefund:"Fail refund (F)",
  targetHits:"Target hits/player (T)", bidderFailReward:"Bidder pack fail reward",
  legacyTrigger:"Legacy trigger chance", scarcityExponent:"Scarcity exponent",
  boostBase:"Personal boost base (G)", legacyAgeExponent:"Legacy age exponent"
};

const KEY = "friendsCardsLocal.v1";
let S = null;
let accountSession = null;
function isPlayer(){ return accountSession?.role === 'player'; }

function blankState(){
  return {
    version: 1,
    config: Object.assign({}, DEFAULTS),
    players: [],          // {id,name,credits}
    sets: [],             // see newSet()
    instances: [],        // {id,designId,setId,ownerId,floatValue,catalog,state,source,createdAt,tradeCount,note}
    packs: [],            // {id,type,setId,authorId,originBidderId,ownerId,odds,raw,defense,effective,opened,createdAt,tradeCount}
    ledger: [],           // {id,at,playerId,delta,after,type,note}
    log: [],              // {at,text}
    weekly: [],           // {at,amount,count}
    ids: {player:1,set:1,design:1,instance:1,pack:1,ledger:1},
    ui: {tab:"setup", acting:null, blur:false, sound:true, setId:null, marketSort:"demand"}
  };
}

function newSet(ordinal, name, cfg){
  return {
    id: nextId("set"), ordinal, name,
    state: "DRAFT",                 // DRAFT > BIDDING > DEFENSE > LIVE > CLOSED
    config: Object.assign({}, cfg),
    participants: [],               // player ids
    designs: [],                    // {id,authorId,title,meme,request,limits}
    bids: {},                       // bids[bidderId][designId] = amount
    locked: {},                     // locked[bidderId] = true
    defense: {},                    // defense[designId] = amount
    defLocked: {},                  // defLocked[authorId] = true
    snapshot: null,                 // frozen market math
    createdAt: Date.now()
  };
}

function nextId(kind){ return S.ids[kind]++; }

