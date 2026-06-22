'use client';

import { useEffect, useRef } from 'react';

// ── types ─────────────────────────────────────────────────────────────────────
interface Vec2      { x: number; y: number }
interface Star      { x: number; y: number; size: number; bright: number }
interface Blob      { id: number; pos: Vec2; radius: number; hp: number; maxHp: number }
interface Boss      { id: number; pos: Vec2; radius: number; hp: number; maxHp: number }
interface XpOrb     { id: number; pos: Vec2 }
interface Explosion { id: number; pos: Vec2; age: number; maxR: number }
interface Bullet    { id: number; pos: Vec2; vel: Vec2; pierceLeft: number; bounceLeft: number; explodeR: number }
interface WeaponStats { fireInterval: number; multiShot: number; explodeR: number; piercing: number; bouncing: number }
interface PlayerStats { hp: number; maxHp: number; armor: number; regen: number; speed: number }
interface Upgrade    { id: string; name: string; desc: string }
interface Difficulty { id: string; name: string; desc: string; color: string; hpMult: number; spdMult: number; dmgMult: number; spawnMult: number }

type GameState = 'start' | 'playing' | 'upgrading' | 'between_stage' | 'game_over';

// ── upgrade pools ─────────────────────────────────────────────────────────────
const WEAPON_UPS: Upgrade[] = [
  { id: 'rapid',     name: 'RAPID FIRE',       desc: 'Fire rate +33%' },
  { id: 'multi',     name: 'MULTI SHOT',        desc: '+2 extra bullets' },
  { id: 'explosive', name: 'EXPLOSIVE ROUNDS',  desc: 'Bullets explode on impact (+60r)' },
  { id: 'piercing',  name: 'PIERCING SHOT',     desc: 'Bullets pierce +2 enemies' },
  { id: 'bouncing',  name: 'BOUNCING SHOT',     desc: 'Bullets bounce to next enemy' },
];
const BASE_UPS: Upgrade[] = [
  { id: 'max_hp', name: 'MAX HEALTH',  desc: '+25 max HP  ·  full restore' },
  { id: 'regen',  name: 'HP REGEN',    desc: '+1.5 HP per second' },
  { id: 'speed',  name: 'MOVE SPEED',  desc: 'Ship speed +15%' },
  { id: 'armor',  name: 'ARMOR',       desc: '-10% incoming damage' },
];

const DIFFICULTIES: Difficulty[] = [
  { id: 'easy',      name: 'CADET',     desc: 'Enemies weaker · slower spawns',  color: '#00bb44', hpMult: 0.6,  spdMult: 0.75, dmgMult: 0.6,  spawnMult: 1.4  },
  { id: 'normal',    name: 'PILOT',     desc: 'Standard · intended experience',  color: '#0088ff', hpMult: 1.0,  spdMult: 1.0,  dmgMult: 1.0,  spawnMult: 1.0  },
  { id: 'hard',      name: 'COMMANDER', desc: 'Harder enemies · faster spawns',  color: '#ff8800', hpMult: 1.5,  spdMult: 1.3,  dmgMult: 1.4,  spawnMult: 0.75 },
  { id: 'nightmare', name: 'ADMIRAL',   desc: 'Maximum chaos · good luck',       color: '#ff2200', hpMult: 2.5,  spdMult: 1.7,  dmgMult: 2.0,  spawnMult: 0.5  },
];

// ── stage palettes ────────────────────────────────────────────────────────────
const PALETTES = [
  { blob: '#cc0000', glow: '#ff4444', bg: '#04040f' },  // 1  red
  { blob: '#bb5500', glow: '#ff8833', bg: '#0a0503' },  // 2  orange
  { blob: '#999900', glow: '#ffee00', bg: '#080800' },  // 3  yellow
  { blob: '#006600', glow: '#00ff44', bg: '#020802' },  // 4  green
  { blob: '#006688', glow: '#00ddff', bg: '#020809' },  // 5  cyan
  { blob: '#0000aa', glow: '#4455ff', bg: '#020208' },  // 6  blue
  { blob: '#660099', glow: '#bb44ff', bg: '#060209' },  // 7  purple
  { blob: '#990055', glow: '#ff44aa', bg: '#080206' },  // 8  pink
  { blob: '#774400', glow: '#ffaa00', bg: '#060400' },  // 9  amber
  { blob: '#880000', glow: '#ff0000', bg: '#090000' },  // 10 crimson
];

// ── pure helpers ──────────────────────────────────────────────────────────────
function d2(a: Vec2, b: Vec2) { const dx = a.x-b.x, dy = a.y-b.y; return dx*dx+dy*dy; }
function d(a: Vec2, b: Vec2)  { return Math.sqrt(d2(a, b)); }
function makeStars(w: number, h: number): Star[] {
  return Array.from({ length: 130 }, () => ({
    x: Math.random()*w, y: Math.random()*h,
    size: Math.random()*1.5+0.3, bright: Math.random()*0.6+0.4,
  }));
}
function pickN<T>(pool: T[], n: number): T[] {
  return [...pool].sort(() => Math.random()-0.5).slice(0, n);
}
function applyWeapon(id: string, w: WeaponStats) {
  if (id === 'rapid')     w.fireInterval  = Math.max(0.07, w.fireInterval * 0.67);
  if (id === 'multi')     w.multiShot     = Math.min(w.multiShot + 2, 8);
  if (id === 'explosive') w.explodeR     += 60;
  if (id === 'piercing')  w.piercing     += 2;
  if (id === 'bouncing')  w.bouncing      = Math.min(w.bouncing + 1, 3);
}
function applyBase(id: string, p: PlayerStats) {
  if (id === 'max_hp') { p.maxHp += 25; p.hp = p.maxHp; }
  if (id === 'regen')  { p.regen += 1.5; }
  if (id === 'speed')  { p.speed  = Math.min(0.35, p.speed * 1.15); }
  if (id === 'armor')  { p.armor  = Math.min(0.5, p.armor + 0.1); }
}

// ── component ─────────────────────────────────────────────────────────────────
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    // resize
    let stars: Star[] = [];
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      stars = makeStars(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    // ── persistent state (survives stage transitions) ──────────────────────
    let stage  = 1;
    const player: PlayerStats = { hp: 100, maxHp: 100, armor: 0, regen: 0, speed: 0.14 };
    const weapon: WeaponStats = { fireInterval: 0.28, multiShot: 0, explodeR: 0, piercing: 0, bouncing: 0 };
    let xp = 0, level = 0, xpToNext = 12;

    // ── per-stage state ────────────────────────────────────────────────────
    let blobs:      Blob[]      = [];
    let boss:       Boss | null = null;
    let bullets:    Bullet[]    = [];
    let xpOrbs:     XpOrb[]     = [];
    let explosions: Explosion[]  = [];
    let uid        = 0;
    let spawnTimer = 0;
    let fireTimer  = 0;
    let gameTime   = 0;
    let killCount  = 0;
    let invTimer   = 0;  // invincibility after hit
    let damageFlash = 0;

    // ── UI state ───────────────────────────────────────────────────────────
    let gameState: GameState = 'start';
    let difficulty: Difficulty = DIFFICULTIES[1];
    let weaponChoices: Upgrade[] = [];
    let baseChoices:   Upgrade[] = [];

    const mouse: Vec2 = { x: canvas.width/2, y: canvas.height/2 };
    const ship:  Vec2 = { x: canvas.width/2, y: canvas.height/2 };

    // ── stage scaling ──────────────────────────────────────────────────────
    function killsNeeded() { return 20 + (stage-1) * 5; }
    function blobHp()      { return Math.max(1, Math.round((3  + (stage-1) * 2)  * difficulty.hpMult)); }
    function blobSpd()     { return (70 + (stage-1) * 8)  * difficulty.spdMult; }
    function bossHp()      { return Math.max(5, Math.round((30 + (stage-1) * 20) * difficulty.hpMult)); }
    function spawnBase()   { return Math.max(0.3, (1.8 - (stage-1) * 0.12) * difficulty.spawnMult); }
    function palette()     { return PALETTES[Math.min(stage-1, PALETTES.length-1)]; }
    function contactDmg()  { return (12 + (stage-1) * 3) * difficulty.dmgMult; }

    // ── card layout ────────────────────────────────────────────────────────
    // difficulty select (responsive: 2×2 on narrow screens, 1×4 on wide)
    function diffLayout() {
      const W = canvas.width, twoRow = W < 650;
      const cols = twoRow ? 2 : 4;
      const cw   = twoRow ? Math.min(155, (W-48)/2) : Math.min(168, (W-60)/4);
      const ch   = 155;
      const gapX = twoRow ? (W - 2*cw)/3 : (W - 4*cw)/5;
      return { cols, cw, ch, gapX, gapY: 18 };
    }
    function dCardX(i: number) { const { cols, cw, gapX } = diffLayout(); return gapX + (i%cols)*(cw+gapX); }
    function dCardY(i: number) { const { cols, ch, gapY } = diffLayout(); return canvas.height*0.42 + Math.floor(i/cols)*(ch+gapY); }

    const CW = 200, CH = 130, CG = 28;
    function wCardX(i: number) { return (canvas.width-(3*CW+2*CG))/2 + i*(CW+CG); }
    function wCardY()          { return canvas.height/2 - 55; }

    const BCW = 165, BCH = 148, BCG = 18;
    function bCardX(i: number) { return (canvas.width-(4*BCW+3*BCG))/2 + i*(BCW+BCG); }
    function bCardY()          { return canvas.height/2 - 50; }

    // ── input ──────────────────────────────────────────────────────────────
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    };
    const onTouchStart = (e: TouchEvent) => {
      const r = canvas.getBoundingClientRect(), t = e.touches[0];
      mouse.x = t.clientX - r.left; mouse.y = t.clientY - r.top;
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // block page scroll while playing
      const r = canvas.getBoundingClientRect(), t = e.touches[0];
      mouse.x = t.clientX - r.left; mouse.y = t.clientY - r.top;
    };
    const onClick = (e: MouseEvent) => {
      const r  = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;

      if (gameState === 'start') {
        const { cw, ch } = diffLayout();
        for (let i = 0; i < DIFFICULTIES.length; i++) {
          const cx = dCardX(i), cy = dCardY(i);
          if (mx >= cx && mx <= cx+cw && my >= cy && my <= cy+ch) {
            difficulty = DIFFICULTIES[i];
            gameState  = 'playing';
            canvas.style.cursor = 'none';
          }
        }
      } else if (gameState === 'upgrading') {
        const cy = wCardY();
        for (let i = 0; i < weaponChoices.length; i++) {
          const cx = wCardX(i);
          if (mx >= cx && mx <= cx+CW && my >= cy && my <= cy+CH) {
            applyWeapon(weaponChoices[i].id, weapon);
            gameState = 'playing';
            canvas.style.cursor = 'none';
          }
        }
      } else if (gameState === 'between_stage') {
        const cy = bCardY();
        for (let i = 0; i < baseChoices.length; i++) {
          const cx = bCardX(i);
          if (mx >= cx && mx <= cx+BCW && my >= cy && my <= cy+BCH) {
            applyBase(baseChoices[i].id, player);
            startNextStage();
          }
        }
      } else if (gameState === 'game_over') {
        restartGame();
      }
    };

    canvas.addEventListener('mousemove',  onMove);
    canvas.addEventListener('click',      onClick);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });

    // ── game logic ─────────────────────────────────────────────────────────
    function nearestBlob(from: Vec2, exclude?: Set<number>): Blob | null {
      let best: Blob | null = null, bestD = Infinity;
      for (const b of blobs) {
        if (exclude?.has(b.id)) continue;
        const dist = d2(from, b.pos);
        if (dist < bestD) { bestD = dist; best = b; }
      }
      return best;
    }

    function spawnBlob() {
      if (boss || killCount >= killsNeeded()) return;
      const side = Math.floor(Math.random()*4);
      const m = 24, W = canvas.width, H = canvas.height;
      const pos: Vec2 =
        side === 0 ? { x: Math.random()*W, y: -m } :
        side === 1 ? { x: W+m,             y: Math.random()*H } :
        side === 2 ? { x: Math.random()*W, y: H+m } :
                     { x: -m,              y: Math.random()*H };
      const hp = blobHp();
      blobs.push({ id: uid++, pos, radius: 14, hp, maxHp: hp });
    }

    function spawnBoss() {
      const hp = bossHp();
      boss = { id: uid++, pos: { x: canvas.width/2, y: -70 }, radius: 52, hp, maxHp: hp };
    }

    function fireBullet() {
      const nb = nearestBlob(ship);
      const tgt: Vec2 | null = nb ? nb.pos : boss ? boss.pos : null;
      if (!tgt) return;
      const dx = tgt.x - ship.x, dy = tgt.y - ship.y;
      const base = Math.atan2(dy, dx);
      const count  = 1 + weapon.multiShot;
      const spread = weapon.multiShot > 0 ? 0.18 : 0;
      const half   = spread * (count-1) / 2;
      const spd    = 520;
      for (let i = 0; i < count; i++) {
        const a = base - half + spread*i;
        bullets.push({
          id: uid++, pos: { x: ship.x, y: ship.y },
          vel: { x: Math.cos(a)*spd, y: Math.sin(a)*spd },
          pierceLeft: weapon.piercing, bounceLeft: weapon.bouncing, explodeR: weapon.explodeR,
        });
      }
    }

    function damagePlayer(amount: number) {
      if (invTimer > 0) return;
      const eff = amount * (1 - player.armor);
      player.hp = Math.max(0, player.hp - eff);
      invTimer    = 0.5;
      damageFlash = 1;
      if (player.hp <= 0) { gameState = 'game_over'; canvas.style.cursor = 'default'; }
    }

    function levelUp() {
      level++;
      xpToNext    = 12 + level * 10;
      gameState   = 'upgrading';
      weaponChoices = pickN(WEAPON_UPS, 3);
      fireTimer   = 0;
      canvas.style.cursor = 'default';
    }
    function addXp(n: number) {
      xp += n;
      while (xp >= xpToNext) { xp -= xpToNext; levelUp(); }
    }

    function startNextStage() {
      stage++;
      blobs = []; boss = null; bullets = []; xpOrbs = []; explosions = [];
      killCount = 0; spawnTimer = 0; fireTimer = 0; gameTime = 0; invTimer = 0;
      // partial heal between stages
      player.hp   = Math.min(player.maxHp, player.hp + player.maxHp * 0.35);
      gameState   = 'playing';
      canvas.style.cursor = 'none';
    }

    function restartGame() {
      stage  = 1;
      player.hp = 100; player.maxHp = 100; player.armor = 0; player.regen = 0; player.speed = 0.14;
      weapon.fireInterval = 0.28; weapon.multiShot = 0; weapon.explodeR = 0; weapon.piercing = 0; weapon.bouncing = 0;
      xp = 0; level = 0; xpToNext = 12;
      blobs = []; boss = null; bullets = []; xpOrbs = []; explosions = [];
      killCount = 0; spawnTimer = 0; fireTimer = 0; gameTime = 0; invTimer = 0; damageFlash = 0;
      gameState = 'start';
      canvas.style.cursor = 'default';
    }

    // ── draw functions ─────────────────────────────────────────────────────
    function drawStars() {
      for (const s of stars) {
        ctx.globalAlpha = s.bright;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
      ctx.globalAlpha = 1;
    }

    function drawShip(angle: number) {
      ctx.save();
      ctx.translate(ship.x, ship.y); ctx.rotate(angle);
      ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 14; ctx.fillStyle = '#ff6600';
      ctx.beginPath(); ctx.ellipse(0, 10, 4, 6, 0, 0, Math.PI*2); ctx.fill();
      ctx.shadowColor = '#00ffaa'; ctx.shadowBlur = 10; ctx.fillStyle = '#00ffaa';
      ctx.beginPath();
      ctx.moveTo(0,-15); ctx.lineTo(10,12); ctx.lineTo(0,6); ctx.lineTo(-10,12);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#aaffdd'; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.ellipse(0,-4,3,5,0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }

    function drawBlob(b: Blob) {
      const pal = palette();
      const hr  = b.hp / b.maxHp;
      ctx.save();
      ctx.translate(b.pos.x, b.pos.y);
      ctx.shadowColor = pal.glow; ctx.shadowBlur = 12;
      ctx.fillStyle   = pal.blob;
      ctx.globalAlpha = 0.5 + 0.5 * hr;
      ctx.beginPath(); ctx.arc(0,0,b.radius,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = '#ffcccc';
      ctx.beginPath();
      ctx.arc(-b.radius*0.28,-b.radius*0.1, b.radius*0.15, 0, Math.PI*2);
      ctx.arc( b.radius*0.28,-b.radius*0.1, b.radius*0.15, 0, Math.PI*2);
      ctx.fill();
      if (b.hp < b.maxHp) {
        const bw = b.radius*2, bx = -b.radius, by = -b.radius-6;
        ctx.fillStyle = '#330000'; ctx.fillRect(bx, by, bw, 3);
        ctx.fillStyle = '#ff3300'; ctx.fillRect(bx, by, bw*hr, 3);
      }
      ctx.restore();
    }

    function drawBoss(b: Boss) {
      const hr    = b.hp / b.maxHp;
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.004);
      ctx.save();
      ctx.translate(b.pos.x, b.pos.y);
      ctx.shadowColor = '#cc00ff'; ctx.shadowBlur = 20 + pulse*20;
      ctx.fillStyle   = '#550077';
      ctx.beginPath(); ctx.arc(0,0,b.radius,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#8800aa';
      ctx.beginPath(); ctx.arc(-b.radius*0.18,-b.radius*0.18, b.radius*0.55, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#aa00cc'; ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        const a = (i/8)*Math.PI*2 + Date.now()*0.0008;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a)*b.radius*0.85, Math.sin(a)*b.radius*0.85);
        ctx.lineTo(Math.cos(a)*(b.radius+14+pulse*6), Math.sin(a)*(b.radius+14+pulse*6));
        ctx.stroke();
      }
      ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 10; ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(-b.radius*0.28,-b.radius*0.1, b.radius*0.16, 0, Math.PI*2);
      ctx.arc( b.radius*0.28,-b.radius*0.1, b.radius*0.16, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#ff8800';
      ctx.beginPath();
      ctx.arc(-b.radius*0.28,-b.radius*0.06, b.radius*0.07, 0, Math.PI*2);
      ctx.arc( b.radius*0.28,-b.radius*0.06, b.radius*0.07, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      // boss HP bar (top of screen)
      const W = canvas.width;
      const barW = Math.min(520, W*0.55), barX = (W-barW)/2, barY = 18;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#dd88ff'; ctx.shadowColor = '#aa00ff'; ctx.shadowBlur = 10;
      ctx.font = 'bold 12px "Courier New",monospace';
      ctx.fillText(`— BOSS  STAGE ${stage} —`, W/2, barY-4);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#1a001a'; ctx.fillRect(barX, barY, barW, 16);
      const bg = ctx.createLinearGradient(barX, 0, barX+barW, 0);
      bg.addColorStop(0, '#660099'); bg.addColorStop(1, '#ff00ff');
      ctx.fillStyle = bg; ctx.fillRect(barX, barY, barW*hr, 16);
      ctx.strokeStyle = '#440044'; ctx.lineWidth = 1; ctx.strokeRect(barX, barY, barW, 16);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 10px "Courier New",monospace';
      ctx.fillText(`${b.hp} / ${b.maxHp}`, W/2, barY+12);
      ctx.textAlign = 'left';
    }

    function drawBullet(b: Bullet) {
      ctx.save();
      const ang = Math.atan2(b.vel.y, b.vel.x) + Math.PI/2;
      ctx.translate(b.pos.x, b.pos.y); ctx.rotate(ang);
      const isExp = b.explodeR > 0;
      ctx.shadowColor = isExp ? '#ff8800' : '#ffff44'; ctx.shadowBlur = 8;
      ctx.fillStyle   = isExp ? '#ff6600' : '#ffff00';
      ctx.fillRect(-2,-7,4,14);
      ctx.restore();
    }

    function drawOrb(o: XpOrb) {
      ctx.save();
      ctx.translate(o.pos.x, o.pos.y);
      ctx.shadowColor = '#44ff88'; ctx.shadowBlur = 10; ctx.fillStyle = '#00ee66';
      ctx.beginPath(); ctx.arc(0,0,5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#aaffcc'; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(-1.5,-1.5,2,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }

    function drawExplosion(e: Explosion) {
      const t = Math.min(e.age/0.45, 1), r = t*e.maxR;
      ctx.save();
      ctx.globalAlpha = (1-t)*0.65;
      ctx.strokeStyle = '#ff8800'; ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 20; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, r, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = (1-t)*0.18; ctx.fillStyle = '#ff6600';
      ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, r, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    function drawHud() {
      const W = canvas.width, H = canvas.height;

      // stage label (top center, subtle)
      ctx.textAlign = 'center'; ctx.fillStyle = '#223344';
      ctx.font = '10px "Courier New",monospace';
      ctx.fillText(`STAGE  ${stage} / 10`, W/2, 10);

      // XP bar (bottom center)
      const barW = Math.min(420, W*0.5), barX = (W-barW)/2, barY = H-30;
      ctx.fillStyle = '#0a1a0a'; ctx.fillRect(barX, barY, barW, 14);
      const xpG = ctx.createLinearGradient(barX, 0, barX+barW, 0);
      xpG.addColorStop(0,'#00aa44'); xpG.addColorStop(1,'#00ff88');
      ctx.fillStyle = xpG; ctx.fillRect(barX, barY, barW*(xp/xpToNext), 14);
      ctx.strokeStyle = '#224422'; ctx.lineWidth = 1; ctx.strokeRect(barX, barY, barW, 14);
      ctx.fillStyle = '#88cc88'; ctx.font = '11px "Courier New",monospace'; ctx.textAlign = 'center';
      ctx.fillText(`LVL ${level}   XP ${xp} / ${xpToNext}`, W/2, barY-5);

      // HP bar (bottom left)
      const hpW = 180, hpX = 12, hpY = H-54;
      const hpRatio = player.hp / player.maxHp;
      ctx.fillStyle = '#1a0000'; ctx.fillRect(hpX, hpY, hpW, 14);
      const hpG = ctx.createLinearGradient(hpX, 0, hpX+hpW, 0);
      hpG.addColorStop(0, hpRatio < 0.3 ? '#ff0000' : '#cc0000');
      hpG.addColorStop(1, hpRatio < 0.3 ? '#ff4400' : '#ff4444');
      ctx.fillStyle = hpG; ctx.fillRect(hpX, hpY, hpW*hpRatio, 14);
      ctx.strokeStyle = '#440000'; ctx.lineWidth = 1; ctx.strokeRect(hpX, hpY, hpW, 14);
      ctx.textAlign = 'left'; ctx.fillStyle = '#cc8888'; ctx.font = '10px "Courier New",monospace';
      ctx.fillText(`HP  ${Math.ceil(player.hp)} / ${player.maxHp}`, hpX, hpY-4);
      if (player.armor > 0 || player.regen > 0) {
        ctx.fillStyle = '#445566'; ctx.font = '9px "Courier New",monospace';
        const extras: string[] = [];
        if (player.armor > 0) extras.push(`ARM ${Math.round(player.armor*100)}%`);
        if (player.regen > 0) extras.push(`REG ${player.regen.toFixed(1)}/s`);
        ctx.fillText(extras.join('  '), hpX, hpY+26);
      }

      // weapon readout (top left)
      ctx.textAlign = 'left'; ctx.font = '10px "Courier New",monospace';
      [
        `FIRE  ${(1/weapon.fireInterval).toFixed(1)}/s`,
        `MULTI ${weapon.multiShot>0 ? `+${weapon.multiShot}` : '—'}`,
        `EXPLO ${weapon.explodeR >0 ? `r${weapon.explodeR}` : '—'}`,
        `PIERC ${weapon.piercing >0 ? weapon.piercing : '—'}`,
        `BNCE  ${weapon.bouncing >0 ? weapon.bouncing : '—'}`,
      ].forEach((l, i) => { ctx.fillStyle = '#334455'; ctx.fillText(l, 12, 22+i*15); });

      // kill progress (top right, before boss spawns)
      if (!boss && gameState === 'playing') {
        const kills = Math.min(killCount, killsNeeded());
        const pct   = kills / killsNeeded();
        const bw = 120, bx = W-bw-12, by = 22;
        ctx.textAlign = 'right'; ctx.fillStyle = '#445566'; ctx.font = '10px "Courier New",monospace';
        ctx.fillText(`KILLS  ${kills}/${killsNeeded()}`, W-12, by-4);
        ctx.fillStyle = '#0a1a2a'; ctx.fillRect(bx, by, bw, 8);
        ctx.fillStyle = pct >= 1 ? '#ff00ff' : '#4455aa'; ctx.fillRect(bx, by, bw*pct, 8);
        ctx.strokeStyle = '#223344'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 8);
        ctx.textAlign = 'left';
      }
    }

    function drawCard(cx: number, cy: number, cw: number, ch: number, up: Upgrade, accent: string) {
      ctx.fillStyle = '#060f1a'; ctx.strokeStyle = accent;
      ctx.shadowColor = accent; ctx.shadowBlur = 10; ctx.lineWidth = 2;
      ctx.fillRect(cx, cy, cw, ch); ctx.strokeRect(cx, cy, cw, ch);
      ctx.shadowBlur = 0;
      ctx.fillStyle = accent; ctx.font = `bold 12px "Courier New",monospace`;
      ctx.textAlign = 'center'; ctx.fillText(up.name, cx+cw/2, cy+32);
      ctx.strokeStyle = '#002233'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx+12,cy+44); ctx.lineTo(cx+cw-12,cy+44); ctx.stroke();
      ctx.fillStyle = '#7799bb'; ctx.font = '10px "Courier New",monospace';
      // word-wrap desc into 2 lines at spaces
      const words = up.desc.split('·');
      if (words.length > 1) {
        ctx.fillText(words[0].trim(), cx+cw/2, cy+62);
        ctx.fillText(words[1].trim(), cx+cw/2, cy+76);
      } else {
        ctx.fillText(up.desc, cx+cw/2, cy+66);
      }
      ctx.fillStyle = '#223344'; ctx.font = '9px "Courier New",monospace';
      ctx.fillText('[ CLICK ]', cx+cw/2, cy+ch-12);
    }

    function drawStartScreen() {
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = 'rgba(0,0,8,0.88)'; ctx.fillRect(0,0,W,H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#00ffaa'; ctx.shadowColor = '#00ffaa'; ctx.shadowBlur = 30;
      ctx.font = `bold ${Math.min(52, W*0.08)}px "Courier New",monospace`;
      ctx.fillText('RETRO SHOOTER', W/2, H*0.2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#445566'; ctx.font = `${Math.min(12, W*0.03)}px "Courier New",monospace`;
      ctx.fillText('10 STAGES  ·  DEFEAT THE BOSS TO ADVANCE', W/2, H*0.29);
      ctx.fillStyle = '#7799bb'; ctx.shadowColor = '#7799bb'; ctx.shadowBlur = 8;
      ctx.font = `bold ${Math.min(15, W*0.035)}px "Courier New",monospace`;
      ctx.fillText('— SELECT DIFFICULTY —', W/2, H*0.37);
      ctx.shadowBlur = 0;
      const { cw, ch } = diffLayout();
      for (let i = 0; i < DIFFICULTIES.length; i++) {
        const diff = DIFFICULTIES[i];
        drawCard(dCardX(i), dCardY(i), cw, ch, { id: diff.id, name: diff.name, desc: diff.desc }, diff.color);
      }
      ctx.textAlign = 'left';
    }

    function drawUpgradeMenu() {
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = 'rgba(0,0,8,0.78)'; ctx.fillRect(0,0,W,H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffff00'; ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 22;
      ctx.font = 'bold 32px "Courier New",monospace';
      ctx.fillText('✦ LEVEL UP ✦', W/2, H/2-130);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#8899aa'; ctx.font = '13px "Courier New",monospace';
      ctx.fillText('Choose a weapon upgrade:', W/2, H/2-95);
      const cy = wCardY();
      for (let i = 0; i < weaponChoices.length; i++)
        drawCard(wCardX(i), cy, CW, CH, weaponChoices[i], '#004488');
      ctx.textAlign = 'left';
    }

    function drawBetweenStage() {
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = 'rgba(0,0,8,0.85)'; ctx.fillRect(0,0,W,H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffff00'; ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 28;
      ctx.font = 'bold 38px "Courier New",monospace';
      ctx.fillText(`★  STAGE ${stage-1} COMPLETE  ★`, W/2, H/2-145);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#aabbcc'; ctx.font = '14px "Courier New",monospace';
      ctx.fillText(`Entering Stage ${stage} — choose a permanent upgrade:`, W/2, H/2-100);
      const cy = bCardY();
      for (let i = 0; i < baseChoices.length; i++)
        drawCard(bCardX(i), cy, BCW, BCH, baseChoices[i], '#005500');
      // next-stage difficulty preview
      ctx.fillStyle = '#334455'; ctx.font = '10px "Courier New",monospace';
      ctx.fillText(
        `Stage ${stage}:  enemies ${blobHp()} HP · ${blobSpd()} speed · ${killsNeeded()} kills for boss · boss ${bossHp()} HP`,
        W/2, cy + BCH + 28
      );
      ctx.textAlign = 'left';
    }

    function drawGameOver() {
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fillRect(0,0,W,H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff2200'; ctx.shadowColor = '#ff2200'; ctx.shadowBlur = 30;
      ctx.font = 'bold 46px "Courier New",monospace';
      ctx.fillText('GAME OVER', W/2, H/2-40);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#aabbcc'; ctx.font = '14px "Courier New",monospace';
      ctx.fillText(`Stage ${stage}  ·  Level ${level}  ·  ${difficulty.name}`, W/2, H/2+14);
      ctx.fillStyle = '#556677'; ctx.font = '12px "Courier New",monospace';
      ctx.fillText('[ click to select difficulty and restart ]', W/2, H/2+46);
      ctx.textAlign = 'left';
    }

    // ── main loop ──────────────────────────────────────────────────────────
    let last = 0, animId = 0;

    function loop(ts: number) {
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      const W = canvas.width, H = canvas.height;

      if (gameState === 'playing') {
        ship.x += (mouse.x - ship.x) * player.speed;
        ship.y += (mouse.y - ship.y) * player.speed;

        // spawn blobs
        gameTime   += dt;
        spawnTimer += dt;
        const si = Math.max(0.35, spawnBase() - gameTime * 0.02);
        if (spawnTimer >= si) { spawnTimer = 0; spawnBlob(); }

        // boss trigger
        if (!boss && killCount >= killsNeeded()) spawnBoss();

        // move blobs
        const bs = blobSpd();
        for (const b of blobs) {
          const dx = ship.x-b.pos.x, dy = ship.y-b.pos.y;
          const len = Math.sqrt(dx*dx+dy*dy) || 1;
          b.pos.x += (dx/len)*bs*dt; b.pos.y += (dy/len)*bs*dt;
        }

        // move boss
        if (boss) {
          const dx = ship.x-boss.pos.x, dy = ship.y-boss.pos.y;
          const len = Math.sqrt(dx*dx+dy*dy) || 1;
          boss.pos.x += (dx/len)*38*dt; boss.pos.y += (dy/len)*38*dt;
        }

        // player contact damage
        invTimer = Math.max(0, invTimer - dt);
        const dmg = contactDmg();
        for (const b of blobs) {
          if (d(ship, b.pos) < b.radius+12) { damagePlayer(dmg); break; }
        }
        if (boss && d(ship, boss.pos) < boss.radius+14) damagePlayer(dmg * 2);

        // auto fire
        fireTimer += dt;
        if (fireTimer >= weapon.fireInterval && (blobs.length || boss)) { fireTimer = 0; fireBullet(); }

        // move bullets
        for (const b of bullets) { b.pos.x += b.vel.x*dt; b.pos.y += b.vel.y*dt; }

        // bullet ↔ blob collision
        const deadBlobs   = new Set<number>();
        const deadBullets = new Set<number>();
        const pendingExp: Array<{ pos: Vec2; r: number }> = [];

        for (const b of bullets) {
          if (deadBullets.has(b.id)) continue;
          for (const blob of blobs) {
            if (deadBlobs.has(blob.id)) continue;
            if (d(b.pos, blob.pos) >= blob.radius+4) continue;
            blob.hp--;
            const killed = blob.hp <= 0;
            if (killed) deadBlobs.add(blob.id);
            if (b.explodeR > 0) {
              if (killed) pendingExp.push({ pos: { ...blob.pos }, r: b.explodeR });
              deadBullets.add(b.id);
            } else if (b.bounceLeft > 0 && killed) {
              b.bounceLeft--;
              const next = nearestBlob(blob.pos, new Set([...deadBlobs]));
              if (next) {
                const dx = next.pos.x-blob.pos.x, dy = next.pos.y-blob.pos.y;
                const len = Math.sqrt(dx*dx+dy*dy) || 1;
                const spd = Math.sqrt(b.vel.x**2+b.vel.y**2);
                b.vel = { x:(dx/len)*spd, y:(dy/len)*spd }; b.pos = { ...blob.pos };
              } else { deadBullets.add(b.id); }
            } else if (b.pierceLeft > 0) {
              b.pierceLeft--;
            } else { deadBullets.add(b.id); }
          }
        }

        // explosions
        for (const exp of pendingExp) {
          explosions.push({ id: uid++, pos: exp.pos, age: 0, maxR: exp.r });
          for (const blob of blobs)
            if (!deadBlobs.has(blob.id) && d(blob.pos, exp.pos) < exp.r) deadBlobs.add(blob.id);
        }

        // bullet ↔ boss collision
        if (boss) {
          for (const b of bullets) {
            if (deadBullets.has(b.id)) continue;
            if (d(b.pos, boss.pos) >= boss.radius+4) continue;
            boss.hp--;
            if (b.explodeR > 0) {
              explosions.push({ id: uid++, pos: { ...boss.pos }, age: 0, maxR: b.explodeR });
              deadBullets.add(b.id);
            } else if (b.pierceLeft > 0) { b.pierceLeft--; }
            else { deadBullets.add(b.id); }
            if (boss.hp <= 0) {
              for (let i = 0; i < 20; i++)
                xpOrbs.push({ id: uid++, pos: { x: boss.pos.x+(Math.random()-0.5)*100, y: boss.pos.y+(Math.random()-0.5)*100 } });
              boss = null;
              if (stage >= 10) {
                gameState = 'game_over'; canvas.style.cursor = 'default';
              } else {
                baseChoices = pickN(BASE_UPS, 4);
                gameState   = 'between_stage'; canvas.style.cursor = 'default';
              }
              break;
            }
          }
        }

        // kill count + orbs
        killCount += deadBlobs.size;
        for (const blob of blobs)
          if (deadBlobs.has(blob.id))
            xpOrbs.push({ id: uid++, pos: { x: blob.pos.x+(Math.random()-0.5)*16, y: blob.pos.y+(Math.random()-0.5)*16 } });
        blobs   = blobs.filter(b => !deadBlobs.has(b.id));
        bullets = bullets.filter(b => !deadBullets.has(b.id));
        bullets = bullets.filter(b => b.pos.x>-40 && b.pos.x<W+40 && b.pos.y>-40 && b.pos.y<H+40);

        // explosions age
        explosions = explosions.filter(e => e.age < 0.45);
        for (const e of explosions) e.age += dt;

        // XP orb pull & collect
        const PULL = 160;
        const got: number[] = [];
        for (const o of xpOrbs) {
          const dx = ship.x-o.pos.x, dy = ship.y-o.pos.y;
          const dist = Math.sqrt(dx*dx+dy*dy) || 1;
          if (dist < PULL) { const s = 160+(PULL-dist)*2.5; o.pos.x += (dx/dist)*s*dt; o.pos.y += (dy/dist)*s*dt; }
          if (dist < 14) got.push(o.id);
        }
        if (got.length) { xpOrbs = xpOrbs.filter(o => !got.includes(o.id)); addXp(got.length); }

        // HP regen
        if (player.regen > 0) player.hp = Math.min(player.maxHp, player.hp + player.regen*dt);
      }

      // ── render ──────────────────────────────────────────────────────────
      ctx.fillStyle = palette().bg; ctx.fillRect(0,0,W,H);
      drawStars();
      for (const e of explosions) drawExplosion(e);
      for (const o of xpOrbs)     drawOrb(o);
      for (const bl of blobs)     drawBlob(bl);
      if (boss) drawBoss(boss);
      for (const b of bullets)    drawBullet(b);

      if (gameState !== 'start') {
        const nb  = nearestBlob(ship);
        const aim = nb ? nb.pos : boss ? boss.pos : null;
        const ang = aim ? Math.atan2(aim.y-ship.y, aim.x-ship.x)+Math.PI/2 : -Math.PI/2;
        drawShip(ang);

        if (damageFlash > 0) {
          ctx.fillStyle = `rgba(255,0,0,${damageFlash*0.28})`;
          ctx.fillRect(0,0,W,H);
          damageFlash = Math.max(0, damageFlash - dt*5);
        }

        drawHud();
      }

      if      (gameState === 'start')         drawStartScreen();
      else if (gameState === 'upgrading')     drawUpgradeMenu();
      else if (gameState === 'between_stage') drawBetweenStage();
      else if (gameState === 'game_over')     drawGameOver();

      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('mousemove',  onMove);
      canvas.removeEventListener('click',      onClick);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
      window.removeEventListener('resize',     resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Retro shooter game — move your finger or cursor to guide the ship"
      style={{ display: 'block', background: '#04040f', cursor: 'default', touchAction: 'none' }}
    />
  );
}
