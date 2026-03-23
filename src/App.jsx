import { useState, useCallback, useEffect, useRef } from "react";

const ROWS = 13, COLS = 9;
const PLAYER = { ONE: 1, TWO: 2 };
const ITEM_CATEGORY = {
  SWORD:"weapon", SPEAR:"weapon", BOW:"weapon",
  HORSE:"vehicle", SHIP:"vehicle", CHARIOT:"vehicle",
  EQUIPMENT:"equipment",
};
const ITEM_EMOJI = {
  SWORD:"⚔", SPEAR:"🗡", BOW:"🏹",
  HORSE:"🐴", SHIP:"⛵", CHARIOT:"🪖", EQUIPMENT:"🛡",
};

// ===== SOUND ENGINE =====
function makeSfx() {
  let ctx = null;
  const ac = () => { if(!ctx) ctx = new(window.AudioContext||window.webkitAudioContext)(); return ctx; };
  const tone = (freq, dur, type="sine", vol=0.15) => {
    try {
      const a=ac(), o=a.createOscillator(), g=a.createGain();
      o.connect(g); g.connect(a.destination);
      o.type=type; o.frequency.setValueAtTime(freq,a.currentTime);
      g.gain.setValueAtTime(vol,a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,a.currentTime+dur);
      o.start(); o.stop(a.currentTime+dur);
    } catch(e){}
  };
  const seq = (notes) => notes.forEach(([f,t,d=0.2])=>setTimeout(()=>tone(f,d),t*1000));
  return {
    select:  ()=>tone(880,0.1,"sine",0.12),
    move:    ()=>{ tone(440,0.12,"triangle",0.18); },
    attack:  ()=>{ try{ const a=ac(),b=a.createBuffer(1,a.sampleRate*0.12,a.sampleRate),d=b.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length); const s=a.createBufferSource(),g=a.createGain(); s.buffer=b;s.connect(g);g.connect(a.destination);g.gain.setValueAtTime(0.25,a.currentTime);s.start(); }catch(e){} },
    capture: ()=>seq([[523,0],[659,0.06],[784,0.12]]),
    promote: ()=>seq([[523,0],[659,0.08],[784,0.16],[1047,0.26]]),
    combine: ()=>{ tone(660,0.1); setTimeout(()=>tone(990,0.15),80); },
    win:     ()=>seq([[523,0,0.25],[659,0.12,0.25],[784,0.25,0.25],[1047,0.42,0.4],[784,0.58,0.2],[1047,0.72,0.5]]),
    draw:    ()=>{ tone(440,0.5,"sine",0.12); setTimeout(()=>tone(330,0.5,"sine",0.1),200); },
  };
}

// ===== BOARD SETUP =====
function mkPiece(type,player,id){ return {kind:"piece",type,player,promoted:false,weapon:null,vehicle:null,equip:{},handHold:null,id}; }
function createInitialBoard() {
  const b = Array.from({length:ROWS},()=>Array(COLS).fill(null));
  [ [4,3,"SWORD"],[4,7,"EQUIPMENT"],[4,1,"EQUIPMENT"],
    [5,1,"EQUIPMENT"],[5,3,"EQUIPMENT"],[5,5,"SHIP"],
    [6,3,"EQUIPMENT"],[6,5,"CHARIOT"],
    [7,3,"BOW"],[7,5,"SWORD"],[7,7,"EQUIPMENT"],
    [8,1,"HORSE"],[8,5,"SPEAR"],[8,7,"EQUIPMENT"],
  ].forEach(([r,c,t])=>{ b[r][c]={kind:"item",type:t,id:`i-${r}-${c}`}; });
  b[12][4]=mkPiece("KING",1,"p1k"); b[10][1]=mkPiece("SOLDIER",1,"p1s1"); b[10][5]=mkPiece("SOLDIER",1,"p1s2"); b[10][7]=mkPiece("SOLDIER",1,"p1s3");
  b[0][4] =mkPiece("KING",2,"p2k"); b[2][1] =mkPiece("SOLDIER",2,"p2s1"); b[2][5] =mkPiece("SOLDIER",2,"p2s2"); b[2][7] =mkPiece("SOLDIER",2,"p2s3");
  return b;
}

// ===== GAME LOGIC =====
const fd = (p) => p===1?-1:1;
function getMoves(board,r,c,piece) {
  const moves=[], f=fd(piece.player);
  const add=(nr,nc)=>{
    if(nr<0||nr>=ROWS||nc<0||nc>=COLS) return false;
    const cell=board[nr][nc];
    if(!cell){moves.push([nr,nc]);return true;}
    if(cell.kind==="item"){
      // 手持ちなしなら止まれる
      if(!piece.handHold) moves.push([nr,nc]);
      return false;
    }
    // _floorItemを持つ駒のマス（アイテムを無視して乗っている状態）は空き扱い
    if(cell.kind==="piece"&&cell._floorItem&&cell.player!==piece.player){
      moves.push([nr,nc]); return false;
    }
    if(cell.kind==="piece"&&cell.player!==piece.player){moves.push([nr,nc]);return false;}
    return false;
  };
  if(piece.type==="KING"){
    const blocked=new Set();
    if(piece.equip.front) blocked.add(f<0?"n":"s");
    if(piece.equip.back)  blocked.add(f<0?"s":"n");
    if(piece.equip.left)  blocked.add("w");
    if(piece.equip.right) blocked.add("e");
    [{dr:-1,dc:0,k:"n"},{dr:1,dc:0,k:"s"},{dr:0,dc:-1,k:"w"},{dr:0,dc:1,k:"e"},
     {dr:-1,dc:-1},{dr:-1,dc:1},{dr:1,dc:-1},{dr:1,dc:1}]
      .forEach(({dr,dc,k})=>{ if(!k||!blocked.has(k)) add(r+dr,c+dc); });
    if(piece.promoted){ for(let i=1;i<=2;i++){if(!add(r+(-f)*i,c))break;} }
  } else {
    // 乗り物の動き（昇格前後共通）
    if(piece.vehicle==="HORSE") [[f,0],[f*2,0],[f,-1],[f,1],[f*2,-1],[f*2,1]].forEach(([dr,dc])=>add(r+dr,c+dc));
    else if(piece.vehicle==="SHIP"){ for(let i=1;c+i<COLS;i++){if(!add(r,c+i))break;} for(let i=1;c-i>=0;i++){if(!add(r,c-i))break;} }
    else if(piece.vehicle==="CHARIOT") [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>{ for(let i=1;i<=3;i++){if(!add(r+dr*i,c+dc*i))break;} });
    // 人の足（昇格前=前1マス、昇格後=前後左右1マス）を相補的に追加
    if(piece.promoted) [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>add(r+dr,c+dc));
    else add(r+f,c); // 未昇格かつ乗り物なし
  }
  return moves;
}

function getAttacks(board,r,c,piece){
  const atk=[], f=fd(piece.player);
  const chk=(nr,nc)=>{ if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS){const cl=board[nr][nc]; if(cl&&cl.kind==="piece"&&cl.player!==piece.player)atk.push([nr,nc]);} };
  if(piece.weapon==="SWORD") [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>chk(r+dr,c+dc));
  else if(piece.weapon==="SPEAR") [[f,0],[f,-1],[f,1]].forEach(([dr,dc])=>{ for(let i=1;i<=3;i++){const nr=r+dr*i,nc=c+dc*i; if(nr<0||nr>=ROWS||nc<0||nc>=COLS)break; const cl=board[nr][nc]; if(cl){if(cl.kind==="piece"&&cl.player!==piece.player)atk.push([nr,nc]);break;} } });
  else if(piece.weapon==="BOW") [[f,0],[f,-1],[f,1]].forEach(([dr,dc])=>{ for(let i=2;i<=6;i++){const nr=r+dr*i,nc=c+dc*i; if(nr<0||nr>=ROWS||nc<0||nc>=COLS)break; const cl=board[nr][nc]; if(cl){if(cl.kind==="piece"&&cl.player!==piece.player)atk.push([nr,nc]);break;} } });
  else getMoves(board,r,c,piece).forEach(([mr,mc])=>{ const cl=board[mr][mc]; if(cl&&cl.kind==="piece"&&cl.player!==piece.player)atk.push([mr,mc]); });
  return atk;
}

const isPromo=(row,player)=>player===1?row<=2:row>=10;

function countPieces(board,player){
  let p=0,it=0;
  board.forEach(row=>row.forEach(cell=>{ if(cell?.kind==="piece"&&cell.player===player){p++;if(cell.weapon)it++;if(cell.vehicle)it++;it+=Object.values(cell.equip||{}).filter(Boolean).length;} }));
  return {pieces:p,items:it};
}

function canEquip(piece,item){
  // そのアイテムを結合できるスロットがあるか
  const cat=ITEM_CATEGORY[item.type];
  if(cat==="weapon") return !piece.weapon;
  if(cat==="vehicle") return piece.type==="SOLDIER"&&!piece.vehicle;
  if(cat==="equipment"){
    const slots=piece.type==="KING"?["front","back","left","right"]:["left","right"];
    return slots.some(s=>!piece.equip[s]);
  }
  return false;
}

function applyEquip(piece,item){
  const cat=ITEM_CATEGORY[item.type];
  const p={...piece};
  if(cat==="weapon"&&!p.weapon){p.weapon=item.type;p.handHold=null;}
  else if(cat==="vehicle"&&p.type==="SOLDIER"&&!p.vehicle){p.vehicle=item.type;p.handHold=null;}
  else if(cat==="equipment"){
    // 自動割り当て: 後ろ→横（左→右）→前 の順
    const slots=p.type==="KING"?["back","left","right","front"]:["left","right"];
    const free=slots.find(s=>!p.equip[s]);
    if(free){p.equip={...p.equip,[free]:item.type};p.handHold=null;}
  }
  return p;
}

// ===== SIMPLE AI =====

// ===== LIGHTWEIGHT RULE-BASED AI =====
// ボードコピーなし。優先度テーブルで即決。
function aiMove(board, captured) {
  const pieces = [];
  board.forEach((row,r)=>row.forEach((cell,c)=>{ if(cell?.kind==="piece"&&cell.player===2) pieces.push({r,c,piece:cell}); }));

  // 候補をスコア付きで集める（ボードコピー不要）
  const candidates = [];

  for(const {r,c,piece} of pieces){
    // ── 攻撃候補 ──
    for(const [tr,tc] of getAttacks(board,r,c,piece)){
      const tgt=board[tr][tc]; if(!tgt) continue;
      let score;
      if(tgt.type==="KING") score=10000;
      else if(!tgt.vehicle && Object.values(tgt.equip||{}).filter(Boolean).length===0) score=500; // 無防備な兵
      else if(tgt.vehicle) score=200;  // 乗物を剥がす
      else score=100;                   // 防具を剥がす
      candidates.push({type:"attack",fr:r,fc:c,tr,tc,score});
    }

    // ── 移動候補（ボードコピーなし、位置だけで評価） ──
    for(const [mr,mc] of getMoves(board,r,c,piece)){
      const tc=board[mr][mc];
      let score=0;
      if(tc?.kind==="item"){
        const cat=ITEM_CATEGORY[tc.type];
        if(cat==="weapon"&&!piece.weapon) score=300;
        else if(cat==="vehicle"&&!piece.vehicle&&piece.type==="SOLDIER") score=280;
        else if(cat==="equipment"){ const slots=piece.type==="KING"?["front","back","left","right"]:["left","right"]; if(slots.some(s=>!piece.equip[s])) score=150; }
        else score=10; // スロット満杯でも微加点
      }
      // 前進ボーナス（P2は下方向=row増加が前進）
      if(piece.type==="SOLDIER") score += (mr - r) * 8;
      // 昇格ボーナス
      if(isPromo(mr,2)&&!piece.promoted) score+=400;
      candidates.push({type:"move",fr:r,fc:c,tr:mr,tc:mc,score});
    }
  }

  // デプロイ
  if(captured[2]?.length>0){
    for(let row=0;row<3;row++) for(let col=0;col<COLS;col++){
      if(!board[row][col]){ candidates.push({type:"deploy",tr:row,tc:col,soldier:captured[2][0],score:50}); break; }
    }
  }

  if(candidates.length===0) return null;

  // 最高スコアを選択（同スコアはランダムに崩してマンネリ防止）
  const maxScore = Math.max(...candidates.map(c=>c.score));
  const top = candidates.filter(c=>c.score===maxScore);
  return top[Math.floor(Math.random()*top.length)];
}

// ===== PIECE UI =====
function PieceDisplay({piece}){
  const emoji=piece.type==="KING"?(piece.player===1?"👑":"🔱"):(piece.player===1?"🪆":"🎭");
  const ec=Object.values(piece.equip||{}).filter(Boolean).length;
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
      <div style={{fontSize:15,filter:piece.promoted?"drop-shadow(0 0 5px gold)":"none"}}>{emoji}</div>
      <div style={{display:"flex",gap:1,flexWrap:"wrap",justifyContent:"center",fontSize:8}}>
        {piece.weapon&&<span>{ITEM_EMOJI[piece.weapon]}</span>}
        {piece.vehicle&&<span>{ITEM_EMOJI[piece.vehicle]}</span>}
        {ec>0&&<span>🛡{ec>1?`×${ec}`:""}</span>}
        {piece.handHold&&<span style={{opacity:0.6}}>({ITEM_EMOJI[piece.handHold]})</span>}
      </div>
    </div>
  );
}

const btn = (color, extra={}) => ({
  background:"rgba(20,10,0,0.7)", border:`1px solid ${color}`,
  color:color, borderRadius:5, padding:"4px 10px",
  cursor:"pointer", fontFamily:"inherit", fontSize:11, ...extra,
});

// ===== MAIN =====
export default function KumiShogi(){
  const [board,setBoard]=useState(createInitialBoard);
  const [cur,setCur]=useState(1);
  const [sel,setSel]=useState(null);
  const [moves,setMoves]=useState([]);
  const [atks,setAtks]=useState([]);
  const [cap,setCap]=useState({1:[],2:[]});
  const [log,setLog]=useState(["ゲーム開始！P1のターン"]);
  const [winner,setWinner]=useState(null);
  const [drawRes,setDrawRes]=useState(null);
  const [pendCombine,setPendCombine]=useState(null);
  const [pendItemChoice,setPendItemChoice]=useState(null); // {sr,sc,tr,tc,piece,item}
  // 手持ち駒が移動後に「結合 or キャンセル」を待つ状態
  // { pr,pc,item,boardSnap,msg } — キャンセル時はboardSnapを使ってターン継続
  const [holdingMoved,setHoldingMoved]=useState(null);
  const [turn,setTurn]=useState(1);
  const [deployMode,setDeployMode]=useState(false);
  const [deploying,setDeploying]=useState(null);
  const [aiMode,setAiMode]=useState(false);
  const [aiThink,setAiThink]=useState(false);
  const [soundOn,setSoundOn]=useState(true);
  const sfxRef=useRef(null);
  const sfx=useCallback((n)=>{ if(!soundOn)return; if(!sfxRef.current)sfxRef.current=makeSfx(); try{sfxRef.current[n]?.();}catch(e){} },[soundOn]);
  const addLog=useCallback((m)=>setLog(l=>[m,...l.slice(0,29)]),[]);

  const checkDraw=useCallback((t,b)=>{
    if(t<=50)return null;
    const p1=countPieces(b,1),p2=countPieces(b,2);
    if(p1.pieces!==p2.pieces) return {winner:p1.pieces>p2.pieces?1:2,reason:"駒数"};
    if(p1.items!==p2.items)   return {winner:p1.items>p2.items?1:2,reason:"アイテム数"};
    return {winner:null,reason:"完全引き分け"};
  },[]);

  const endTurn=useCallback((nb,nc,msg)=>{
    const next=cur===1?2:1, nt=turn+1;
    if(nc)setCap(nc);
    setBoard(nb); setCur(next); setSel(null); setMoves([]); setAtks([]); setTurn(nt);
    if(msg)addLog(msg);
    const dr=checkDraw(nt,nb);
    if(dr){
      setWinner("draw"); setDrawRes(dr);
      if(dr.winner){addLog(`⏱50ターン — ${dr.reason}でP${dr.winner}の勝利！`);sfx("win");}
      else{addLog(`⏱50ターン — ${dr.reason}`);sfx("draw");}
    } else { addLog(`P${next}のターン`); }
  },[cur,turn,addLog,checkDraw,sfx]);

  // AI turn — stateRef で最新値を参照し、依存配列を最小化
  const stateRef = useRef({});
  stateRef.current = {board,cap,endTurn,sfx,addLog};
  const aiRunning = useRef(false);
  useEffect(()=>{
    if(!aiMode||cur!==2||winner||pendCombine||deployMode)return;
    if(aiRunning.current)return;
    aiRunning.current=true;
    setAiThink(true);
    const t=setTimeout(()=>{
      const {board,cap,endTurn,sfx,addLog}=stateRef.current;
      const mv=aiMove(board,cap);
      if(!mv){setAiThink(false);aiRunning.current=false;return;}
      const nb=board.map(row=>[...row]);
      let nc={1:[...cap[1]],2:[...cap[2]]}, msg="AI: ";
      if(mv.type==="deploy"){
        nb[mv.tr]=[...nb[mv.tr]]; nb[mv.tr][mv.tc]={...mv.soldier,equip:{},weapon:null,vehicle:null,handHold:null};
        nc[2]=nc[2].filter(p=>p.id!==mv.soldier.id); msg+="兵士を配置"; sfx("move");
      } else if(mv.type==="move"){
        nb[mv.tr]=[...nb[mv.tr]]; nb[mv.fr]=[...nb[mv.fr]];
        const tc=board[mv.tr][mv.tc]; let mp={...board[mv.fr][mv.fc]};
        if(tc?.kind==="item"){mp=applyEquip(mp,tc);msg+=`${tc.type}を取得`;sfx("combine");}
        else{msg+=`(${mv.fr+1},${mv.fc+1})→(${mv.tr+1},${mv.tc+1})`;sfx("move");}
        if(isPromo(mv.tr,2)&&!mp.promoted){mp={...mp,promoted:true};msg+=" 昇格！";sfx("promote");}
        nb[mv.tr][mv.tc]=mp; nb[mv.fr][mv.fc]=null;
      } else if(mv.type==="attack"){
        nb[mv.tr]=[...nb[mv.tr]]; nb[mv.fr]=[...nb[mv.fr]];
        const att=board[mv.fr][mv.fc], tgt=board[mv.tr][mv.tc]; sfx("attack");
        // ダメージ優先順位: 乗り物→装備1個→本体
        if(tgt.vehicle){nb[mv.tr][mv.tc]={...tgt,vehicle:null};msg+=`攻撃→${tgt.vehicle}破壊`;}
        else{
          const esl=Object.keys(tgt.equip||{}).filter(s=>tgt.equip[s]!=null&&tgt.equip[s]!==false&&tgt.equip[s]!=='');
          if(esl.length>0){nb[mv.tr][mv.tc]={...tgt,equip:{...tgt.equip,[esl[0]]:null}};msg+="攻撃→防具破壊";}
          else{
            msg+=`攻撃→P1の${tgt.type}捕獲！`; sfx("capture");
            if(tgt.type==="KING"){setBoard(nb);setWinner(2);addLog(msg);addLog("🔱 AIの勝利！");sfx("win");setAiThink(false);aiRunning.current=false;return;}
            if(tgt.type==="SOLDIER") nc[2]=[...nc[2],{...tgt,player:2,id:`c${Date.now()}`}];
            const ranged=att.weapon==="BOW"||att.weapon==="SPEAR";
            nb[mv.tr][mv.tc]=ranged?null:{...att}; nb[mv.fr][mv.fc]=null;
            if(!ranged&&isPromo(mv.tr,2)&&!att.promoted){nb[mv.tr][mv.tc]={...nb[mv.tr][mv.tc],promoted:true};msg+=" 昇格！";sfx("promote");}
          }
        }
      }
      setAiThink(false); aiRunning.current=false; endTurn(nb,nc,msg);
    },300);
    return()=>{ clearTimeout(t); aiRunning.current=false; };
  },[aiMode,cur,winner,pendCombine,deployMode]);

  // ── 攻撃共通処理 ──
  const doAttack = useCallback((sr,sc,r,c,nb,nc,att,tgt)=>{
    const ranged=att.weapon==="BOW"||att.weapon==="SPEAR";
    let msg=`P${cur}が攻撃`; sfx("attack");
    // ダメージ優先順位: ① 乗り物 → ② 装備1個 → ③ 本体（捕獲）
    if(tgt.vehicle){
      nb[r][c]={...tgt,vehicle:null};
      msg+=`→${tgt.vehicle}破壊（攻撃者は動かない）`;
    } else {
      const esl=Object.keys(tgt.equip||{}).filter(s=>tgt.equip[s]!=null&&tgt.equip[s]!=='');
      if(esl.length>0){
        // 装備を1個だけ破壊（攻撃者は動かない）
        nb[r][c]={...tgt,equip:{...tgt.equip,[esl[0]]:null}};
        msg+=`→防具(${esl[0]})破壊（攻撃者は動かない）`;
      } else {
        // 本体捕獲
        msg+=`→P${tgt.player}の${tgt.type}捕獲！`; sfx("capture");
        if(tgt.type==="KING"){setBoard(nb);setWinner(cur);addLog(msg);addLog(`🎉 P${cur}の勝利！`);sfx("win");setSel(null);setMoves([]);setAtks([]);return true;}
        if(tgt.type==="SOLDIER") nc[cur]=[...nc[cur],{...tgt,player:cur,id:`c${Date.now()}`}];
        if(!ranged){
          // 近接：攻撃者がターゲットのマスに移動
          nb[r][c] = {...att, _floorItem: undefined}; // 攻撃者移動（装備等はそのまま）
          nb[sr][sc] = att._floorItem ? {kind:"item",type:att._floorItem,id:`item-${sr}-${sc}`} : null;
        }
        // ranged（弓/槍）：攻撃者は動かない（nb[sr][sc]はそのまま、nb[r][c]はnull）
        if(ranged) nb[r][c] = null;
        if(!ranged&&isPromo(r,att.player)&&!att.promoted){nb[r][c]={...nb[r][c],promoted:true};msg+=" 昇格！";sfx("promote");}
      }
    }
    setSel(null);setMoves([]);setAtks([]);
    endTurn(nb,nc,msg); return true;
  },[cur,sfx,addLog,endTurn]);

  const handleClick=useCallback((r,c)=>{
    if(winner||aiThink)return;
    if(aiMode&&cur===2)return;
    const cell=board[r][c];

    // ── デプロイモード ──
    if(deployMode&&deploying){
      const hr=cur===1?[10,11,12]:[0,1,2];
      if(!hr.includes(r)||board[r][c]){addLog("ホームベース内の空きマスに置いてください");return;}
      const nb=board.map(row=>[...row]); nb[r]=[...nb[r]]; nb[r][c]={...deploying,equip:{},weapon:null,vehicle:null,handHold:null};
      const nc={...cap}; nc[cur]=nc[cur].filter(p=>p.id!==deploying.id);
      setDeployMode(false); setDeploying(null); sfx("move");
      endTurn(nb,nc,`P${cur}: 兵士配置`); return;
    }

    // ── pendItemChoice中はモーダルボタンのみ受付 ──
    if(pendItemChoice) return;
    // ── holdingMoved中はモーダルボタンのみ受付 ──
    if(holdingMoved) return;
    // ── pendCombine中はモーダルボタンのみ受付 ──
    if(pendCombine) return;

    // ── 攻撃 ──
    if(sel&&atks.some(([ar,ac])=>ar===r&&ac===c)){
      const [sr,sc]=sel, att=board[sr][sc], tgt=board[r][c];
      if(!tgt||tgt.kind!=="piece") return;
      const nb=board.map(row=>[...row]); nb[sr]=[...nb[sr]]; nb[r]=[...nb[r]];
      const nc={1:[...cap[1]],2:[...cap[2]]};
      doAttack(sr,sc,r,c,nb,nc,att,tgt); return;
    }

    // ── 移動 ──
    if(sel&&moves.some(([mr,mc])=>mr===r&&mc===c)){
      const [sr,sc]=sel, piece=board[sr][sc];
      const nb=board.map(row=>[...row]); nb[sr]=[...nb[sr]]; nb[r]=[...nb[r]];
      const tc=board[r][c];

      // アイテムマスへの移動（手持ちなしのみここに到達）
      if(tc?.kind==="item"){
        sfx("move");
        nb[sr][sc] = piece._floorItem ? {kind:"item",type:piece._floorItem,id:`item-${sr}-${sc}`} : null;
        nb[r][c] = {...piece, _floorItem:undefined}; // 駒をアイテムマスに仮置き
        setSel(null); setMoves([]); setAtks([]);
        // nbSnap: 元マスnull、移動先に駒（アイテムはまだ残す）
        const nbSnap = nb.map(row=>[...row]);
        setPendItemChoice({tr:r,tc:c,piece:{...piece,_floorItem:undefined},item:tc,nbSnap});
        return;
      }

      // 通常移動（元マスに_floorItemがあればアイテムとして復元）
      nb[r][c]={...piece, _floorItem:undefined};
      nb[sr][sc] = piece._floorItem ? {kind:"item",type:piece._floorItem,id:`item-${sr}-${sc}`} : null;
      let msg=`P${cur}: (${sr+1},${sc+1})→(${r+1},${c+1})`;
      let promoted=false;
      if(isPromo(r,piece.player)&&!piece.promoted){nb[r][c]={...nb[r][c],promoted:true};msg+=" 昇格！";sfx("promote");promoted=true;}
      else sfx("move");
      setSel(null); setMoves([]); setAtks([]);

      // 手持ちがある場合 → 移動後に「結合 or キャンセル(ターン継続)」を選べる
      if(piece.handHold){
        setBoard(nb);
        setHoldingMoved({pr:r,pc:c,item:{type:piece.handHold},boardSnap:nb,msg});
        return;
      }
      endTurn(nb,null,msg); return;
    }

    // ── 駒の選択 ──
    if(cell?.kind==="piece"&&cell.player===cur){
      sfx("select"); setSel([r,c]);
      setMoves(getMoves(board,r,c,cell));
      setAtks(getAttacks(board,r,c,cell));
      return;
    }
    setSel(null);setMoves([]);setAtks([]);
  },[board,sel,moves,atks,cur,winner,cap,pendCombine,pendItemChoice,holdingMoved,deployMode,deploying,aiMode,aiThink,endTurn,doAttack,addLog,sfx]);

  // アイテム取得選択ハンドラー（アイテムマスに乗った直後）
  const handleItemChoice = (choice) => {
    if(!pendItemChoice) return;
    const {tr,tc,piece,item,nbSnap} = pendItemChoice;
    setPendItemChoice(null);
    // nbSnapは「元マスnull・移動先に駒・アイテムはまだ残る」状態
    const nb = nbSnap.map(row=>[...row]); nb[tr]=[...nb[tr]];
    let movedPiece = {...piece};
    if(isPromo(tr,piece.player)&&!piece.promoted) movedPiece={...movedPiece,promoted:true};

    if(choice==="ignore"){
      // アイテム無視 → 駒に_floorItemを持たせ（駒が離れたら通常移動で復元）
      nb[tr][tc] = {...movedPiece, _floorItem: item.type};
      endTurn(nb, null, `P${cur}: アイテム無視`);
    } else if(choice==="hold"){
      // 手持ちにしてターン終了（アイテムをボードから除去）
      nb[tr][tc] = {...movedPiece, handHold:item.type};
      endTurn(nb, null, `P${cur}: ${item.type}を手持ちにしてターン終了`);
    } else if(choice==="combine"){
      const p=applyEquip({...movedPiece},item);
      const ok=p.weapon!==movedPiece.weapon||p.vehicle!==movedPiece.vehicle||JSON.stringify(p.equip)!==JSON.stringify(movedPiece.equip);
      if(ok){ nb[tr][tc]=p; sfx("combine"); endTurn(nb,null,`P${cur}: ${item.type}を結合`); }
      else { nb[tr][tc]=movedPiece; addLog("スロット満杯"); endTurn(nb,null,`P${cur}: スロット満杯`); }
    }
  };

  // 手持ち駒が移動後「結合 or キャンセル」ハンドラー
  const handleHoldingMoved = (choice) => {
    if(!holdingMoved) return;
    const {pr,pc,item,boardSnap,msg} = holdingMoved;
    setHoldingMoved(null);
    if(choice==="combine"){
      const nb=boardSnap.map(row=>[...row]); nb[pr]=[...nb[pr]];
      const piece=nb[pr][pc];
      const p=applyEquip({...piece},item);
      const ok=p.weapon!==piece.weapon||p.vehicle!==piece.vehicle||JSON.stringify(p.equip)!==JSON.stringify(piece.equip);
      if(ok){nb[pr][pc]=p;sfx("combine");endTurn(nb,null,msg+` → ${item.type}結合`);}
      else{addLog("スロット満杯");endTurn(boardSnap,null,msg);}
    } else {
      // キャンセル → ターン継続（手持ちのまま、他の駒も選択可能）
      setBoard(boardSnap);
      setSel(null); setMoves([]); setAtks([]);
      addLog("結合キャンセル — 別の行動を選べます");
    }
  };

  // 手持ち駒で「結合のみ」アクション（移動なし）ハンドラー
  const handleCombineOnly = () => {
    if(!sel) return;
    const [sr,sc]=sel;
    const piece=board[sr][sc];
    if(!piece?.handHold) return;
    const item={type:piece.handHold};
    const nb=board.map(row=>[...row]); nb[sr]=[...nb[sr]];
    const p=applyEquip({...piece},item);
    const ok=p.weapon!==piece.weapon||p.vehicle!==piece.vehicle||JSON.stringify(p.equip)!==JSON.stringify(piece.equip);
    setSel(null);setMoves([]);setAtks([]);
    if(ok){nb[sr][sc]=p;sfx("combine");endTurn(nb,null,`P${cur}: ${item.type}を結合（移動なし）`);}
    else{addLog("スロット満杯");}
  };

  const reset=()=>{
    setBoard(createInitialBoard());setCur(1);setSel(null);setMoves([]);setAtks([]);
    setCap({1:[],2:[]});setLog(["ゲームリセット！P1のターン"]);
    setWinner(null);setDrawRes(null);setPendCombine(null);setTurn(1);
    setDeployMode(false);setDeploying(null);setAiThink(false);setPendItemChoice(null);setHoldingMoved(null);
  };

  const turnPct=Math.min((turn/50)*100,100);
  const barColor=turnPct<60?"#4aaa88":turnPct<80?"#ccaa44":"#cc4444";

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a0500 0%,#180c00 60%,#0a0500 100%)",display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"'Noto Serif JP','Georgia',serif",color:"#f0d9a0",padding:"10px 6px",gap:8}}>

      {/* Title */}
      <div style={{textAlign:"center"}}>
        <h1 style={{margin:0,fontSize:24,letterSpacing:"0.25em",color:"#ffd700",textShadow:"0 2px 12px #ff8800"}}>組将棋</h1>
        <div style={{fontSize:10,opacity:0.5}}>KUMI SHOGI v0.2</div>
      </div>

      {/* Controls */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center"}}>
        <button onClick={()=>setSoundOn(s=>!s)} style={btn(soundOn?"#ffd700":"#555")}>{soundOn?"🔊 音ON":"🔇 音OFF"}</button>
        <button onClick={()=>{setAiMode(m=>{const nm=!m;return nm;});reset();}} style={btn(aiMode?"#ff9900":"#666")}>{aiMode?"🤖 AI対戦中":"👥 2人対戦"}</button>
        <button onClick={reset} style={btn("#cc5500")}>🔄 リセット</button>
      </div>

      {/* 50-turn progress bar */}
      <div style={{width:"min(440px,94vw)"}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,opacity:0.6,marginBottom:2}}>
          <span>ターン進行</span><span>{turn}/50{turn>50?" (引き分け判定済み)":""}</span>
        </div>
        <div style={{background:"rgba(255,255,255,0.07)",borderRadius:5,height:7,overflow:"hidden"}}>
          <div style={{width:`${turnPct}%`,height:"100%",background:barColor,transition:"width 0.3s,background 0.5s"}}/>
        </div>
      </div>

      {/* Status */}
      <div style={{
        background:winner?"rgba(140,100,0,0.4)":(cur===1?"rgba(30,70,200,0.35)":"rgba(200,30,30,0.35)"),
        border:`2px solid ${winner?"#ffd700":(cur===1?"#5599ff":"#ff5555")}`,
        borderRadius:7,padding:"5px 16px",fontSize:13,fontWeight:"bold",textAlign:"center",
      }}>
        {winner==="draw"?(drawRes?.winner?`⏱ ${drawRes.reason} — P${drawRes.winner}の勝利！`:`⏱ ${drawRes?.reason||"引き分け"}`):
         winner?`🎉 P${winner}の勝利！`:
         aiThink?"🤖 AI思考中...":
         deployMode?`P${cur}: ホームベースに配置`:
         pendItemChoice?`${ITEM_EMOJI[pendItemChoice.item.type]} アイテムをどうする？`:
         holdingMoved?`${ITEM_EMOJI[holdingMoved.item.type]} 移動完了 — 結合する？`:
         `ターン${turn} — ${aiMode&&cur===2?"AI":"P"+cur}の番`}
      </div>

      {/* 手持ち駒選択中：「その場で結合」ボタン — 盤面オーバーレイで表示 */}
      {false&&null}

      {/* モーダルオーバーレイ */}
      {(pendItemChoice||holdingMoved)&&(
        <div style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",
          display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,
        }}>
          {/* アイテムマスに乗った直後の選択 */}
          {pendItemChoice&&(
            <div style={{
              background:"linear-gradient(160deg,#1a0c00,#2a1500)",
              border:"2px solid #ffd700",borderRadius:12,padding:"20px 28px",
              textAlign:"center",minWidth:230,boxShadow:"0 8px 32px rgba(0,0,0,0.9)",
            }}>
              <div style={{fontSize:36,marginBottom:4}}>{ITEM_EMOJI[pendItemChoice.item.type]}</div>
              <div style={{fontSize:14,color:"#ffd700",fontWeight:"bold",marginBottom:2}}>{pendItemChoice.item.type}</div>
              <div style={{fontSize:11,opacity:0.65,marginBottom:14}}>アイテムをどうしますか？</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {canEquip(pendItemChoice.piece, pendItemChoice.item) ? <>
                  <button onClick={()=>handleItemChoice("combine")} style={btn("#ffd700",{padding:"9px 0",fontSize:12,width:"100%"})}>⚡ 即時結合してターン終了</button>
                  <button onClick={()=>handleItemChoice("hold")}    style={btn("#88ccff",{padding:"9px 0",fontSize:12,width:"100%"})}>✋ 手持ちにしてターン終了</button>
                </> : <div style={{fontSize:11,opacity:0.6,marginBottom:4}}>スロット満杯 — 取得不可</div>}
                <button onClick={()=>handleItemChoice("ignore")}  style={btn("#888",   {padding:"9px 0",fontSize:12,width:"100%"})}>🚫 無視してターン終了</button>
              </div>
            </div>
          )}
          {/* 手持ち駒が移動後：結合 or キャンセル */}
          {holdingMoved&&(
            <div style={{
              background:"linear-gradient(160deg,#1a0c00,#2a1500)",
              border:"2px solid #88ccff",borderRadius:12,padding:"20px 28px",
              textAlign:"center",minWidth:230,boxShadow:"0 8px 32px rgba(0,0,0,0.9)",
            }}>
              <div style={{fontSize:36,marginBottom:4}}>{ITEM_EMOJI[holdingMoved.item.type]}</div>
              <div style={{fontSize:14,color:"#88ccff",fontWeight:"bold",marginBottom:2}}>{holdingMoved.item.type}（手持ち中）</div>
              <div style={{fontSize:11,opacity:0.65,marginBottom:14}}>移動しました。手持ちを結合しますか？</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <button onClick={()=>handleHoldingMoved("combine")} style={btn("#ffd700",{padding:"9px 0",fontSize:12,width:"100%"})}>⚡ 結合してターン終了</button>
                <button onClick={()=>handleHoldingMoved("cancel")}  style={btn("#aaa",   {padding:"9px 0",fontSize:12,width:"100%"})}>✖ キャンセル（別の行動を選ぶ）</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* アイテム取得選択モーダル (legacy placeholder) */}


      <div style={{display:"flex",gap:8,alignItems:"flex-start",flexWrap:"wrap",justifyContent:"center"}}>

        {/* Board */}
        <div style={{position:"relative"}}>
          {/* 手持ち結合ボタン：選択駒の上に浮かせる */}
          {sel&&!holdingMoved&&!pendItemChoice&&(()=>{
            const p=board[sel[0]]?.[sel[1]];
            if(!p?.handHold) return null;
            const [sr,sc]=sel;
            // セルサイズ44px、行ラベル20px分オフセット
            const top = sr*44 + 22 + 2; // 行ラベル20px + border
            const left = sc*44 + 20;
            return(
              <div style={{
                position:"absolute", top, left,
                zIndex:50, pointerEvents:"auto",
                display:"flex",flexDirection:"column",alignItems:"center",gap:3,
              }}>
                <div style={{
                  background:"rgba(10,5,0,0.92)",border:"2px solid #ffd700",
                  borderRadius:8,padding:"7px 12px",textAlign:"center",
                  boxShadow:"0 4px 16px rgba(0,0,0,0.8)",whiteSpace:"nowrap",
                }}>
                  <div style={{fontSize:11,color:"#ffd700",marginBottom:5}}>
                    {ITEM_EMOJI[p.handHold]} 手持ち：{p.handHold}
                  </div>
                  <button onClick={handleCombineOnly} style={btn("#ffd700",{padding:"5px 10px",fontSize:11,width:"100%"})}>
                    ⚡ その場で結合してターン終了
                  </button>
                </div>
              </div>
            );
          })()}
          <div style={{display:"flex",marginLeft:20}}>
            {Array.from({length:COLS},(_,c)=><div key={c} style={{width:44,textAlign:"center",fontSize:9,opacity:0.45}}>{c+1}</div>)}
          </div>
          {board.map((row,r)=>{
            const zone=r<=2?"rgba(200,30,30,0.11)":r>=10?"rgba(30,80,200,0.11)":(r>=4&&r<=8)?"rgba(30,180,30,0.07)":"rgba(255,255,255,0.02)";
            return(
              <div key={r} style={{display:"flex",alignItems:"center"}}>
                <div style={{width:17,textAlign:"right",fontSize:9,opacity:0.45,marginRight:2}}>{r+1}</div>
                {row.map((cell,c)=>{
                  const isSel=sel&&sel[0]===r&&sel[1]===c;
                  const isMove=moves.some(([mr,mc])=>mr===r&&mc===c);
                  const isAtk=atks.some(([ar,ac])=>ar===r&&ac===c);
                  let bg=zone;
                  if(isSel) bg="rgba(255,215,0,0.38)";
                  else if(isAtk) bg="rgba(255,60,60,0.42)";
                  else if(isMove) bg="rgba(70,210,70,0.33)";
                  const clickable=isMove||isAtk||(cell?.kind==="piece"&&cell.player===cur&&!aiThink&&!(aiMode&&cur===2));
                  return(
                    <div key={c} onClick={()=>handleClick(r,c)} style={{
                      width:44,height:44,border:"1px solid rgba(160,110,50,0.28)",background:bg,
                      cursor:clickable?"pointer":"default",display:"flex",alignItems:"center",
                      justifyContent:"center",transition:"background 0.1s",boxSizing:"border-box",
                    }}>
                      {isMove&&!cell&&<div style={{width:7,height:7,borderRadius:"50%",background:"rgba(70,210,70,0.85)"}}/>}
                      {cell?.kind==="item"&&(
                        <div style={{textAlign:"center",lineHeight:1.1}}>
                          <div style={{fontSize:17}}>{ITEM_EMOJI[cell.type]}</div>
                          <div style={{fontSize:6,opacity:0.65}}>{cell.type.slice(0,3)}</div>
                        </div>
                      )}
                      {cell?.kind==="piece"&&(
                        <div style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
                          {cell._floorItem&&(
                            <div style={{position:"absolute",fontSize:10,opacity:0.4,top:0,right:0}}>{ITEM_EMOJI[cell._floorItem]}</div>
                          )}
                          <div style={{
                            background:cell.player===1?"rgba(25,70,200,0.72)":"rgba(200,25,25,0.72)",
                            border:`2px solid ${cell.player===1?"#4488ee":"#ee6666"}`,
                            borderRadius:5,padding:"1px 2px",minWidth:36,textAlign:"center",
                            boxShadow:isSel?"0 0 8px #ffd700,0 0 2px #fff":"none",
                          }}>
                            <PieceDisplay piece={cell}/>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>{/* end board relative wrapper */}

        {/* Side panel */}
        <div style={{display:"flex",flexDirection:"column",gap:7,width:158}}>

          {/* Captured */}
          {[1,2].map(p=>(
            <div key={p} style={{background:"rgba(255,255,255,0.04)",borderRadius:6,padding:7,fontSize:11}}>
              <div style={{fontWeight:"bold",color:p===1?"#5599ff":"#ff7777",marginBottom:3}}>
                P{p}{aiMode&&p===2?" (AI)":""} 捕虜
              </div>
              {cap[p].length===0?<span style={{opacity:0.4}}>なし</span>:
                cap[p].map(s=>(
                  <button key={s.id} onClick={()=>cur===p&&!winner&&!(aiMode&&p===2)&&(setDeployMode(true),setDeploying(s),setSel(null),addLog("ホームベースに配置するマスを選んでください"))}
                    disabled={cur!==p||!!winner||(aiMode&&p===2)}
                    style={{...btn("#aa8800",{padding:"2px 6px",fontSize:10,margin:"2px 2px 0 0"})}}>
                    🪆配置
                  </button>
                ))
              }
            </div>
          ))}

          {/* Items legend */}
          <div style={{background:"rgba(255,255,255,0.03)",borderRadius:6,padding:7,fontSize:10}}>
            <div style={{color:"#ffd700",marginBottom:3,fontWeight:"bold"}}>アイテム一覧</div>
            {Object.entries(ITEM_EMOJI).map(([k,v])=><div key={k} style={{opacity:0.75,marginBottom:1}}>{v} {k}</div>)}
            <div style={{marginTop:5,opacity:0.5,fontSize:9}}>緑●移動可 / 赤背景攻撃可</div>
          </div>

          {/* Log */}
          <div style={{background:"rgba(0,0,0,0.32)",borderRadius:6,padding:7,fontSize:10,maxHeight:175,overflowY:"auto"}}>
            <div style={{color:"#ffd700",marginBottom:3,fontWeight:"bold"}}>ログ</div>
            {log.map((l,i)=>(
              <div key={i} style={{opacity:Math.max(0.3,1-i*0.055),marginBottom:1,lineHeight:1.45}}>{l}</div>
            ))}
          </div>

          {/* AI difficulty label */}
          {aiMode&&<div style={{fontSize:10,opacity:0.5,textAlign:"center"}}>AI: 貪欲ヒューリスティック</div>}
        </div>
      </div>
    </div>
  );
}
