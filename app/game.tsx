'use client';

import { useEffect, useRef } from 'react';

// ── types ─────────────────────────────────────────────────────────────────────
interface Vec2         { x: number; y: number }
interface Star         { x: number; y: number; size: number; bright: number }
type WeaponType    = 'pistol' | 'shotgun' | 'laser' | 'rocket' | 'railgun';
type EnemyType     = 'standard' | 'swarm' | 'tank' | 'ghost' | 'splitter';
type BossPattern   = 'chase' | 'orbit' | 'charge' | 'summon' | 'teleport';
type StageModifier = 'none' | 'dense_spawn' | 'xp_drought' | 'fog' | 'explosive_death' | 'regen_enemies' | 'berserk';
interface StageConfig  { name: string; tagline: string; modifier: StageModifier; enemyType: EnemyType; bossPattern: BossPattern }
interface Blob         { id: number; pos: Vec2; radius: number; hp: number; maxHp: number; fireTimer: number; enemyType: EnemyType; dodgeChance: number; spawnsChildren: boolean }
interface Boss         { id: number; pos: Vec2; radius: number; hp: number; maxHp: number; pattern: BossPattern }
interface XpOrb        { id: number; pos: Vec2 }
interface Explosion    { id: number; pos: Vec2; age: number; maxR: number }
interface RailgunFlash { id: number; fromX: number; fromY: number; toX: number; toY: number; age: number }
interface Bullet       { id: number; pos: Vec2; vel: Vec2; pierceLeft: number; bounceLeft: number; explodeR: number; weaponType: WeaponType; maxRange: number; distTraveled: number; homingStrength: number; bulletSize: number; ghostDodged: Set<number> }
interface EnemyBullet  { id: number; pos: Vec2; vel: Vec2; dmg: number }
interface WeaponStats  {
  type: WeaponType;
  fireInterval: number; multiShot: number; explodeR: number; piercing: number; bouncing: number;
  bulletSpeed: number; bulletSize: number; range: number; damage: number; homingStrength: number;
  fireTimer: number;
}
interface PlayerStats {
  hp: number; maxHp: number; armor: number; regen: number; speed: number;
  damage: number; critChance: number; critMult: number;
  shield: number; maxShield: number; shieldRegen: number;
  dodge: number; xpRange: number; xpMult: number;
}
interface Floater    { pos: Vec2; text: string; age: number; maxAge: number; color: string }
interface Upgrade    { id: string; name: string; desc: string; maxTaken: number; category: 'weapon' | 'stat' | 'passive' }
interface Difficulty { id: string; name: string; desc: string; color: string; hpMult: number; spdMult: number; dmgMult: number; spawnMult: number }

type GameState = 'start' | 'playing' | 'upgrading' | 'between_stage' | 'game_over';

// ── upgrade pool ──────────────────────────────────────────────────────────────
const UPGRADE_POOL: Upgrade[] = [
  // weapon modifiers (apply to all held weapons)
  { id: 'rapid',       name: 'RAPID FIRE',    desc: 'All weapons fire rate +33%',           maxTaken: 4, category: 'weapon'  },
  { id: 'multi',       name: 'MULTI SHOT',    desc: 'All weapons +2 extra bullets',         maxTaken: 3, category: 'weapon'  },
  { id: 'explosive',   name: 'EXPLOSIVE',     desc: 'All bullets explode · +60r radius',    maxTaken: 3, category: 'weapon'  },
  { id: 'piercing',    name: 'PIERCING SHOT', desc: 'All bullets pierce +2 enemies',        maxTaken: 3, category: 'weapon'  },
  { id: 'bouncing',    name: 'BOUNCING SHOT', desc: 'Bullets bounce · next target',         maxTaken: 2, category: 'weapon'  },
  { id: 'storm',       name: 'BULLET STORM',  desc: '+4 bullets · rate +20% all',           maxTaken: 2, category: 'weapon'  },
  { id: 'homing',      name: 'HOMING ROUNDS', desc: 'All bullets curve toward enemies',     maxTaken: 2, category: 'weapon'  },
  // weapon archetypes (adds a weapon slot, max 3 weapons)
  { id: 'add_shotgun', name: 'ADD SHOTGUN',   desc: '5 pellets · short range · high burst', maxTaken: 1, category: 'weapon'  },
  { id: 'add_laser',   name: 'ADD LASER',     desc: 'Rapid thin shots · infinite pierce',   maxTaken: 1, category: 'weapon'  },
  { id: 'add_rocket',  name: 'ADD ROCKET',    desc: 'Slow · AOE explosion · slight homing', maxTaken: 1, category: 'weapon'  },
  { id: 'add_railgun', name: 'ADD RAILGUN',   desc: 'Instant line · pierces all enemies',   maxTaken: 1, category: 'weapon'  },
  // stat upgrades
  { id: 'max_hp',      name: 'MAX HEALTH',    desc: '+30 max HP · full restore',            maxTaken: 4, category: 'stat'    },
  { id: 'regen',       name: 'HP REGEN',      desc: '+2 HP per second',                     maxTaken: 4, category: 'stat'    },
  { id: 'speed',       name: 'MOVE SPEED',    desc: 'Ship speed +15%',                      maxTaken: 4, category: 'stat'    },
  { id: 'armor',       name: 'ARMOR',         desc: '-10% incoming damage',                 maxTaken: 4, category: 'stat'    },
  { id: 'dodge',       name: 'DODGE ROLL',    desc: '+8% chance to evade all hits',         maxTaken: 3, category: 'stat'    },
  { id: 'crit',        name: 'CRIT BOOST',    desc: '+10% critical hit chance',             maxTaken: 3, category: 'stat'    },
  // passives
  { id: 'shield',      name: 'SHIELD CELL',   desc: '+40 shield · +2/s regen',              maxTaken: 3, category: 'passive' },
  { id: 'xp_magnet',   name: 'XP MAGNET',     desc: 'Pull range +80 · orbs faster',        maxTaken: 3, category: 'passive' },
  { id: 'double_xp',   name: 'DOUBLE XP',     desc: 'XP earned ×1.5',                      maxTaken: 2, category: 'passive' },
  { id: 'bullet_size', name: 'BULLET SIZE',   desc: 'Bullets larger · bigger hitbox',       maxTaken: 3, category: 'passive' },
  { id: 'vampire',     name: 'VAMPIRE',       desc: 'Each kill heals 0.5 HP',               maxTaken: 3, category: 'passive' },
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

// ── stage configs ─────────────────────────────────────────────────────────────
const STAGE_CONFIGS: StageConfig[] = [
  { name: 'THE VOID',   tagline: 'IT BEGINS',               modifier: 'none',            enemyType: 'standard', bossPattern: 'chase'    },
  { name: 'SWARM',      tagline: 'THEY COME IN WAVES',      modifier: 'dense_spawn',     enemyType: 'swarm',    bossPattern: 'orbit'    },
  { name: 'GLACIAL',    tagline: 'SLOW AND UNSTOPPABLE',    modifier: 'none',            enemyType: 'tank',     bossPattern: 'charge'   },
  { name: 'THE SWAMP',  tagline: 'XP IS SCARCE HERE',       modifier: 'xp_drought',      enemyType: 'standard', bossPattern: 'summon'   },
  { name: 'NEBULA',     tagline: 'THEY HIDE IN THE DARK',   modifier: 'fog',             enemyType: 'standard', bossPattern: 'teleport' },
  { name: 'SPLIT TIDE', tagline: 'EVERY KILL BREEDS MORE',  modifier: 'explosive_death', enemyType: 'splitter', bossPattern: 'orbit'    },
  { name: 'HAUNTED',    tagline: "THEY WON'T STAY DOWN",    modifier: 'regen_enemies',   enemyType: 'ghost',    bossPattern: 'charge'   },
  { name: 'PULSE',      tagline: 'BERSERK AT INTERVALS',    modifier: 'berserk',         enemyType: 'standard', bossPattern: 'chase'    },
  { name: 'SIEGE',      tagline: 'ENDLESS ARMADA',          modifier: 'dense_spawn',     enemyType: 'tank',     bossPattern: 'summon'   },
  { name: 'ENDGAME',    tagline: 'NO MERCY',                modifier: 'none',            enemyType: 'standard', bossPattern: 'charge'   },
];

// ── weapon factories ──────────────────────────────────────────────────────────
function makePistol():  WeaponStats { return { type: 'pistol',  fireInterval: 0.28, multiShot: 0, explodeR: 0,  piercing: 0, bouncing: 0, bulletSpeed: 520,  bulletSize: 1.0, range: 0,   damage: 1.0,  homingStrength: 0,   fireTimer: 0 }; }
function makeShotgun(): WeaponStats { return { type: 'shotgun', fireInterval: 0.55, multiShot: 4, explodeR: 0,  piercing: 0, bouncing: 0, bulletSpeed: 400,  bulletSize: 1.2, range: 350, damage: 0.6,  homingStrength: 0,   fireTimer: 0 }; }
function makeLaser():   WeaponStats { return { type: 'laser',   fireInterval: 0.10, multiShot: 0, explodeR: 0,  piercing: 3, bouncing: 0, bulletSpeed: 720,  bulletSize: 0.5, range: 0,   damage: 0.35, homingStrength: 0,   fireTimer: 0 }; }
function makeRocket():  WeaponStats { return { type: 'rocket',  fireInterval: 0.75, multiShot: 0, explodeR: 80, piercing: 0, bouncing: 0, bulletSpeed: 320,  bulletSize: 1.8, range: 0,   damage: 1.5,  homingStrength: 1.0, fireTimer: 0 }; }
function makeRailgun(): WeaponStats { return { type: 'railgun', fireInterval: 1.20, multiShot: 0, explodeR: 0,  piercing: 0, bouncing: 0, bulletSpeed: 5000, bulletSize: 0.8, range: 0,   damage: 4.0,  homingStrength: 0,   fireTimer: 0 }; }

// ── pure helpers ──────────────────────────────────────────────────────────────
function d2(a: Vec2, b: Vec2) { const dx = a.x-b.x, dy = a.y-b.y; return dx*dx+dy*dy; }
function d(a: Vec2, b: Vec2)  { return Math.sqrt(d2(a, b)); }
function makeStars(w: number, h: number): Star[] {
  return Array.from({ length: 130 }, () => ({
    x: Math.random()*w, y: Math.random()*h,
    size: Math.random()*1.5+0.3, bright: Math.random()*0.6+0.4,
  }));
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
    const player: PlayerStats = {
      hp: 100, maxHp: 100, armor: 0, regen: 0, speed: 0.14,
      damage: 1.0, critChance: 0, critMult: 2.0,
      shield: 0, maxShield: 0, shieldRegen: 0,
      dodge: 0, xpRange: 160, xpMult: 1.0,
    };
    let weapons: WeaponStats[] = [makePistol()];
    let vampireHeal    = 0;
    const upgradeTaken = new Map<string, number>();
    let xp = 0, level = 0, xpToNext = 12;

    // ── per-stage state ────────────────────────────────────────────────────
    let blobs:          Blob[]          = [];
    let boss:           Boss | null     = null;
    let bullets:        Bullet[]        = [];
    let enemyBullets:   EnemyBullet[]   = [];
    let xpOrbs:         XpOrb[]         = [];
    let explosions:     Explosion[]     = [];
    let railgunFlashes: RailgunFlash[]  = [];
    let uid           = 0;
    let spawnTimer    = 0;
    let bossFireTimer = 0;
    let gameTime      = 0;
    let killCount     = 0;
    let invTimer          = 0;
    let damageFlash       = 0;
    let shieldRegenDelay  = 0;
    let floaters: Floater[] = [];
    let stageIntroTimer   = 0;
    let bossOrbitAngle    = 0;
    let bossChargeVel: Vec2 | null = null;
    let bossChargeTimer   = 3;
    let bossTeleportTimer = 4;
    let bossSummonTimer   = 6;
    let berserkTimer  = 0;
    let berserkActive = false;

    // ── UI state ───────────────────────────────────────────────────────────
    let gameState: GameState = 'start';
    let difficulty: Difficulty = DIFFICULTIES[1];
    let upgradeChoices: Upgrade[] = [];

    const mouse: Vec2 = { x: canvas.width/2, y: canvas.height/2 };
    const ship:  Vec2 = { x: canvas.width/2, y: canvas.height/2 };

    // ── stage scaling ──────────────────────────────────────────────────────
    function pickNFromPool(n: number): Upgrade[] {
      const heldTypes = new Set(weapons.map(w => w.type));
      const available = UPGRADE_POOL.filter(u => {
        if ((upgradeTaken.get(u.id) || 0) >= u.maxTaken) return false;
        if (u.id === 'add_shotgun' && (weapons.length >= 3 || heldTypes.has('shotgun')))  return false;
        if (u.id === 'add_laser'   && (weapons.length >= 3 || heldTypes.has('laser')))    return false;
        if (u.id === 'add_rocket'  && (weapons.length >= 3 || heldTypes.has('rocket')))   return false;
        if (u.id === 'add_railgun' && (weapons.length >= 3 || heldTypes.has('railgun')))  return false;
        return true;
      });
      return [...available].sort(() => Math.random()-0.5).slice(0, n);
    }

    function applyUpgrade(id: string) {
      // weapon modifiers — apply to every held weapon
      if (id === 'rapid')       for (const w of weapons) w.fireInterval   = Math.max(0.07, w.fireInterval * 0.67);
      if (id === 'multi')       for (const w of weapons) w.multiShot      = Math.min(w.multiShot + 2, 8);
      if (id === 'explosive')   for (const w of weapons) w.explodeR      += 60;
      if (id === 'piercing')    for (const w of weapons) w.piercing      += 2;
      if (id === 'bouncing')    for (const w of weapons) w.bouncing       = Math.min(w.bouncing + 1, 3);
      if (id === 'storm')       for (const w of weapons) { w.fireInterval = Math.max(0.09, w.fireInterval * 0.8); w.multiShot = Math.min(w.multiShot + 4, 12); }
      if (id === 'homing')      for (const w of weapons) w.homingStrength = Math.min(3.0, w.homingStrength + 1.5);
      if (id === 'bullet_size') for (const w of weapons) w.bulletSize    *= 1.3;
      // add weapons — retroactively apply all taken weapon mods
      if (id === 'add_shotgun' || id === 'add_laser' || id === 'add_rocket' || id === 'add_railgun') {
        const w = id === 'add_shotgun' ? makeShotgun() : id === 'add_laser' ? makeLaser() : id === 'add_rocket' ? makeRocket() : makeRailgun();
        const r = upgradeTaken.get('rapid') || 0; for (let i = 0; i < r; i++) w.fireInterval = Math.max(0.07, w.fireInterval * 0.67);
        const s = upgradeTaken.get('storm') || 0; for (let i = 0; i < s; i++) { w.fireInterval = Math.max(0.09, w.fireInterval * 0.8); w.multiShot = Math.min(w.multiShot + 4, 12); }
        w.multiShot      = Math.min(w.multiShot + (upgradeTaken.get('multi') || 0) * 2, 8);
        w.explodeR      += (upgradeTaken.get('explosive') || 0) * 60;
        w.piercing      += (upgradeTaken.get('piercing') || 0) * 2;
        w.bouncing       = Math.min(w.bouncing + (upgradeTaken.get('bouncing') || 0), 3);
        w.homingStrength = Math.min(3.0, w.homingStrength + (upgradeTaken.get('homing') || 0) * 1.5);
        const bs = upgradeTaken.get('bullet_size') || 0; for (let i = 0; i < bs; i++) w.bulletSize *= 1.3;
        weapons.push(w);
      }
      // stat
      if (id === 'max_hp') { player.maxHp += 30; player.hp = player.maxHp; }
      if (id === 'regen')    player.regen      += 2;
      if (id === 'speed')    player.speed       = Math.min(0.35, player.speed * 1.15);
      if (id === 'armor')    player.armor       = Math.min(0.5,  player.armor + 0.1);
      if (id === 'dodge')    player.dodge       = Math.min(0.35, player.dodge + 0.08);
      if (id === 'crit')     player.critChance  = Math.min(0.4,  player.critChance + 0.1);
      // passive
      if (id === 'shield')    { player.maxShield += 40; player.shield = player.maxShield; player.shieldRegen += 2; }
      if (id === 'xp_magnet')   player.xpRange  += 80;
      if (id === 'double_xp')   player.xpMult    = Math.min(3.0, player.xpMult * 1.5);
      if (id === 'vampire')     vampireHeal      += 0.5;
      upgradeTaken.set(id, (upgradeTaken.get(id) || 0) + 1);
    }

    function stageConfig() { return STAGE_CONFIGS[Math.min(stage-1, STAGE_CONFIGS.length-1)]; }
    function killsNeeded() { return 20 + (stage-1) * 5; }
    function blobHp()      { return Math.max(1, Math.round((3  + (stage-1) * 2)  * difficulty.hpMult)); }
    function blobSpd()     { return (70 + (stage-1) * 8)  * difficulty.spdMult; }
    function bossHp()      { return Math.max(5, Math.round((30 + (stage-1) * 20) * difficulty.hpMult)); }
    function spawnBase()   { const b = Math.max(0.3, (1.8 - (stage-1) * 0.12) * difficulty.spawnMult); return stageConfig().modifier === 'dense_spawn' ? b * 0.6 : b; }
    function palette()     { return PALETTES[Math.min(stage-1, PALETTES.length-1)]; }
    function contactDmg()  { return (12 + (stage-1) * 3) * difficulty.dmgMult; }
    function blobFireInterval() { return Math.max(2.0, 5.5 - (stage-1) * 0.35); }
    function blobFireSpd()      { return 150 + (stage-1) * 10; }
    function blobFireDmg()      { return contactDmg() * 0.4; }
    function bossFireInterval() { return boss && boss.hp / boss.maxHp < 0.5 ? 0.7 : 1.4; }
    function bossFireSpd()      { return 200 + (stage-1) * 8; }

    // ── card layout ────────────────────────────────────────────────────────
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
      e.preventDefault();
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
            stageIntroTimer = 2.5;
            gameState  = 'playing';
            canvas.style.cursor = 'none';
          }
        }
      } else if (gameState === 'upgrading') {
        const cy = wCardY();
        for (let i = 0; i < upgradeChoices.length; i++) {
          const cx = wCardX(i);
          if (mx >= cx && mx <= cx+CW && my >= cy && my <= cy+CH) {
            applyUpgrade(upgradeChoices[i].id);
            gameState = 'playing';
            canvas.style.cursor = 'none';
          }
        }
      } else if (gameState === 'between_stage') {
        const cy = wCardY();
        for (let i = 0; i < upgradeChoices.length; i++) {
          const cx = wCardX(i);
          if (mx >= cx && mx <= cx+CW && my >= cy && my <= cy+CH) {
            applyUpgrade(upgradeChoices[i].id);
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
    function bulletDmg(t: WeaponType): number {
      switch (t) {
        case 'pistol':  return 1.0;
        case 'shotgun': return 0.6;
        case 'laser':   return 0.35;
        case 'rocket':  return 1.5;
        case 'railgun': return 4.0;
      }
    }

    function nearestTarget(from: Vec2): Vec2 | null {
      const nb = nearestBlob(from);
      if (nb) return nb.pos;
      if (boss) return boss.pos;
      return null;
    }

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
      const et     = stageConfig().enemyType;
      const radius = et === 'swarm' ? 8 : et === 'tank' ? 22 : 14;
      const hpMult = et === 'swarm' ? 0.5 : et === 'tank' ? 2.5 : 1.0;
      const dodge  = et === 'ghost' ? 0.4 : 0;
      const hp = Math.max(1, Math.round(blobHp() * hpMult));
      blobs.push({ id: uid++, pos, radius, hp, maxHp: hp, fireTimer: Math.random() * blobFireInterval(), enemyType: et, dodgeChance: dodge, spawnsChildren: et === 'splitter' });
    }

    function spawnBoss() {
      const hp  = bossHp();
      const pat = stageConfig().bossPattern;
      boss = { id: uid++, pos: { x: canvas.width/2, y: -70 }, radius: 52, hp, maxHp: hp, pattern: pat };
      bossFireTimer = 1.2;
      bossOrbitAngle = 0; bossChargeVel = null; bossChargeTimer = 3; bossTeleportTimer = 4; bossSummonTimer = 6;
    }

    function fireBulletForWeapon(w: WeaponStats) {
      const nb = nearestBlob(ship);
      const tgt: Vec2 | null = nb ? nb.pos : boss ? boss.pos : null;
      if (!tgt) return;
      const dx = tgt.x - ship.x, dy = tgt.y - ship.y;
      const base = Math.atan2(dy, dx);

      // railgun: push a flash and a single fast piercing bullet (invisible)
      if (w.type === 'railgun') {
        railgunFlashes.push({
          id: uid++,
          fromX: ship.x, fromY: ship.y,
          toX: ship.x + Math.cos(base) * 3000,
          toY: ship.y + Math.sin(base) * 3000,
          age: 0,
        });
        bullets.push({
          id: uid++, pos: { x: ship.x, y: ship.y },
          vel: { x: Math.cos(base)*w.bulletSpeed, y: Math.sin(base)*w.bulletSpeed },
          pierceLeft: 99, bounceLeft: 0, explodeR: w.explodeR,
          weaponType: 'railgun', maxRange: 0, distTraveled: 0,
          homingStrength: 0, bulletSize: w.bulletSize, ghostDodged: new Set<number>(),
        });
        return;
      }

      const count  = 1 + w.multiShot;
      const spread = w.multiShot > 0 ? 0.18 : 0;
      const half   = spread * (count-1) / 2;
      const spd    = w.bulletSpeed;
      for (let i = 0; i < count; i++) {
        const a = base - half + spread*i;
        bullets.push({
          id: uid++, pos: { x: ship.x, y: ship.y },
          vel: { x: Math.cos(a)*spd, y: Math.sin(a)*spd },
          pierceLeft: w.piercing, bounceLeft: w.bouncing, explodeR: w.explodeR,
          weaponType: w.type, maxRange: w.range, distTraveled: 0,
          homingStrength: w.homingStrength, bulletSize: w.bulletSize, ghostDodged: new Set<number>(),
        });
      }
    }

    function addFloater(pos: Vec2, text: string, color: string, maxAge = 0.9) {
      floaters.push({ pos: { ...pos }, text, age: 0, maxAge, color });
    }

    function damagePlayer(amount: number) {
      if (invTimer > 0) return;
      if (player.dodge > 0 && Math.random() < player.dodge) {
        addFloater({ x: ship.x, y: ship.y - 16 }, 'DODGE', '#00ffff', 1.1);
        invTimer = 0.25;
        return;
      }
      const eff = amount * (1 - player.armor);
      if (player.shield > 0) {
        const absorbed = Math.min(player.shield, eff);
        player.shield -= absorbed;
        const rem = eff - absorbed;
        player.hp = Math.max(0, player.hp - rem);
        shieldRegenDelay = 3;
      } else {
        player.hp = Math.max(0, player.hp - eff);
      }
      invTimer    = 0.5;
      damageFlash = 1;
      if (player.hp <= 0) { gameState = 'game_over'; canvas.style.cursor = 'default'; }
    }

    function levelUp() {
      level++;
      xpToNext      = 12 + level * 10;
      gameState     = 'upgrading';
      upgradeChoices = pickNFromPool(3);
      canvas.style.cursor = 'default';
    }
    function addXp(n: number) {
      xp += n;
      while (xp >= xpToNext) { xp -= xpToNext; levelUp(); }
    }

    function startNextStage() {
      stage++;
      blobs = []; boss = null; bullets = []; enemyBullets = []; xpOrbs = []; explosions = []; floaters = []; railgunFlashes = [];
      killCount = 0; spawnTimer = 0; bossFireTimer = 0; gameTime = 0; invTimer = 0; shieldRegenDelay = 0;
      for (const w of weapons) w.fireTimer = 0;
      stageIntroTimer = 2.5; bossOrbitAngle = 0; bossChargeVel = null; bossChargeTimer = 3;
      bossTeleportTimer = 4; bossSummonTimer = 6; berserkTimer = 0; berserkActive = false;
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.35);
      gameState = 'playing';
      canvas.style.cursor = 'none';
    }

    function restartGame() {
      stage  = 1;
      player.hp = 100; player.maxHp = 100; player.armor = 0; player.regen = 0; player.speed = 0.14;
      player.damage = 1.0; player.critChance = 0; player.critMult = 2.0;
      player.shield = 0; player.maxShield = 0; player.shieldRegen = 0;
      player.dodge = 0; player.xpRange = 160; player.xpMult = 1.0;
      weapons = [makePistol()];
      vampireHeal = 0; upgradeTaken.clear();
      xp = 0; level = 0; xpToNext = 12;
      blobs = []; boss = null; bullets = []; enemyBullets = []; xpOrbs = []; explosions = []; floaters = []; railgunFlashes = [];
      killCount = 0; spawnTimer = 0; bossFireTimer = 0; gameTime = 0; invTimer = 0; damageFlash = 0; shieldRegenDelay = 0;
      stageIntroTimer = 0; bossOrbitAngle = 0; bossChargeVel = null; bossChargeTimer = 3;
      bossTeleportTimer = 4; bossSummonTimer = 6; berserkTimer = 0; berserkActive = false;
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
      let fog = 1;
      if (stageConfig().modifier === 'fog') {
        const dist = d(b.pos, ship);
        fog = dist < 150 ? 1 : dist > 350 ? 0 : 1 - (dist-150)/200;
      }
      if (fog <= 0) return;
      ctx.save();
      ctx.translate(b.pos.x, b.pos.y);
      ctx.shadowColor = pal.glow; ctx.shadowBlur = 12;
      ctx.fillStyle   = pal.blob;
      ctx.globalAlpha = fog * (0.5 + 0.5 * hr);
      ctx.beginPath(); ctx.arc(0,0,b.radius,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha = fog;
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
      ctx.fillText(`${Math.ceil(b.hp)} / ${b.maxHp}`, W/2, barY+12);
      ctx.textAlign = 'left';
    }

    function drawEnemyBullet(eb: EnemyBullet) {
      ctx.save();
      ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 10;
      ctx.fillStyle   = '#ff6633';
      ctx.beginPath(); ctx.arc(eb.pos.x, eb.pos.y, 4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ffaa88'; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(eb.pos.x-1, eb.pos.y-1, 1.5, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    function drawBullet(b: Bullet) {
      if (b.weaponType === 'railgun') return; // flash handles the visual

      ctx.save();
      const ang = Math.atan2(b.vel.y, b.vel.x) + Math.PI/2;
      ctx.translate(b.pos.x, b.pos.y); ctx.rotate(ang);

      if (b.weaponType === 'laser') {
        ctx.shadowColor = '#44ffff'; ctx.shadowBlur = 8; ctx.fillStyle = '#88ffff';
        ctx.fillRect(-1.5 * b.bulletSize, -12, 3 * b.bulletSize, 24);
        ctx.fillStyle = '#ffffff'; ctx.shadowBlur = 0;
        ctx.fillRect(-0.5, -12, 1, 24);
      } else if (b.weaponType === 'rocket') {
        const s = b.bulletSize;
        ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 14; ctx.fillStyle = '#ff6600';
        ctx.beginPath(); ctx.ellipse(0, 0, 4*s, 9*s, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffaa00'; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.ellipse(0, -3*s, 2*s, 3*s, 0, 0, Math.PI*2); ctx.fill();
        // exhaust flicker
        ctx.globalAlpha = 0.5 + 0.5 * Math.random();
        ctx.fillStyle = '#ff2200';
        ctx.beginPath(); ctx.ellipse(0, 9*s + 3, 3*s, 4, 0, 0, Math.PI); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (b.weaponType === 'shotgun') {
        const isExp = b.explodeR > 0;
        ctx.shadowColor = isExp ? '#ff8800' : '#ff7733'; ctx.shadowBlur = 6;
        ctx.fillStyle   = isExp ? '#ff6600' : '#ff9944';
        ctx.fillRect(-3 * b.bulletSize, -5, 6 * b.bulletSize, 10);
      } else {
        // pistol
        const isExp = b.explodeR > 0;
        ctx.shadowColor = isExp ? '#ff8800' : '#ffff44'; ctx.shadowBlur = 8;
        ctx.fillStyle   = isExp ? '#ff6600' : '#ffff00';
        ctx.fillRect(-2,-7,4,14);
      }
      ctx.restore();
    }

    function drawRailgunFlash(f: RailgunFlash) {
      const t = Math.min(f.age / 0.3, 1);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.shadowColor = '#aaaaff'; ctx.shadowBlur = 20;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = Math.max(0.5, 3 - t * 2.5);
      ctx.beginPath(); ctx.moveTo(f.fromX, f.fromY); ctx.lineTo(f.toX, f.toY); ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
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

    const WEAPON_LABELS: Record<WeaponType, string> = { pistol: 'PSTL', shotgun: 'SHOT', laser: 'LASR', rocket: 'RKET', railgun: 'RAIL' };
    const WEAPON_COLORS: Record<WeaponType, string> = { pistol: '#334455', shotgun: '#553322', laser: '#224455', rocket: '#553311', railgun: '#334' };

    function drawHud() {
      const W = canvas.width, H = canvas.height;

      // stage label (top center, subtle)
      ctx.textAlign = 'center'; ctx.fillStyle = '#223344';
      ctx.font = '10px "Courier New",monospace';
      ctx.fillText(`STAGE ${stage} / 10 — ${stageConfig().name}${berserkActive ? '  ⚡BERSERK' : ''}`, W/2, 10);

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

      // shield bar
      if (player.maxShield > 0) {
        const shY = hpY - 18;
        const shRatio = player.shield / player.maxShield;
        ctx.fillStyle = '#00111a'; ctx.fillRect(hpX, shY, hpW, 10);
        const shG = ctx.createLinearGradient(hpX, 0, hpX+hpW, 0);
        shG.addColorStop(0, '#0066aa'); shG.addColorStop(1, '#00ccff');
        ctx.fillStyle = shG; ctx.fillRect(hpX, shY, hpW*shRatio, 10);
        ctx.strokeStyle = '#002233'; ctx.lineWidth = 1; ctx.strokeRect(hpX, shY, hpW, 10);
        ctx.fillStyle = '#44aacc'; ctx.font = '9px "Courier New",monospace';
        ctx.fillText(`SH  ${Math.ceil(player.shield)} / ${player.maxShield}`, hpX, shY-3);
      }

      // defence stats
      const defExtras: string[] = [];
      if (player.armor  > 0) defExtras.push(`ARM ${Math.round(player.armor*100)}%`);
      if (player.regen  > 0) defExtras.push(`REG ${player.regen.toFixed(1)}/s`);
      if (player.dodge  > 0) defExtras.push(`DODGE ${Math.round(player.dodge*100)}%`);
      if (defExtras.length) {
        ctx.fillStyle = '#445566'; ctx.font = '9px "Courier New",monospace';
        ctx.fillText(defExtras.join('  '), hpX, hpY+26);
      }

      // offence stats
      const offExtras: string[] = [];
      if (player.damage   > 1.0) offExtras.push(`DMG ×${player.damage.toFixed(1)}`);
      if (player.critChance > 0) offExtras.push(`CRIT ${Math.round(player.critChance*100)}%`);
      if (offExtras.length) {
        ctx.fillStyle = '#665544'; ctx.font = '9px "Courier New",monospace';
        ctx.fillText(offExtras.join('  '), hpX, hpY + (defExtras.length ? 38 : 26));
      }

      // weapon readout (top left) — one line per weapon
      ctx.textAlign = 'left'; ctx.font = '10px "Courier New",monospace';
      let hudY = 22;
      for (const w of weapons) {
        const label = WEAPON_LABELS[w.type];
        const color = WEAPON_COLORS[w.type];
        const tags: string[] = [];
        if (w.multiShot   > 0)   tags.push(`+${w.multiShot}`);
        if (w.explodeR    > 0)   tags.push('EXP');
        if (w.piercing    > 0 && w.piercing < 90) tags.push('PIE');
        if (w.bouncing    > 0)   tags.push('BNC');
        if (w.homingStrength > 0) tags.push('HOM');
        ctx.fillStyle = color;
        ctx.fillText(`[${label}] ${(1/w.fireInterval).toFixed(1)}/s${tags.length ? '  ' + tags.join(' ') : ''}`, 12, hudY);
        hudY += 14;
      }

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

    function drawFloaters() {
      ctx.save();
      ctx.textAlign = 'center';
      for (const f of floaters) {
        const t = f.age / f.maxAge;
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color; ctx.shadowBlur = 6;
        const big = f.text === 'CRIT!' || f.text === 'DODGE';
        ctx.font = `bold ${big ? 14 : 11}px "Courier New",monospace`;
        ctx.fillText(f.text, f.pos.x, f.pos.y);
      }
      ctx.restore();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.textAlign = 'left';
    }

    function drawStageIntro() {
      const cfg = stageConfig();
      const t   = stageIntroTimer / 2.5; // 1→0 as banner fades
      const a   = t > 0.85 ? (1-t)/0.15 : t < 0.15 ? t/0.15 : 1;
      const W   = canvas.width, H = canvas.height;
      ctx.save();
      ctx.globalAlpha = a * 0.72;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, H/2-64, W, 128);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#334455'; ctx.font = '12px "Courier New",monospace';
      ctx.fillText(`— STAGE ${stage} —`, W/2, H/2-32);
      ctx.fillStyle = '#00ffcc'; ctx.shadowColor = '#00ffcc'; ctx.shadowBlur = 22;
      ctx.font = `bold ${Math.min(38, W*0.065)}px "Courier New",monospace`;
      ctx.fillText(cfg.name, W/2, H/2+10);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#667788'; ctx.font = '12px "Courier New",monospace';
      ctx.fillText(cfg.tagline, W/2, H/2+34);
      ctx.restore();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.textAlign = 'left';
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
        drawCard(dCardX(i), dCardY(i), cw, ch, { id: diff.id, name: diff.name, desc: diff.desc, maxTaken: 1, category: 'stat' }, diff.color);
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
      ctx.fillText('Choose an upgrade:', W/2, H/2-95);
      const cy = wCardY();
      const accent = (cat: string) => cat === 'weapon' ? '#004488' : cat === 'stat' ? '#225500' : '#442200';
      for (let i = 0; i < upgradeChoices.length; i++)
        drawCard(wCardX(i), cy, CW, CH, upgradeChoices[i], accent(upgradeChoices[i].category));
      ctx.textAlign = 'left';
    }

    function drawBetweenStage() {
      const W = canvas.width, H = canvas.height;
      const nextCfg = STAGE_CONFIGS[Math.min(stage, STAGE_CONFIGS.length-1)];
      ctx.fillStyle = 'rgba(0,0,8,0.85)'; ctx.fillRect(0,0,W,H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffff00'; ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 28;
      ctx.font = 'bold 38px "Courier New",monospace';
      ctx.fillText(`★  STAGE ${stage} COMPLETE  ★`, W/2, H/2-145);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#00ffcc'; ctx.shadowColor = '#00ffcc'; ctx.shadowBlur = 8;
      ctx.font = 'bold 18px "Courier New",monospace';
      ctx.fillText(`ENTERING: ${nextCfg.name}`, W/2, H/2-108);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#556677'; ctx.font = '11px "Courier New",monospace';
      ctx.fillText(nextCfg.tagline, W/2, H/2-88);
      ctx.fillStyle = '#aabbcc'; ctx.font = '13px "Courier New",monospace';
      ctx.fillText(`Choose a permanent upgrade:`, W/2, H/2-66);
      const cy = wCardY();
      const accent = (cat: string) => cat === 'weapon' ? '#004488' : cat === 'stat' ? '#225500' : '#442200';
      for (let i = 0; i < upgradeChoices.length; i++)
        drawCard(wCardX(i), cy, CW, CH, upgradeChoices[i], accent(upgradeChoices[i].category));
      ctx.fillStyle = '#334455'; ctx.font = '10px "Courier New",monospace';
      ctx.fillText(`Enemy type: ${nextCfg.enemyType.toUpperCase()}  ·  Boss: ${nextCfg.bossPattern.toUpperCase()}  ·  Modifier: ${nextCfg.modifier.replace(/_/g,' ').toUpperCase()}`, W/2, cy + CH + 28);
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
      const wNames = weapons.map(w => WEAPON_LABELS[w.type]).join(' + ');
      ctx.fillStyle = '#667788'; ctx.font = '11px "Courier New",monospace';
      ctx.fillText(`Weapons: ${wNames}`, W/2, H/2+38);
      ctx.fillStyle = '#556677'; ctx.font = '12px "Courier New",monospace';
      ctx.fillText('[ click to select difficulty and restart ]', W/2, H/2+62);
      ctx.textAlign = 'left';
    }

    // ── main loop ──────────────────────────────────────────────────────────
    let last = 0, animId = 0;

    function loop(ts: number) {
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      const W = canvas.width, H = canvas.height;

      if (gameState === 'playing') {
        stageIntroTimer = Math.max(0, stageIntroTimer - dt);
        ship.x += (mouse.x - ship.x) * player.speed;
        ship.y += (mouse.y - ship.y) * player.speed;

        // berserk cycle
        if (stageConfig().modifier === 'berserk') {
          berserkTimer += dt;
          if (berserkTimer >= 11) berserkTimer = 0;
          berserkActive = berserkTimer >= 8;
        } else { berserkActive = false; }

        // spawn blobs
        gameTime   += dt;
        spawnTimer += dt;
        const si = Math.max(0.35, spawnBase() - gameTime * 0.02);
        if (spawnTimer >= si) { spawnTimer = 0; spawnBlob(); }

        // boss trigger
        if (!boss && killCount >= killsNeeded()) spawnBoss();

        // enemy HP regen
        if (stageConfig().modifier === 'regen_enemies')
          for (const b of blobs) b.hp = Math.min(b.maxHp, b.hp + 0.5*dt);

        // move blobs — per-type speed multipliers + berserk
        const baseSpd = blobSpd() * (berserkActive ? 1.6 : 1.0);
        for (const b of blobs) {
          const sm = b.enemyType === 'swarm' ? 1.4 : b.enemyType === 'tank' ? 0.55 : 1.0;
          const bs = baseSpd * sm;
          const dx = ship.x-b.pos.x, dy = ship.y-b.pos.y;
          const len = Math.sqrt(dx*dx+dy*dy) || 1;
          b.pos.x += (dx/len)*bs*dt; b.pos.y += (dy/len)*bs*dt;
        }

        // move boss — per-pattern behavior
        if (boss) {
          if (boss.pattern === 'chase') {
            const dx = ship.x-boss.pos.x, dy = ship.y-boss.pos.y;
            const len = Math.sqrt(dx*dx+dy*dy) || 1;
            boss.pos.x += (dx/len)*38*dt; boss.pos.y += (dy/len)*38*dt;
          } else if (boss.pattern === 'orbit') {
            bossOrbitAngle += dt * 0.9;
            const orbitR = 200;
            const tx = ship.x + Math.cos(bossOrbitAngle)*orbitR;
            const ty = ship.y + Math.sin(bossOrbitAngle)*orbitR;
            const dx = tx-boss.pos.x, dy = ty-boss.pos.y;
            const len = Math.sqrt(dx*dx+dy*dy) || 1;
            boss.pos.x += (dx/len)*90*dt; boss.pos.y += (dy/len)*90*dt;
          } else if (boss.pattern === 'charge') {
            bossChargeTimer -= dt;
            if (bossChargeTimer <= 0 && !bossChargeVel) {
              const dx = ship.x-boss.pos.x, dy = ship.y-boss.pos.y;
              const len = Math.sqrt(dx*dx+dy*dy) || 1;
              bossChargeVel = { x:(dx/len)*340, y:(dy/len)*340 };
              bossChargeTimer = 2.5;
            }
            if (bossChargeVel) {
              boss.pos.x += bossChargeVel.x*dt; boss.pos.y += bossChargeVel.y*dt;
              bossChargeVel.x *= Math.pow(0.04, dt); bossChargeVel.y *= Math.pow(0.04, dt);
              if (Math.abs(bossChargeVel.x) < 5) bossChargeVel = null;
            }
          } else if (boss.pattern === 'summon') {
            const dx = ship.x-boss.pos.x, dy = ship.y-boss.pos.y;
            const len = Math.sqrt(dx*dx+dy*dy) || 1;
            boss.pos.x += (dx/len)*22*dt; boss.pos.y += (dy/len)*22*dt;
            bossSummonTimer -= dt;
            if (bossSummonTimer <= 0) { bossSummonTimer = 5; for (let i = 0; i < 3; i++) spawnBlob(); }
          } else if (boss.pattern === 'teleport') {
            bossTeleportTimer -= dt;
            if (bossTeleportTimer <= 0) {
              bossTeleportTimer = 4;
              boss.pos.x = 80 + Math.random()*(canvas.width-160);
              boss.pos.y = 80 + Math.random()*(canvas.height-160);
            }
            const dx = ship.x-boss.pos.x, dy = ship.y-boss.pos.y;
            const len = Math.sqrt(dx*dx+dy*dy) || 1;
            boss.pos.x += (dx/len)*28*dt; boss.pos.y += (dy/len)*28*dt;
          }
        }

        // player contact damage
        invTimer = Math.max(0, invTimer - dt);
        const dmg = contactDmg();
        for (const b of blobs) {
          if (d(ship, b.pos) < b.radius+12) {
            const dm = b.enemyType === 'tank' ? 2.0 : b.enemyType === 'swarm' ? 0.5 : 1.0;
            damagePlayer(dmg * dm); break;
          }
        }
        if (boss && d(ship, boss.pos) < boss.radius+14) damagePlayer(dmg * 2);

        // auto fire — each weapon on its own timer
        if (blobs.length || boss) {
          for (const w of weapons) {
            w.fireTimer += dt;
            if (w.fireTimer >= w.fireInterval) { w.fireTimer = 0; fireBulletForWeapon(w); }
          }
        }

        // move bullets
        for (const b of bullets) {
          if (b.homingStrength > 0) {
            const tp = nearestTarget(b.pos);
            if (tp) {
              const dx = tp.x-b.pos.x, dy = tp.y-b.pos.y;
              const len = Math.sqrt(dx*dx+dy*dy) || 1;
              const spd = Math.sqrt(b.vel.x**2+b.vel.y**2);
              if (spd > 0) {
                const hf = b.homingStrength * dt;
                b.vel.x += (dx/len*spd - b.vel.x) * hf;
                b.vel.y += (dy/len*spd - b.vel.y) * hf;
                // renormalize to preserve speed — lerping velocity vectors bleeds speed on sharp turns
                const newSpd = Math.sqrt(b.vel.x**2+b.vel.y**2) || 1;
                b.vel.x = b.vel.x/newSpd * spd;
                b.vel.y = b.vel.y/newSpd * spd;
              }
            }
          }
          if (b.maxRange > 0) b.distTraveled += Math.sqrt(b.vel.x**2+b.vel.y**2) * dt;
          b.pos.x += b.vel.x*dt; b.pos.y += b.vel.y*dt;
        }

        // bullet ↔ blob collision
        const deadBlobs      = new Set<number>();
        const deadBullets    = new Set<number>();
        const pendingExp: Array<{ pos: Vec2; r: number }> = [];
        const splitterSpawns: Vec2[] = [];

        for (const b of bullets) {
          if (deadBullets.has(b.id)) continue;
          for (const blob of blobs) {
            if (deadBlobs.has(blob.id)) continue;
            if (d(b.pos, blob.pos) >= blob.radius + 4 * b.bulletSize) continue;
            // ghost dodge: roll once per bullet per ghost encounter
            if (blob.dodgeChance > 0 && !b.ghostDodged.has(blob.id)) {
              if (Math.random() < blob.dodgeChance) {
                b.ghostDodged.add(blob.id);
                addFloater({ x: blob.pos.x, y: blob.pos.y - blob.radius }, 'MISS', '#88aacc');
                continue;
              }
              b.ghostDodged.add(blob.id); // successfully hit, mark so we don't re-roll
            }
            const crit = player.critChance > 0 && Math.random() < player.critChance;
            const baseDmg = bulletDmg(b.weaponType) * player.damage * (crit ? player.critMult : 1.0);
            blob.hp -= baseDmg;
            addFloater(
              { x: blob.pos.x + (Math.random()-0.5)*8, y: blob.pos.y - blob.radius },
              crit ? 'CRIT!' : Math.ceil(baseDmg).toString(),
              crit ? '#ffff44' : '#aabbcc'
            );
            const killed = blob.hp <= 0;
            if (killed) { deadBlobs.add(blob.id); if (blob.spawnsChildren) splitterSpawns.push({ ...blob.pos }); }
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
            if (d(b.pos, boss.pos) >= boss.radius + 4 * b.bulletSize) continue;
            const crit    = player.critChance > 0 && Math.random() < player.critChance;
            const baseDmg = bulletDmg(b.weaponType) * player.damage * (crit ? player.critMult : 1.0);
            boss.hp -= baseDmg;
            addFloater(
              { x: boss.pos.x + (Math.random()-0.5)*20, y: boss.pos.y - boss.radius },
              crit ? 'CRIT!' : Math.ceil(baseDmg).toString(),
              crit ? '#ffff44' : '#dd88ff'
            );
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
                upgradeChoices = pickNFromPool(3);
                gameState      = 'between_stage'; canvas.style.cursor = 'default';
              }
              break;
            }
          }
        }

        // kill count + orbs + vampire + modifiers
        killCount += deadBlobs.size;
        if (vampireHeal > 0 && deadBlobs.size > 0)
          player.hp = Math.min(player.maxHp, player.hp + deadBlobs.size * vampireHeal);
        for (const blob of blobs) {
          if (deadBlobs.has(blob.id)) {
            xpOrbs.push({ id: uid++, pos: { x: blob.pos.x+(Math.random()-0.5)*16, y: blob.pos.y+(Math.random()-0.5)*16 } });
            if (stageConfig().modifier === 'explosive_death')
              explosions.push({ id: uid++, pos: { ...blob.pos }, age: 0, maxR: 55 });
          }
        }
        // splitter: spawn 2 mini-blobs per dead splitter parent
        for (const sp of splitterSpawns) {
          for (let i = 0; i < 2; i++) {
            const a = Math.random()*Math.PI*2;
            const mhp = Math.max(1, Math.round(blobHp() * 0.4));
            blobs.push({ id: uid++, pos: { x: sp.x+Math.cos(a)*22, y: sp.y+Math.sin(a)*22 },
              radius: 8, hp: mhp, maxHp: mhp, fireTimer: 2,
              enemyType: 'splitter', dodgeChance: 0, spawnsChildren: false });
          }
        }
        blobs   = blobs.filter(b => !deadBlobs.has(b.id));
        bullets = bullets.filter(b => !deadBullets.has(b.id));
        bullets = bullets.filter(b =>
          b.pos.x>-40 && b.pos.x<W+40 && b.pos.y>-40 && b.pos.y<H+40 &&
          (b.maxRange <= 0 || b.distTraveled < b.maxRange)
        );

        // explosions age
        explosions = explosions.filter(e => e.age < 0.45);
        for (const e of explosions) e.age += dt;

        // railgun flash age
        for (const f of railgunFlashes) f.age += dt;
        railgunFlashes = railgunFlashes.filter(f => f.age < 0.3);

        // XP orb pull & collect
        const PULL = player.xpRange;
        const got: number[] = [];
        for (const o of xpOrbs) {
          const dx = ship.x-o.pos.x, dy = ship.y-o.pos.y;
          const dist = Math.sqrt(dx*dx+dy*dy) || 1;
          if (dist < PULL) { const s = 160+(PULL-dist)*2.5; o.pos.x += (dx/dist)*s*dt; o.pos.y += (dy/dist)*s*dt; }
          if (dist < 14) got.push(o.id);
        }
        if (got.length) { xpOrbs = xpOrbs.filter(o => !got.includes(o.id)); const dm = stageConfig().modifier === 'xp_drought' ? 0.5 : 1; addXp(got.length * player.xpMult * dm); }

        // HP & shield regen
        if (player.regen > 0) player.hp = Math.min(player.maxHp, player.hp + player.regen*dt);
        shieldRegenDelay = Math.max(0, shieldRegenDelay - dt);
        if (player.maxShield > 0 && player.shield < player.maxShield && shieldRegenDelay <= 0)
          player.shield = Math.min(player.maxShield, player.shield + player.shieldRegen * dt);

        // blobs fire back
        const bfi = blobFireInterval(), bfs = blobFireSpd(), bfd = blobFireDmg();
        for (const b of blobs) {
          b.fireTimer -= dt;
          if (b.fireTimer <= 0 && d(b.pos, ship) < 500) {
            b.fireTimer = bfi * (0.8 + Math.random() * 0.4);
            const dx = ship.x-b.pos.x, dy = ship.y-b.pos.y;
            const len = Math.sqrt(dx*dx+dy*dy) || 1;
            enemyBullets.push({ id: uid++, pos: { ...b.pos }, vel: { x:(dx/len)*bfs, y:(dy/len)*bfs }, dmg: bfd });
          }
        }

        // boss fires spread shots
        if (boss) {
          bossFireTimer -= dt;
          if (bossFireTimer <= 0) {
            bossFireTimer = bossFireInterval();
            const dx = ship.x-boss.pos.x, dy = ship.y-boss.pos.y;
            const base = Math.atan2(dy, dx), spd = bossFireSpd();
            for (let i = -1; i <= 1; i++) {
              const a = base + i * 0.28;
              enemyBullets.push({ id: uid++, pos: { ...boss.pos }, vel: { x:Math.cos(a)*spd, y:Math.sin(a)*spd }, dmg: contactDmg() * 0.55 });
            }
          }
        }

        // move enemy bullets & check player collision
        for (const eb of enemyBullets) { eb.pos.x += eb.vel.x*dt; eb.pos.y += eb.vel.y*dt; }
        const hitEB = new Set<number>();
        for (const eb of enemyBullets) {
          if (d(eb.pos, ship) < 12) { damagePlayer(eb.dmg); hitEB.add(eb.id); }
        }
        enemyBullets = enemyBullets.filter(eb =>
          !hitEB.has(eb.id) && eb.pos.x>-30 && eb.pos.x<W+30 && eb.pos.y>-30 && eb.pos.y<H+30
        );
      }

      // floaters animate regardless of game state
      for (const f of floaters) { f.pos.y -= 35*dt; f.age += dt; }
      floaters = floaters.filter(f => f.age < f.maxAge);

      // ── render ──────────────────────────────────────────────────────────
      ctx.fillStyle = palette().bg; ctx.fillRect(0,0,W,H);
      drawStars();
      for (const f of railgunFlashes) drawRailgunFlash(f);
      for (const e of explosions) drawExplosion(e);
      for (const o of xpOrbs)     drawOrb(o);
      for (const bl of blobs)     drawBlob(bl);
      if (boss) drawBoss(boss);
      for (const b of bullets)    drawBullet(b);
      for (const eb of enemyBullets) drawEnemyBullet(eb);

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

        drawFloaters();
        drawHud();
        if (stageIntroTimer > 0) drawStageIntro();
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
