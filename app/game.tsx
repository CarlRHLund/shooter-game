'use client';

import { useEffect, useRef } from 'react';

// ── types ─────────────────────────────────────────────────────────────────────
interface Vec2         { x: number; y: number }
interface Star         { x: number; y: number; size: number; bright: number }
type WeaponType    = 'pistol' | 'shotgun' | 'laser' | 'rocket' | 'railgun' | 'electric';
type EnemyType     = 'standard' | 'swarm' | 'tank' | 'ghost' | 'splitter';
type BossPattern   = 'chase' | 'orbit' | 'charge' | 'summon' | 'teleport';
type StageModifier = 'none' | 'dense_spawn' | 'xp_drought' | 'fog' | 'explosive_death' | 'regen_enemies' | 'berserk';
type UpgradeRarity = 'normal' | 'rare' | 'epic' | 'legendary';
type ItemSlot      = 'hull' | 'drive' | 'core';
type ItemRarity    = 'common' | 'rare' | 'epic' | 'legendary';
type GameState     = 'start' | 'playing' | 'upgrading' | 'between_stage' | 'game_over';

interface StageConfig  { name: string; tagline: string; modifier: StageModifier; enemyType: EnemyType; bossPattern: BossPattern }
interface Blob         { id: number; pos: Vec2; radius: number; hp: number; maxHp: number; fireTimer: number; enemyType: EnemyType; dodgeChance: number; spawnsChildren: boolean }
interface Boss         { id: number; pos: Vec2; radius: number; hp: number; maxHp: number; pattern: BossPattern }
interface XpOrb        { id: number; pos: Vec2 }
interface Explosion    { id: number; pos: Vec2; age: number; maxR: number }
interface RailgunFlash { id: number; fromX: number; fromY: number; toX: number; toY: number; age: number; maxAge?: number; color?: string }
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
  lifesteal: number; regenDelay: number;
  attackSpeedMult: number;
  bulletDamageMult: number; laserDamageMult: number; electricDamageMult: number;
  attackRangeMult: number; explodeRadiusMult: number;
  resourceFind: number; rarityFind: number;
}
interface Floater { pos: Vec2; text: string; age: number; maxAge: number; color: string }

interface UpgradeVariant {
  rarity: UpgradeRarity; desc: string; penaltyDesc?: string;
  hpAdd?: number; regenAdd?: number; regenDelayAdd?: number; lifestealAdd?: number;
  armorAdd?: number; speedAdd?: number; dodgeAdd?: number; critAdd?: number;
  shieldAdd?: number; shieldRegenAdd?: number;
  xpRangeAdd?: number; xpMultMult?: number; resourceFindAdd?: number; rarityFindAdd?: number;
  attackSpeedAdd?: number; bulletDmgAdd?: number; laserDmgAdd?: number; electricDmgAdd?: number;
  attackRangeAdd?: number; explodeRadiusAdd?: number;
  wFireMult?: number; wMultiAdd?: number; wExplodeAdd?: number; wPierceAdd?: number;
  wBounceAdd?: number; wHomingAdd?: number; wSizeMult?: number;
  addWeapon?: WeaponType; vampireAdd?: number;
  hpPenFrac?: number; armorPen?: number; attackRangePen?: number;
}
interface Upgrade {
  id: string; name: string; maxTaken: number; category: 'weapon' | 'stat' | 'passive';
  variants?: Record<UpgradeRarity, UpgradeVariant>;
  desc?: string;
}
interface Difficulty { id: string; name: string; desc: string; color: string; hpMult: number; spdMult: number; dmgMult: number; spawnMult: number }
interface Item {
  id: string; name: string; slot: ItemSlot; rarity: ItemRarity; desc: string;
  hpAdd?: number; regenAdd?: number; armorAdd?: number; speedAdd?: number;
  dodgeAdd?: number; xpRangeAdd?: number; critAdd?: number;
  shieldAdd?: number; shieldRegenAdd?: number;
  xpMultMult?: number; damageMult?: number;
  wFireMult?: number; wMultiAdd?: number;
  lifestealAdd?: number; regenDelayAdd?: number; attackSpeedAdd?: number;
  bulletDmgAdd?: number; laserDmgAdd?: number; electricDmgAdd?: number;
  attackRangeAdd?: number; explodeRadiusAdd?: number;
  resourceFindAdd?: number; rarityFindAdd?: number;
}

// ── upgrade pool ──────────────────────────────────────────────────────────────
const UPGRADE_POOL: Upgrade[] = [
  // weapon modifiers
  { id: 'rapid', name: 'RAPID FIRE', category: 'weapon', maxTaken: 5, variants: {
    normal:    { rarity: 'normal',    desc: '+22% fire rate',                    wFireMult: 0.82 },
    rare:      { rarity: 'rare',      desc: '+33% fire rate',                    wFireMult: 0.75 },
    epic:      { rarity: 'epic',      desc: '+49% fire rate',                    wFireMult: 0.67, attackRangePen: 0.15, penaltyDesc: '-15% range' },
    legendary: { rarity: 'legendary', desc: '+72% fire rate',                    wFireMult: 0.58, attackRangePen: 0.25, penaltyDesc: '-25% range' },
  }},
  { id: 'multi', name: 'MULTI SHOT', category: 'weapon', maxTaken: 4, variants: {
    normal:    { rarity: 'normal',    desc: 'All weapons +1 extra bullet',       wMultiAdd: 1 },
    rare:      { rarity: 'rare',      desc: 'All weapons +2 extra bullets',      wMultiAdd: 2 },
    epic:      { rarity: 'epic',      desc: 'All weapons +3 extra bullets',      wMultiAdd: 3 },
    legendary: { rarity: 'legendary', desc: 'All weapons +5 extra bullets',      wMultiAdd: 5 },
  }},
  { id: 'explosive', name: 'EXPLOSIVE', category: 'weapon', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: 'Bullets explode · +50 radius',      wExplodeAdd: 50 },
    rare:      { rarity: 'rare',      desc: 'Bullets explode · +80 radius',      wExplodeAdd: 80 },
    epic:      { rarity: 'epic',      desc: 'Bullets explode · +120 radius',     wExplodeAdd: 120 },
    legendary: { rarity: 'legendary', desc: 'Bullets explode · +180 radius',     wExplodeAdd: 180 },
  }},
  { id: 'piercing', name: 'PIERCING SHOT', category: 'weapon', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: 'All bullets pierce +1 enemy',       wPierceAdd: 1 },
    rare:      { rarity: 'rare',      desc: 'All bullets pierce +2 enemies',     wPierceAdd: 2 },
    epic:      { rarity: 'epic',      desc: 'All bullets pierce +4 enemies',     wPierceAdd: 4 },
    legendary: { rarity: 'legendary', desc: 'All bullets pierce +7 enemies',     wPierceAdd: 7 },
  }},
  { id: 'bouncing', name: 'BOUNCING SHOT', category: 'weapon', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: 'Bullets bounce to next target',     wBounceAdd: 1 },
    rare:      { rarity: 'rare',      desc: '+1 bounce · +1 extra bullet',       wBounceAdd: 1, wMultiAdd: 1 },
    epic:      { rarity: 'epic',      desc: 'Bullets bounce twice',              wBounceAdd: 2 },
    legendary: { rarity: 'legendary', desc: 'Bullets bounce three times',        wBounceAdd: 3 },
  }},
  { id: 'storm', name: 'BULLET STORM', category: 'weapon', maxTaken: 2, variants: {
    normal:    { rarity: 'normal',    desc: '+4 bullets · fire rate +20%',       wMultiAdd: 4, wFireMult: 0.82 },
    rare:      { rarity: 'rare',      desc: '+5 bullets · fire rate +25%',       wMultiAdd: 5, wFireMult: 0.78 },
    epic:      { rarity: 'epic',      desc: '+6 bullets · fire rate +30%',       wMultiAdd: 6, wFireMult: 0.72 },
    legendary: { rarity: 'legendary', desc: '+8 bullets · fire rate +35%',       wMultiAdd: 8, wFireMult: 0.67 },
  }},
  { id: 'homing', name: 'HOMING ROUNDS', category: 'weapon', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: 'Bullets curve toward enemies ×1',   wHomingAdd: 1.0 },
    rare:      { rarity: 'rare',      desc: 'Strong homing pull ×1.5',           wHomingAdd: 1.5 },
    epic:      { rarity: 'epic',      desc: 'Very strong homing pull ×2',        wHomingAdd: 2.0 },
    legendary: { rarity: 'legendary', desc: 'Extreme homing pull ×3',            wHomingAdd: 3.0 },
  }},
  { id: 'bullet_size', name: 'BULLET SIZE', category: 'weapon', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: 'Bullets larger · +25% hitbox',      wSizeMult: 1.25 },
    rare:      { rarity: 'rare',      desc: 'Bullets larger · +40% hitbox',      wSizeMult: 1.40 },
    epic:      { rarity: 'epic',      desc: 'Bullets larger · +65% hitbox',      wSizeMult: 1.65 },
    legendary: { rarity: 'legendary', desc: 'Bullets huge · +100% hitbox',       wSizeMult: 2.00 },
  }},
  // weapon archetypes
  { id: 'add_shotgun', name: 'ADD SHOTGUN', category: 'weapon', maxTaken: 1, variants: {
    normal:    { rarity: 'normal',    desc: '5 pellets · short range · high burst', addWeapon: 'shotgun' },
    rare:      { rarity: 'rare',      desc: '5 pellets · short range · high burst', addWeapon: 'shotgun' },
    epic:      { rarity: 'epic',      desc: '5 pellets · short range · high burst', addWeapon: 'shotgun' },
    legendary: { rarity: 'legendary', desc: '5 pellets · short range · high burst', addWeapon: 'shotgun' },
  }},
  { id: 'add_laser', name: 'ADD LASER', category: 'weapon', maxTaken: 1, variants: {
    normal:    { rarity: 'normal',    desc: 'Rapid thin shots · infinite pierce',   addWeapon: 'laser' },
    rare:      { rarity: 'rare',      desc: 'Rapid thin shots · infinite pierce',   addWeapon: 'laser' },
    epic:      { rarity: 'epic',      desc: 'Rapid thin shots · infinite pierce',   addWeapon: 'laser' },
    legendary: { rarity: 'legendary', desc: 'Rapid thin shots · infinite pierce',   addWeapon: 'laser' },
  }},
  { id: 'add_rocket', name: 'ADD ROCKET', category: 'weapon', maxTaken: 1, variants: {
    normal:    { rarity: 'normal',    desc: 'Slow · AOE explosion · homing',        addWeapon: 'rocket' },
    rare:      { rarity: 'rare',      desc: 'Slow · AOE explosion · homing',        addWeapon: 'rocket' },
    epic:      { rarity: 'epic',      desc: 'Slow · AOE explosion · homing',        addWeapon: 'rocket' },
    legendary: { rarity: 'legendary', desc: 'Slow · AOE explosion · homing',        addWeapon: 'rocket' },
  }},
  { id: 'add_railgun', name: 'ADD RAILGUN', category: 'weapon', maxTaken: 1, variants: {
    normal:    { rarity: 'normal',    desc: 'Instant line · pierces all enemies',   addWeapon: 'railgun' },
    rare:      { rarity: 'rare',      desc: 'Instant line · pierces all enemies',   addWeapon: 'railgun' },
    epic:      { rarity: 'epic',      desc: 'Instant line · pierces all enemies',   addWeapon: 'railgun' },
    legendary: { rarity: 'legendary', desc: 'Instant line · pierces all enemies',   addWeapon: 'railgun' },
  }},
  { id: 'add_electric', name: 'ADD TESLA', category: 'weapon', maxTaken: 1, variants: {
    normal:    { rarity: 'normal',    desc: 'Chain lightning · arcs 2 nearby foes', addWeapon: 'electric' },
    rare:      { rarity: 'rare',      desc: 'Chain lightning · arcs 2 nearby foes', addWeapon: 'electric' },
    epic:      { rarity: 'epic',      desc: 'Chain lightning · arcs 2 nearby foes', addWeapon: 'electric' },
    legendary: { rarity: 'legendary', desc: 'Chain lightning · arcs 2 nearby foes', addWeapon: 'electric' },
  }},
  // stat upgrades
  { id: 'max_hp', name: 'MAX HEALTH', category: 'stat', maxTaken: 5, variants: {
    normal:    { rarity: 'normal',    desc: '+25 max HP · full restore',           hpAdd: 25 },
    rare:      { rarity: 'rare',      desc: '+40 max HP · full restore',           hpAdd: 40 },
    epic:      { rarity: 'epic',      desc: '+60 max HP · full restore',           hpAdd: 60 },
    legendary: { rarity: 'legendary', desc: '+90 max HP · full restore',           hpAdd: 90 },
  }},
  { id: 'regen', name: 'HP REGEN', category: 'stat', maxTaken: 4, variants: {
    normal:    { rarity: 'normal',    desc: '+2 HP per second',                    regenAdd: 2 },
    rare:      { rarity: 'rare',      desc: '+4 HP per second',                    regenAdd: 4 },
    epic:      { rarity: 'epic',      desc: '+6 HP/s · regen starts 0.6s sooner', regenAdd: 6,  regenDelayAdd: -0.6 },
    legendary: { rarity: 'legendary', desc: '+10 HP/s · regen starts 1s sooner',  regenAdd: 10, regenDelayAdd: -1.0 },
  }},
  { id: 'speed', name: 'MOVE SPEED', category: 'stat', maxTaken: 4, variants: {
    normal:    { rarity: 'normal',    desc: 'Ship speed +11%',                     speedAdd: 0.015 },
    rare:      { rarity: 'rare',      desc: 'Ship speed +16%',                     speedAdd: 0.022 },
    epic:      { rarity: 'epic',      desc: 'Ship speed +24%',                     speedAdd: 0.032 },
    legendary: { rarity: 'legendary', desc: 'Ship speed +32%',                     speedAdd: 0.045 },
  }},
  { id: 'armor', name: 'ARMOR', category: 'stat', maxTaken: 4, variants: {
    normal:    { rarity: 'normal',    desc: '-8% incoming damage',                 armorAdd: 0.08 },
    rare:      { rarity: 'rare',      desc: '-12% incoming damage',                armorAdd: 0.12 },
    epic:      { rarity: 'epic',      desc: '-17% incoming damage',                armorAdd: 0.17 },
    legendary: { rarity: 'legendary', desc: '-24% incoming damage',                armorAdd: 0.24 },
  }},
  { id: 'dodge', name: 'DODGE ROLL', category: 'stat', maxTaken: 4, variants: {
    normal:    { rarity: 'normal',    desc: '+7% chance to evade all hits',        dodgeAdd: 0.07 },
    rare:      { rarity: 'rare',      desc: '+11% dodge chance',                   dodgeAdd: 0.11 },
    epic:      { rarity: 'epic',      desc: '+16% dodge chance',                   dodgeAdd: 0.16 },
    legendary: { rarity: 'legendary', desc: '+24% dodge chance',                   dodgeAdd: 0.24 },
  }},
  { id: 'crit', name: 'CRIT BOOST', category: 'stat', maxTaken: 4, variants: {
    normal:    { rarity: 'normal',    desc: '+8% critical hit chance',             critAdd: 0.08 },
    rare:      { rarity: 'rare',      desc: '+13% critical hit chance',            critAdd: 0.13 },
    epic:      { rarity: 'epic',      desc: '+18% crit chance',                    critAdd: 0.18, armorPen: 0.08, penaltyDesc: '-8% armor' },
    legendary: { rarity: 'legendary', desc: '+28% crit chance',                    critAdd: 0.28, armorPen: 0.15, penaltyDesc: '-15% armor' },
  }},
  { id: 'lifesteal', name: 'VAMPIRIC', category: 'stat', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: '+3% lifesteal on damage dealt',       lifestealAdd: 0.03 },
    rare:      { rarity: 'rare',      desc: '+6% lifesteal on damage dealt',       lifestealAdd: 0.06 },
    epic:      { rarity: 'epic',      desc: '+10% lifesteal on damage dealt',      lifestealAdd: 0.10 },
    legendary: { rarity: 'legendary', desc: '+16% lifesteal on damage dealt',      lifestealAdd: 0.16 },
  }},
  { id: 'regen_delay', name: 'QUICK RECOVERY', category: 'stat', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: 'HP regen starts 0.6s sooner',        regenDelayAdd: -0.6 },
    rare:      { rarity: 'rare',      desc: 'HP regen starts 1.0s sooner',        regenDelayAdd: -1.0 },
    epic:      { rarity: 'epic',      desc: 'HP regen starts 1.5s sooner',        regenDelayAdd: -1.5 },
    legendary: { rarity: 'legendary', desc: 'HP regen starts 2.5s sooner',        regenDelayAdd: -2.5 },
  }},
  { id: 'bullet_boost', name: 'KINETIC AMP', category: 'stat', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: '+20% bullet/rocket damage',           bulletDmgAdd: 0.20 },
    rare:      { rarity: 'rare',      desc: '+35% bullet/rocket damage',           bulletDmgAdd: 0.35 },
    epic:      { rarity: 'epic',      desc: '+55% bullet/rocket damage',           bulletDmgAdd: 0.55, hpPenFrac: 0.12, penaltyDesc: '-12% max HP' },
    legendary: { rarity: 'legendary', desc: '+80% bullet/rocket damage',           bulletDmgAdd: 0.80, hpPenFrac: 0.22, armorPen: 0.10, penaltyDesc: '-22% max HP · -10% armor' },
  }},
  { id: 'laser_boost', name: 'LASER FOCUS', category: 'stat', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: '+25% laser damage',                   laserDmgAdd: 0.25 },
    rare:      { rarity: 'rare',      desc: '+45% laser damage',                   laserDmgAdd: 0.45 },
    epic:      { rarity: 'epic',      desc: '+75% laser damage',                   laserDmgAdd: 0.75 },
    legendary: { rarity: 'legendary', desc: '+120% laser damage',                  laserDmgAdd: 1.20 },
  }},
  { id: 'electric_boost', name: 'SURGE COIL', category: 'stat', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: '+25% electric damage',                electricDmgAdd: 0.25 },
    rare:      { rarity: 'rare',      desc: '+45% electric damage',                electricDmgAdd: 0.45 },
    epic:      { rarity: 'epic',      desc: '+75% electric damage',                electricDmgAdd: 0.75 },
    legendary: { rarity: 'legendary', desc: '+120% electric damage',               electricDmgAdd: 1.20 },
  }},
  { id: 'attack_speed', name: 'ASSAULT MODE', category: 'stat', maxTaken: 4, variants: {
    normal:    { rarity: 'normal',    desc: '+20% global attack speed',            attackSpeedAdd: 0.20 },
    rare:      { rarity: 'rare',      desc: '+35% global attack speed',            attackSpeedAdd: 0.35 },
    epic:      { rarity: 'epic',      desc: '+50% attack speed',                   attackSpeedAdd: 0.50, armorPen: 0.10, penaltyDesc: '-10% armor' },
    legendary: { rarity: 'legendary', desc: '+70% attack speed',                   attackSpeedAdd: 0.70, armorPen: 0.20, hpPenFrac: 0.08, penaltyDesc: '-20% armor · -8% max HP' },
  }},
  { id: 'range_boost', name: 'LONG RANGE', category: 'stat', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: '+30% attack range',                   attackRangeAdd: 0.30 },
    rare:      { rarity: 'rare',      desc: '+55% attack range',                   attackRangeAdd: 0.55 },
    epic:      { rarity: 'epic',      desc: '+90% attack range',                   attackRangeAdd: 0.90 },
    legendary: { rarity: 'legendary', desc: '+140% attack range',                  attackRangeAdd: 1.40 },
  }},
  { id: 'blast_wave', name: 'BLAST WAVE', category: 'stat', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: '+30% explosion radius',               explodeRadiusAdd: 0.30 },
    rare:      { rarity: 'rare',      desc: '+55% explosion radius',               explodeRadiusAdd: 0.55 },
    epic:      { rarity: 'epic',      desc: '+90% explosion radius',               explodeRadiusAdd: 0.90 },
    legendary: { rarity: 'legendary', desc: '+150% explosion radius',              explodeRadiusAdd: 1.50 },
  }},
  // passives
  { id: 'shield', name: 'SHIELD CELL', category: 'passive', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: '+35 shield · +1.5/s regen',           shieldAdd: 35,  shieldRegenAdd: 1.5 },
    rare:      { rarity: 'rare',      desc: '+55 shield · +2.5/s regen',           shieldAdd: 55,  shieldRegenAdd: 2.5 },
    epic:      { rarity: 'epic',      desc: '+80 shield · +4/s regen',             shieldAdd: 80,  shieldRegenAdd: 4.0 },
    legendary: { rarity: 'legendary', desc: '+120 shield · +6/s regen',            shieldAdd: 120, shieldRegenAdd: 6.0 },
  }},
  { id: 'xp_magnet', name: 'XP MAGNET', category: 'passive', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: '+60 XP pull range',                   xpRangeAdd: 60 },
    rare:      { rarity: 'rare',      desc: '+100 XP pull range',                  xpRangeAdd: 100 },
    epic:      { rarity: 'epic',      desc: '+160 XP pull range',                  xpRangeAdd: 160 },
    legendary: { rarity: 'legendary', desc: '+240 XP pull range',                  xpRangeAdd: 240 },
  }},
  { id: 'double_xp', name: 'DOUBLE XP', category: 'passive', maxTaken: 2, variants: {
    normal:    { rarity: 'normal',    desc: 'XP earned ×1.35',                     xpMultMult: 1.35 },
    rare:      { rarity: 'rare',      desc: 'XP earned ×1.55',                     xpMultMult: 1.55 },
    epic:      { rarity: 'epic',      desc: 'XP earned ×1.85',                     xpMultMult: 1.85 },
    legendary: { rarity: 'legendary', desc: 'XP earned ×2.25',                     xpMultMult: 2.25 },
  }},
  { id: 'vampire', name: 'VAMPIRE', category: 'passive', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: 'Each kill heals +0.5 HP',             vampireAdd: 0.5 },
    rare:      { rarity: 'rare',      desc: 'Each kill heals +1.0 HP',             vampireAdd: 1.0 },
    epic:      { rarity: 'epic',      desc: 'Each kill heals +1.5 HP',             vampireAdd: 1.5 },
    legendary: { rarity: 'legendary', desc: 'Each kill heals +3.0 HP',             vampireAdd: 3.0 },
  }},
  { id: 'resource_find', name: 'SCAVENGER', category: 'passive', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: '+25% XP value from kills',            resourceFindAdd: 0.25 },
    rare:      { rarity: 'rare',      desc: '+50% XP value from kills',            resourceFindAdd: 0.50 },
    epic:      { rarity: 'epic',      desc: '+80% XP value from kills',            resourceFindAdd: 0.80 },
    legendary: { rarity: 'legendary', desc: '+130% XP value from kills',           resourceFindAdd: 1.30 },
  }},
  { id: 'rarity_find', name: 'FORTUNE', category: 'passive', maxTaken: 3, variants: {
    normal:    { rarity: 'normal',    desc: '+20% better item drops',              rarityFindAdd: 0.20 },
    rare:      { rarity: 'rare',      desc: '+35% better item drops',              rarityFindAdd: 0.35 },
    epic:      { rarity: 'epic',      desc: '+55% better item drops',              rarityFindAdd: 0.55 },
    legendary: { rarity: 'legendary', desc: '+80% better item drops',              rarityFindAdd: 0.80 },
  }},
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

// ── item pool ─────────────────────────────────────────────────────────────────
const ITEM_POOL: Item[] = [
  // hull — defensive (8)
  { id: 'iron_plating',  name: 'IRON PLATING',  slot: 'hull',  rarity: 'common',    desc: '+25 max HP',                                              hpAdd: 25 },
  { id: 'repair_gel',    name: 'REPAIR GEL',    slot: 'hull',  rarity: 'common',    desc: '+2.5 HP regen per second',                                regenAdd: 2.5 },
  { id: 'hard_shell',    name: 'HARD SHELL',    slot: 'hull',  rarity: 'common',    desc: '-12% incoming damage',                                    armorAdd: 0.12 },
  { id: 'quick_clot',    name: 'QUICK CLOT',    slot: 'hull',  rarity: 'common',    desc: '+3 regen/s · regen starts 1.5s sooner',                   regenAdd: 3, regenDelayAdd: -1.5 },
  { id: 'deflector',     name: 'DEFLECTOR',     slot: 'hull',  rarity: 'rare',      desc: '+60 shield · +3/s regen',                                 shieldAdd: 60, shieldRegenAdd: 3 },
  { id: 'ablative_coat', name: 'ABLATIVE COAT', slot: 'hull',  rarity: 'rare',      desc: '+25 HP · -18% damage taken',                              hpAdd: 25, armorAdd: 0.18 },
  { id: 'void_carapace', name: 'VOID CARAPACE', slot: 'hull',  rarity: 'epic',      desc: '+50 HP · -20% dmg · +10% dodge',                          hpAdd: 50, armorAdd: 0.20, dodgeAdd: 0.10 },
  { id: 'titan_hull',    name: 'TITAN HULL',    slot: 'hull',  rarity: 'legendary', desc: '+80 HP · regen 6/s · -25% dmg · +12% dodge',              hpAdd: 80, regenAdd: 6, armorAdd: 0.25, dodgeAdd: 0.12, regenDelayAdd: -2.0 },
  // drive — mobility / utility (8)
  { id: 'thruster',      name: 'THRUSTER',      slot: 'drive', rarity: 'common',    desc: 'Ship speed +18%',                                         speedAdd: 0.025 },
  { id: 'xp_siphon',    name: 'XP SIPHON',     slot: 'drive', rarity: 'common',    desc: '+80 XP pull range',                                       xpRangeAdd: 80 },
  { id: 'lucky_charm',  name: 'LUCKY CHARM',   slot: 'drive', rarity: 'common',    desc: '+8% dodge chance',                                        dodgeAdd: 0.08 },
  { id: 'fortune_chip', name: 'FORTUNE CHIP',  slot: 'drive', rarity: 'common',    desc: '+40% rarity find · +30% resource find',                   rarityFindAdd: 0.40, resourceFindAdd: 0.30 },
  { id: 'phase_drive',  name: 'PHASE DRIVE',   slot: 'drive', rarity: 'rare',      desc: '+15% dodge · speed +18%',                                 dodgeAdd: 0.15, speedAdd: 0.025 },
  { id: 'xp_doubler',  name: 'XP DOUBLER',    slot: 'drive', rarity: 'rare',      desc: 'XP earned ×1.6',                                          xpMultMult: 1.6 },
  { id: 'fury_drive',  name: 'FURY DRIVE',    slot: 'drive', rarity: 'epic',      desc: '+20% dodge · +20% speed · XP ×1.5',                        dodgeAdd: 0.20, speedAdd: 0.030, xpMultMult: 1.5 },
  { id: 'apex_drive',  name: 'APEX DRIVE',    slot: 'drive', rarity: 'legendary', desc: '+25% dodge · +30% speed · XP ×2 · +50% resources',         dodgeAdd: 0.25, speedAdd: 0.040, xpMultMult: 2.0, resourceFindAdd: 0.50 },
  // core — offensive (8)
  { id: 'power_cell',   name: 'POWER CELL',    slot: 'core',  rarity: 'common',    desc: 'All damage ×1.25',                                         damageMult: 1.25 },
  { id: 'targeting_ai', name: 'TARGETING AI',  slot: 'core',  rarity: 'common',    desc: '+12% critical hit chance',                                 critAdd: 0.12 },
  { id: 'fast_loader',  name: 'FAST LOADER',   slot: 'core',  rarity: 'common',    desc: 'All weapons fire rate +22%',                               wFireMult: 0.82 },
  { id: 'surge_module', name: 'SURGE MODULE',  slot: 'core',  rarity: 'common',    desc: '+50% electric dmg · +30% laser dmg',                       electricDmgAdd: 0.50, laserDmgAdd: 0.30 },
  { id: 'crit_matrix',  name: 'CRIT MATRIX',   slot: 'core',  rarity: 'rare',      desc: '+20% crit · damage ×1.2',                                  critAdd: 0.20, damageMult: 1.2 },
  { id: 'burst_core',   name: 'BURST CORE',    slot: 'core',  rarity: 'rare',      desc: 'All weapons +3 extra bullets',                             wMultiAdd: 3 },
  { id: 'fury_engine',  name: 'FURY ENGINE',   slot: 'core',  rarity: 'epic',      desc: 'Fire ×1.5 · dmg ×1.35 · +10% crit',                       wFireMult: 0.667, damageMult: 1.35, critAdd: 0.10 },
  { id: 'singularity',  name: 'SINGULARITY',   slot: 'core',  rarity: 'legendary', desc: 'Dmg ×2.0 · +25% atk speed · +20% crit',                   damageMult: 2.0, attackSpeedAdd: 0.25, critAdd: 0.20 },
];

// ── weapon factories ──────────────────────────────────────────────────────────
function makePistol():  WeaponStats { return { type: 'pistol',  fireInterval: 0.28, multiShot: 0, explodeR: 0,  piercing: 0, bouncing: 0, bulletSpeed: 520,  bulletSize: 1.0, range: 0,   damage: 1.0,  homingStrength: 0,   fireTimer: 0 }; }
function makeShotgun(): WeaponStats { return { type: 'shotgun', fireInterval: 0.55, multiShot: 4, explodeR: 0,  piercing: 0, bouncing: 0, bulletSpeed: 400,  bulletSize: 1.2, range: 350, damage: 0.6,  homingStrength: 0,   fireTimer: 0 }; }
function makeLaser():   WeaponStats { return { type: 'laser',   fireInterval: 0.10, multiShot: 0, explodeR: 0,  piercing: 3, bouncing: 0, bulletSpeed: 720,  bulletSize: 0.5, range: 0,   damage: 0.35, homingStrength: 0,   fireTimer: 0 }; }
function makeRocket():  WeaponStats { return { type: 'rocket',  fireInterval: 0.75, multiShot: 0, explodeR: 80, piercing: 0, bouncing: 0, bulletSpeed: 320,  bulletSize: 1.8, range: 0,   damage: 1.5,  homingStrength: 1.0, fireTimer: 0 }; }
function makeRailgun():  WeaponStats { return { type: 'railgun',  fireInterval: 1.20, multiShot: 0, explodeR: 0,  piercing: 0, bouncing: 0, bulletSpeed: 5000, bulletSize: 0.8, range: 0, damage: 4.0, homingStrength: 0,   fireTimer: 0 }; }
function makeElectric(): WeaponStats { return { type: 'electric', fireInterval: 0.45, multiShot: 0, explodeR: 0,  piercing: 0, bouncing: 0, bulletSpeed: 480,  bulletSize: 0.9, range: 0, damage: 0.7, homingStrength: 0.8, fireTimer: 0 }; }

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
      lifesteal: 0, regenDelay: 3.0,
      attackSpeedMult: 1.0,
      bulletDamageMult: 1.0, laserDamageMult: 1.0, electricDamageMult: 1.0,
      attackRangeMult: 1.0, explodeRadiusMult: 1.0,
      resourceFind: 1.0, rarityFind: 0.0,
    };
    let weapons: WeaponStats[] = [makePistol()];
    let vampireHeal    = 0;
    let hpRegenDelayTimer = 0;
    // cumulative weapon mod trackers (for retroactive application to new weapons)
    let cumWFireMult   = 1.0;
    let cumWMultiAdd   = 0;
    let cumWExplodeAdd = 0;
    let cumWPierceAdd  = 0;
    let cumWBounceAdd  = 0;
    let cumWHomingAdd  = 0;
    let cumWSizeMult   = 1.0;
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
    const equipped: Record<ItemSlot, Item | null> = { hull: null, drive: null, core: null };
    let pendingItem: Item | null = null;
    let itemDecided = false;

    // ── UI state ───────────────────────────────────────────────────────────
    let gameState: GameState = 'start';
    let difficulty: Difficulty = DIFFICULTIES[1];
    let upgradeChoices: Array<{ upgrade: Upgrade; rarity: UpgradeRarity }> = [];

    const mouse: Vec2 = { x: canvas.width/2, y: canvas.height/2 };
    const ship:  Vec2 = { x: canvas.width/2, y: canvas.height/2 };

    // ── stage scaling ──────────────────────────────────────────────────────
    function rollRarity(): UpgradeRarity {
      const bias = Math.min(0.4, player.rarityFind * 0.1);
      const r = Math.random() - bias;
      if (r < 0.58) return 'normal';
      if (r < 0.83) return 'rare';
      if (r < 0.97) return 'epic';
      return 'legendary';
    }

    function pickNFromPool(n: number): Array<{ upgrade: Upgrade; rarity: UpgradeRarity }> {
      const heldTypes = new Set(weapons.map(w => w.type));
      const available = UPGRADE_POOL.filter(u => {
        if ((upgradeTaken.get(u.id) || 0) >= u.maxTaken) return false;
        if (u.id === 'add_shotgun'  && (weapons.length >= 3 || heldTypes.has('shotgun')))  return false;
        if (u.id === 'add_laser'    && (weapons.length >= 3 || heldTypes.has('laser')))    return false;
        if (u.id === 'add_rocket'   && (weapons.length >= 3 || heldTypes.has('rocket')))   return false;
        if (u.id === 'add_railgun'  && (weapons.length >= 3 || heldTypes.has('railgun')))  return false;
        if (u.id === 'add_electric' && (weapons.length >= 3 || heldTypes.has('electric'))) return false;
        return true;
      });
      return [...available].sort(() => Math.random()-0.5).slice(0, n).map(upgrade => ({ upgrade, rarity: rollRarity() }));
    }

    function applyUpgrade(id: string, rarity: UpgradeRarity) {
      const u = UPGRADE_POOL.find(up => up.id === id);
      const v = u?.variants?.[rarity];
      if (!v) return;

      // stats
      if (v.hpAdd)           { player.maxHp += v.hpAdd; player.hp = player.maxHp; }
      if (v.regenAdd)          player.regen            += v.regenAdd;
      if (v.regenDelayAdd)     player.regenDelay        = Math.max(0,   player.regenDelay + v.regenDelayAdd);
      if (v.lifestealAdd)      player.lifesteal         = Math.min(0.80, player.lifesteal + v.lifestealAdd);
      if (v.armorAdd)          player.armor             = Math.min(0.85, player.armor + v.armorAdd);
      if (v.speedAdd)          player.speed             = Math.min(0.45, player.speed + v.speedAdd);
      if (v.dodgeAdd)          player.dodge             = Math.min(0.70, player.dodge + v.dodgeAdd);
      if (v.critAdd)           player.critChance        = Math.min(0.75, player.critChance + v.critAdd);
      if (v.shieldAdd)       { player.maxShield += v.shieldAdd; player.shield = player.maxShield; }
      if (v.shieldRegenAdd)    player.shieldRegen       += v.shieldRegenAdd;
      if (v.xpRangeAdd)        player.xpRange           += v.xpRangeAdd;
      if (v.xpMultMult)        player.xpMult            = Math.min(6.0, player.xpMult * v.xpMultMult);
      if (v.attackSpeedAdd)    player.attackSpeedMult   = Math.min(3.0, player.attackSpeedMult + v.attackSpeedAdd);
      if (v.bulletDmgAdd)      player.bulletDamageMult  += v.bulletDmgAdd;
      if (v.laserDmgAdd)       player.laserDamageMult   += v.laserDmgAdd;
      if (v.electricDmgAdd)    player.electricDamageMult += v.electricDmgAdd;
      if (v.attackRangeAdd)    player.attackRangeMult   += v.attackRangeAdd;
      if (v.explodeRadiusAdd)  player.explodeRadiusMult += v.explodeRadiusAdd;
      if (v.resourceFindAdd)   player.resourceFind      += v.resourceFindAdd;
      if (v.rarityFindAdd)     player.rarityFind        += v.rarityFindAdd;
      if (v.vampireAdd)        vampireHeal              += v.vampireAdd;

      // penalties
      if (v.hpPenFrac)     { const pen = player.maxHp * v.hpPenFrac; player.maxHp = Math.max(10, player.maxHp - pen); player.hp = Math.min(player.hp, player.maxHp); }
      if (v.armorPen)        player.armor             = Math.max(0,   player.armor - v.armorPen);
      if (v.attackRangePen)  player.attackRangeMult   = Math.max(0.2, player.attackRangeMult - v.attackRangePen);

      // weapon mods — apply to all held weapons + update cumulative trackers
      if (v.wFireMult)   { cumWFireMult *= v.wFireMult;   for (const w of weapons) w.fireInterval   = Math.max(0.06, w.fireInterval * v.wFireMult); }
      if (v.wMultiAdd)   { cumWMultiAdd += v.wMultiAdd;   for (const w of weapons) w.multiShot       = Math.min(12, w.multiShot + v.wMultiAdd); }
      if (v.wExplodeAdd) { cumWExplodeAdd += v.wExplodeAdd; for (const w of weapons) w.explodeR      += v.wExplodeAdd; }
      if (v.wPierceAdd)  { cumWPierceAdd += v.wPierceAdd;  for (const w of weapons) w.piercing       += v.wPierceAdd; }
      if (v.wBounceAdd)  { cumWBounceAdd += v.wBounceAdd;  for (const w of weapons) w.bouncing        = Math.min(5, w.bouncing + v.wBounceAdd); }
      if (v.wHomingAdd)  { cumWHomingAdd += v.wHomingAdd;  for (const w of weapons) w.homingStrength  = Math.min(5.0, w.homingStrength + v.wHomingAdd); }
      if (v.wSizeMult)   { cumWSizeMult *= v.wSizeMult;   for (const w of weapons) w.bulletSize     *= v.wSizeMult; }

      // add weapon archetype
      if (v.addWeapon && weapons.length < 3) {
        const factories: Partial<Record<WeaponType, () => WeaponStats>> = {
          shotgun: makeShotgun, laser: makeLaser, rocket: makeRocket, railgun: makeRailgun, electric: makeElectric,
        };
        const nw = factories[v.addWeapon]?.();
        if (nw) {
          nw.fireInterval   = Math.max(0.06, nw.fireInterval * cumWFireMult);
          nw.multiShot      = Math.min(12, nw.multiShot + cumWMultiAdd);
          nw.explodeR      += cumWExplodeAdd;
          nw.piercing      += cumWPierceAdd;
          nw.bouncing       = Math.min(5, nw.bouncing + cumWBounceAdd);
          nw.homingStrength = Math.min(5.0, nw.homingStrength + cumWHomingAdd);
          nw.bulletSize    *= cumWSizeMult;
          const ci = equipped.core;
          if (ci?.wFireMult) nw.fireInterval = Math.max(0.05, nw.fireInterval * ci.wFireMult);
          if (ci?.wMultiAdd) nw.multiShot    = Math.min(12, nw.multiShot + ci.wMultiAdd);
          weapons.push(nw);
        }
      }

      upgradeTaken.set(id, (upgradeTaken.get(id) || 0) + 1);
    }

    function equipItem(item: Item) {
      if (equipped[item.slot]) unequipItem(equipped[item.slot]!);
      equipped[item.slot] = item;
      if (item.hpAdd)          { player.maxHp += item.hpAdd; player.hp = Math.min(player.hp + item.hpAdd, player.maxHp); }
      if (item.regenAdd)         player.regen             += item.regenAdd;
      if (item.regenDelayAdd)    player.regenDelay         = Math.max(0,   player.regenDelay + item.regenDelayAdd);
      if (item.lifestealAdd)     player.lifesteal          = Math.min(0.80, player.lifesteal + item.lifestealAdd);
      if (item.armorAdd)         player.armor              = Math.min(0.85, player.armor + item.armorAdd);
      if (item.speedAdd)         player.speed              = Math.min(0.45, player.speed + item.speedAdd);
      if (item.dodgeAdd)         player.dodge              = Math.min(0.70, player.dodge + item.dodgeAdd);
      if (item.xpRangeAdd)       player.xpRange           += item.xpRangeAdd;
      if (item.critAdd)          player.critChance         = Math.min(0.75, player.critChance + item.critAdd);
      if (item.shieldAdd)      { player.maxShield += item.shieldAdd; player.shield = Math.min(player.shield + item.shieldAdd, player.maxShield); }
      if (item.shieldRegenAdd)   player.shieldRegen        += item.shieldRegenAdd;
      if (item.xpMultMult)       player.xpMult            *= item.xpMultMult;
      if (item.damageMult)       player.damage            *= item.damageMult;
      if (item.attackSpeedAdd)   player.attackSpeedMult   = Math.min(3.0, player.attackSpeedMult + item.attackSpeedAdd);
      if (item.bulletDmgAdd)     player.bulletDamageMult  += item.bulletDmgAdd;
      if (item.laserDmgAdd)      player.laserDamageMult   += item.laserDmgAdd;
      if (item.electricDmgAdd)   player.electricDamageMult += item.electricDmgAdd;
      if (item.attackRangeAdd)   player.attackRangeMult   += item.attackRangeAdd;
      if (item.explodeRadiusAdd) player.explodeRadiusMult += item.explodeRadiusAdd;
      if (item.resourceFindAdd)  player.resourceFind      += item.resourceFindAdd;
      if (item.rarityFindAdd)    player.rarityFind        += item.rarityFindAdd;
      if (item.wFireMult) { const f = item.wFireMult; for (const w of weapons) w.fireInterval = Math.max(0.05, w.fireInterval * f); }
      if (item.wMultiAdd) { const m = item.wMultiAdd; for (const w of weapons) w.multiShot    = Math.min(12,  w.multiShot + m); }
    }
    function unequipItem(item: Item) {
      equipped[item.slot] = null;
      if (item.hpAdd)          { player.maxHp -= item.hpAdd; player.hp = Math.min(player.hp, player.maxHp); }
      if (item.regenAdd)         player.regen             -= item.regenAdd;
      if (item.regenDelayAdd)    player.regenDelay         = Math.min(3.0, player.regenDelay - item.regenDelayAdd);
      if (item.lifestealAdd)     player.lifesteal          = Math.max(0,   player.lifesteal - item.lifestealAdd);
      if (item.armorAdd)         player.armor             -= item.armorAdd;
      if (item.speedAdd)         player.speed             -= item.speedAdd;
      if (item.dodgeAdd)         player.dodge             -= item.dodgeAdd;
      if (item.xpRangeAdd)       player.xpRange           -= item.xpRangeAdd;
      if (item.critAdd)          player.critChance        -= item.critAdd;
      if (item.shieldAdd)      { player.maxShield -= item.shieldAdd; player.shield = Math.min(player.shield, player.maxShield); }
      if (item.shieldRegenAdd)   player.shieldRegen        -= item.shieldRegenAdd;
      if (item.xpMultMult)       player.xpMult            /= item.xpMultMult;
      if (item.damageMult)       player.damage            /= item.damageMult;
      if (item.attackSpeedAdd)   player.attackSpeedMult   -= item.attackSpeedAdd;
      if (item.bulletDmgAdd)     player.bulletDamageMult  -= item.bulletDmgAdd;
      if (item.laserDmgAdd)      player.laserDamageMult   -= item.laserDmgAdd;
      if (item.electricDmgAdd)   player.electricDamageMult -= item.electricDmgAdd;
      if (item.attackRangeAdd)   player.attackRangeMult   -= item.attackRangeAdd;
      if (item.explodeRadiusAdd) player.explodeRadiusMult -= item.explodeRadiusAdd;
      if (item.resourceFindAdd)  player.resourceFind      -= item.resourceFindAdd;
      if (item.rarityFindAdd)    player.rarityFind        -= item.rarityFindAdd;
      if (item.wFireMult) { const f = item.wFireMult; for (const w of weapons) w.fireInterval = Math.min(2.0, w.fireInterval / f); }
      if (item.wMultiAdd) { const m = item.wMultiAdd; for (const w of weapons) w.multiShot    = Math.max(0,   w.multiShot - m); }
    }
    function rollItemDrop(): Item {
      const bias = Math.min(0.5, player.rarityFind * 0.15);
      const r = Math.random() - bias;
      let rarity: ItemRarity;
      if      (stage <= 3) rarity = r < 0.70 ? 'common' : r < 0.92 ? 'rare' : 'epic';
      else if (stage <= 6) rarity = r < 0.30 ? 'common' : r < 0.72 ? 'rare' : r < 0.94 ? 'epic' : 'legendary';
      else if (stage <= 9) rarity = r < 0.15 ? 'common' : r < 0.55 ? 'rare' : r < 0.85 ? 'epic' : 'legendary';
      else                 rarity = r < 0.35 ? 'rare'   : r < 0.70 ? 'epic' : 'legendary';
      const pool = ITEM_POOL.filter(i => i.rarity === rarity);
      return pool[Math.floor(Math.random() * pool.length)];
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
            applyUpgrade(upgradeChoices[i].upgrade.id, upgradeChoices[i].rarity);
            gameState = 'playing';
            canvas.style.cursor = 'none';
          }
        }
      } else if (gameState === 'between_stage') {
        const panelW = Math.min(400, canvas.width * 0.7), panelX = (canvas.width - Math.min(400, canvas.width * 0.7)) / 2;
        const panelH = 115, panelY = 56, btnW = 100, btnH = 22;
        const eqBtnX = panelX + 20, eqBtnY = panelY + panelH - 30;
        const skBtnX = panelX + panelW - 120;
        const cardAreaY = pendingItem ? 185 : 72;
        const upgradeCardY = cardAreaY + 46;
        if (!itemDecided && pendingItem) {
          if (mx >= eqBtnX && mx <= eqBtnX+btnW && my >= eqBtnY && my <= eqBtnY+btnH)
            { equipItem(pendingItem); itemDecided = true; }
          else if (mx >= skBtnX && mx <= skBtnX+btnW && my >= eqBtnY && my <= eqBtnY+btnH)
            { itemDecided = true; }
        }
        if (itemDecided || !pendingItem) {
          for (let i = 0; i < upgradeChoices.length; i++) {
            const cx = wCardX(i);
            if (mx >= cx && mx <= cx+CW && my >= upgradeCardY && my <= upgradeCardY+CH) {
              applyUpgrade(upgradeChoices[i].upgrade.id, upgradeChoices[i].rarity);
              startNextStage();
            }
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
        case 'pistol':   return 1.0;
        case 'shotgun':  return 0.6;
        case 'laser':    return 0.35;
        case 'rocket':   return 1.5;
        case 'railgun':  return 4.0;
        case 'electric': return 0.7;
        default:         return 1.0;
      }
    }
    function effectiveDmg(t: WeaponType): number {
      const base = bulletDmg(t);
      if (t === 'laser')    return base * player.laserDamageMult;
      if (t === 'electric') return base * player.electricDamageMult;
      return base * player.bulletDamageMult;
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
      hpRegenDelayTimer = player.regenDelay;
      invTimer    = 0.5;
      damageFlash = 1;
      if (player.hp <= 0) { gameState = 'game_over'; canvas.style.cursor = 'default'; }
    }

    function levelUp() {
      level++;
      xpToNext       = 12 + level * 10;
      gameState      = 'upgrading';
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
      pendingItem = null; itemDecided = false;
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
      player.lifesteal = 0; player.regenDelay = 3.0;
      player.attackSpeedMult = 1.0;
      player.bulletDamageMult = 1.0; player.laserDamageMult = 1.0; player.electricDamageMult = 1.0;
      player.attackRangeMult = 1.0; player.explodeRadiusMult = 1.0;
      player.resourceFind = 1.0; player.rarityFind = 0.0;
      weapons = [makePistol()];
      vampireHeal = 0; hpRegenDelayTimer = 0;
      cumWFireMult = 1.0; cumWMultiAdd = 0; cumWExplodeAdd = 0;
      cumWPierceAdd = 0; cumWBounceAdd = 0; cumWHomingAdd = 0; cumWSizeMult = 1.0;
      upgradeTaken.clear();
      xp = 0; level = 0; xpToNext = 12;
      blobs = []; boss = null; bullets = []; enemyBullets = []; xpOrbs = []; explosions = []; floaters = []; railgunFlashes = [];
      killCount = 0; spawnTimer = 0; bossFireTimer = 0; gameTime = 0; invTimer = 0; damageFlash = 0; shieldRegenDelay = 0;
      stageIntroTimer = 0; bossOrbitAngle = 0; bossChargeVel = null; bossChargeTimer = 3;
      bossTeleportTimer = 4; bossSummonTimer = 6; berserkTimer = 0; berserkActive = false;
      equipped.hull = null; equipped.drive = null; equipped.core = null;
      pendingItem = null; itemDecided = false;
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

      if (b.weaponType === 'electric') {
        const s = b.bulletSize;
        ctx.shadowColor = '#00ffee'; ctx.shadowBlur = 18; ctx.fillStyle = '#44eeff';
        ctx.beginPath(); ctx.arc(0, 0, 5 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#aaffff'; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(-1, -1, 2 * s, 0, Math.PI * 2); ctx.fill();
      } else if (b.weaponType === 'laser') {
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
      const dur = f.maxAge ?? 0.3;
      const t   = Math.min(f.age / dur, 1);
      const col = f.color ?? '#ffffff';
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.shadowColor = col; ctx.shadowBlur = 20;
      ctx.strokeStyle = col;
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

    const WEAPON_LABELS: Record<WeaponType, string> = { pistol: 'PSTL', shotgun: 'SHOT', laser: 'LASR', rocket: 'RKET', railgun: 'RAIL', electric: 'ELEC' };
    const WEAPON_COLORS: Record<WeaponType, string> = { pistol: '#334455', shotgun: '#553322', laser: '#224455', rocket: '#553311', railgun: '#334433', electric: '#115544' };

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

      // equipment strip — 3 slots, bottom right
      const slotKeys: ItemSlot[] = ['hull', 'drive', 'core'];
      const sw = 72, sh = 30, sg = 5;
      const stripW = slotKeys.length * (sw+sg) - sg;
      const stripX = W - stripW - 12, stripY = H - sh - 12;
      ctx.font = '7px "Courier New",monospace'; ctx.textAlign = 'center';
      for (let i = 0; i < slotKeys.length; i++) {
        const s = slotKeys[i], sx = stripX + i*(sw+sg);
        const eq = equipped[s];
        const rc = eq ? (eq.rarity === 'legendary' ? '#ffaa00' : eq.rarity === 'epic' ? '#ff88ff' : eq.rarity === 'rare' ? '#4488ff' : '#88cc88') : '#1a2030';
        ctx.fillStyle = eq ? (eq.rarity === 'legendary' ? '#120800' : eq.rarity === 'epic' ? '#160022' : eq.rarity === 'rare' ? '#001022' : '#001810') : '#080c12';
        ctx.fillRect(sx, stripY, sw, sh);
        ctx.strokeStyle = rc; ctx.lineWidth = 1; ctx.strokeRect(sx, stripY, sw, sh);
        ctx.fillStyle = '#334455'; ctx.font = '7px "Courier New",monospace';
        ctx.fillText(s.toUpperCase(), sx+sw/2, stripY+10);
        ctx.fillStyle = eq ? rc : '#334455'; ctx.font = 'bold 7px "Courier New",monospace';
        ctx.fillText(eq ? eq.name.substring(0, 11) : '—', sx+sw/2, stripY+22);
        ctx.font = '7px "Courier New",monospace';
      }
      ctx.textAlign = 'left';
    }

    function drawCard(cx: number, cy: number, cw: number, ch: number, up: Upgrade, accent: string, rarity?: UpgradeRarity) {
      const RARITY_COLORS: Record<UpgradeRarity, string> = { normal: '#334455', rare: '#1155bb', epic: '#882299', legendary: '#cc8800' };
      const borderColor = rarity ? RARITY_COLORS[rarity] : accent;
      ctx.fillStyle = '#060f1a'; ctx.strokeStyle = borderColor;
      ctx.shadowColor = borderColor; ctx.shadowBlur = 10; ctx.lineWidth = 2;
      ctx.fillRect(cx, cy, cw, ch); ctx.strokeRect(cx, cy, cw, ch);
      ctx.shadowBlur = 0;
      // rarity label top-right
      if (rarity) {
        const RARITY_LABELS: Record<UpgradeRarity, string> = { normal: 'NORMAL', rare: 'RARE', epic: 'EPIC', legendary: 'LEGEND' };
        ctx.fillStyle = RARITY_COLORS[rarity]; ctx.font = 'bold 8px "Courier New",monospace';
        ctx.textAlign = 'right'; ctx.fillText(RARITY_LABELS[rarity], cx + cw - 6, cy + 12);
        ctx.textAlign = 'center';
      }
      ctx.fillStyle = accent; ctx.font = `bold 12px "Courier New",monospace`;
      ctx.textAlign = 'center'; ctx.fillText(up.name, cx+cw/2, cy+32);
      ctx.strokeStyle = '#002233'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx+12,cy+44); ctx.lineTo(cx+cw-12,cy+44); ctx.stroke();
      const v = rarity ? up.variants?.[rarity] : null;
      const desc = v?.desc ?? up.desc ?? '';
      ctx.fillStyle = '#7799bb'; ctx.font = '10px "Courier New",monospace';
      const words = desc.split('·');
      if (words.length > 1) {
        ctx.fillText(words[0].trim(), cx+cw/2, cy+60);
        ctx.fillText(words[1].trim(), cx+cw/2, cy+73);
      } else {
        ctx.fillText(desc, cx+cw/2, cy+64);
      }
      if (v?.penaltyDesc) {
        ctx.fillStyle = '#ff4444'; ctx.font = '9px "Courier New",monospace';
        ctx.fillText(v.penaltyDesc, cx+cw/2, cy+88);
      }
      ctx.fillStyle = '#223344'; ctx.font = '9px "Courier New",monospace';
      ctx.fillText('[ CLICK ]', cx+cw/2, cy+ch-10);
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
      for (let i = 0; i < upgradeChoices.length; i++) {
        const { upgrade, rarity } = upgradeChoices[i];
        drawCard(wCardX(i), cy, CW, CH, upgrade, accent(upgrade.category), rarity);
      }
      ctx.textAlign = 'left';
    }

    function drawBetweenStage() {
      const W = canvas.width, H = canvas.height;
      const nextCfg = STAGE_CONFIGS[Math.min(stage, STAGE_CONFIGS.length-1)];
      ctx.fillStyle = 'rgba(0,0,8,0.88)'; ctx.fillRect(0,0,W,H);
      ctx.textAlign = 'center';

      // title
      ctx.fillStyle = '#ffff00'; ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 18;
      ctx.font = `bold ${Math.min(28, W*0.048)}px "Courier New",monospace`;
      ctx.fillText(`★  STAGE ${stage} COMPLETE  ★`, W/2, 42);
      ctx.shadowBlur = 0;

      // item drop panel
      const panelW = Math.min(400, W * 0.7), panelX = (W - Math.min(400, W * 0.7)) / 2;
      const panelH = 115, panelY = 56;
      if (pendingItem) {
        const rc = pendingItem.rarity === 'legendary' ? '#ffaa00' : pendingItem.rarity === 'epic' ? '#ff88ff' : pendingItem.rarity === 'rare' ? '#4488ff' : '#88cc88';
        ctx.fillStyle = '#040812'; ctx.strokeStyle = rc;
        ctx.shadowColor = rc; ctx.shadowBlur = 10; ctx.lineWidth = 2;
        ctx.fillRect(panelX, panelY, panelW, panelH); ctx.strokeRect(panelX, panelY, panelW, panelH);
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left'; ctx.fillStyle = rc; ctx.font = 'bold 9px "Courier New",monospace';
        ctx.fillText(`${pendingItem.rarity.toUpperCase()} · ${pendingItem.slot.toUpperCase()}`, panelX+10, panelY+14);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff'; ctx.font = `bold 15px "Courier New",monospace`;
        ctx.fillText(pendingItem.name, W/2, panelY+33);
        ctx.fillStyle = '#8899aa'; ctx.font = '10px "Courier New",monospace';
        ctx.fillText(pendingItem.desc, W/2, panelY+50);
        const cur = equipped[pendingItem.slot];
        if (cur) {
          ctx.fillStyle = '#664422'; ctx.font = '9px "Courier New",monospace';
          ctx.fillText(`Replaces: ${cur.name}`, W/2, panelY+65);
        }
        if (!itemDecided) {
          const eqBtnX = panelX+20, eqBtnY = panelY+panelH-30, btnW = 100, btnH = 22;
          ctx.fillStyle = '#003322'; ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 1;
          ctx.fillRect(eqBtnX, eqBtnY, btnW, btnH); ctx.strokeRect(eqBtnX, eqBtnY, btnW, btnH);
          ctx.fillStyle = '#00ff88'; ctx.font = 'bold 10px "Courier New",monospace';
          ctx.fillText('[ EQUIP ]', eqBtnX+btnW/2, eqBtnY+15);
          const skBtnX = panelX+panelW-120, skBtnY = eqBtnY;
          ctx.fillStyle = '#111122'; ctx.strokeStyle = '#334455'; ctx.lineWidth = 1;
          ctx.fillRect(skBtnX, skBtnY, btnW, btnH); ctx.strokeRect(skBtnX, skBtnY, btnW, btnH);
          ctx.fillStyle = '#556677'; ctx.font = 'bold 10px "Courier New",monospace';
          ctx.fillText('[ SKIP ]', skBtnX+btnW/2, skBtnY+15);
        } else {
          ctx.fillStyle = '#445566'; ctx.font = '10px "Courier New",monospace';
          ctx.fillText(equipped[pendingItem.slot] === pendingItem ? '✓ EQUIPPED' : '— SKIPPED —', W/2, panelY+panelH-10);
        }
      }

      const cardAreaY = pendingItem ? 185 : 72;

      // next stage info
      ctx.fillStyle = '#00ffcc'; ctx.shadowColor = '#00ffcc'; ctx.shadowBlur = 6;
      ctx.font = `bold 14px "Courier New",monospace`;
      ctx.fillText(`ENTERING: ${nextCfg.name}`, W/2, cardAreaY);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#556677'; ctx.font = '10px "Courier New",monospace';
      ctx.fillText(nextCfg.tagline, W/2, cardAreaY+16);
      ctx.fillStyle = '#334455'; ctx.font = '9px "Courier New",monospace';
      ctx.fillText(`${nextCfg.enemyType.toUpperCase()} · ${nextCfg.bossPattern.toUpperCase()} boss · ${nextCfg.modifier.replace(/_/g,' ').toUpperCase()}`, W/2, cardAreaY+28);

      const upgradeCardY = cardAreaY + 46;
      const ready = itemDecided || !pendingItem;
      ctx.fillStyle = ready ? '#aabbcc' : '#445566'; ctx.font = '11px "Courier New",monospace';
      ctx.fillText(ready ? 'Choose a permanent upgrade:' : 'Resolve the item drop first ↑', W/2, upgradeCardY-8);

      ctx.globalAlpha = ready ? 1 : 0.3;
      const accent = (cat: string) => cat === 'weapon' ? '#004488' : cat === 'stat' ? '#225500' : '#442200';
      for (let i = 0; i < upgradeChoices.length; i++) {
        const { upgrade, rarity } = upgradeChoices[i];
        drawCard(wCardX(i), upgradeCardY, CW, CH, upgrade, accent(upgrade.category), rarity);
      }
      ctx.globalAlpha = 1;

      // equipment readout
      const readoutY = upgradeCardY + CH + 14;
      const slotKeys: ItemSlot[] = ['hull', 'drive', 'core'];
      const sw2 = 108, sh2 = 36, sg2 = 12;
      const totalW2 = slotKeys.length * (sw2+sg2) - sg2;
      const readX = (W - totalW2) / 2;
      ctx.font = '9px "Courier New",monospace';
      for (let i = 0; i < slotKeys.length; i++) {
        const s = slotKeys[i], sx = readX + i*(sw2+sg2);
        const eq = equipped[s];
        const rc = eq ? (eq.rarity === 'legendary' ? '#ffaa00' : eq.rarity === 'epic' ? '#ff88ff' : eq.rarity === 'rare' ? '#4488ff' : '#88cc88') : '#223344';
        ctx.fillStyle = '#040810'; ctx.strokeStyle = rc; ctx.lineWidth = 1;
        ctx.fillRect(sx, readoutY, sw2, sh2); ctx.strokeRect(sx, readoutY, sw2, sh2);
        ctx.fillStyle = '#334455'; ctx.textAlign = 'center';
        ctx.fillText(s.toUpperCase(), sx+sw2/2, readoutY+12);
        ctx.fillStyle = eq ? rc : '#334455'; ctx.font = 'bold 9px "Courier New",monospace';
        ctx.fillText(eq ? eq.name : '—', sx+sw2/2, readoutY+26);
        ctx.font = '9px "Courier New",monospace';
      }
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

        // auto fire — each weapon on its own timer (attackSpeedMult applied at fire time)
        if (blobs.length || boss) {
          for (const w of weapons) {
            w.fireTimer += dt;
            if (w.fireTimer >= w.fireInterval / player.attackSpeedMult) { w.fireTimer = 0; fireBulletForWeapon(w); }
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
            const baseDmg = effectiveDmg(b.weaponType) * player.damage * (crit ? player.critMult : 1.0);
            blob.hp -= baseDmg;
            if (player.lifesteal > 0) player.hp = Math.min(player.maxHp, player.hp + baseDmg * player.lifesteal);
            addFloater(
              { x: blob.pos.x + (Math.random()-0.5)*8, y: blob.pos.y - blob.radius },
              crit ? 'CRIT!' : Math.ceil(baseDmg).toString(),
              crit ? '#ffff44' : '#aabbcc'
            );
            const killed = blob.hp <= 0;
            if (killed) { deadBlobs.add(blob.id); if (blob.spawnsChildren) splitterSpawns.push({ ...blob.pos }); }
            // chain lightning for electric weapon
            if (b.weaponType === 'electric') {
              const chainTargets = new Set<number>([blob.id]);
              let chainFrom = { ...blob.pos };
              let chainDmg  = baseDmg * 0.6;
              for (let arc = 0; arc < 2; arc++) {
                const CHAIN_R2 = 240 * 240;
                let best: Blob | null = null, bestD2 = CHAIN_R2;
                for (const tb of blobs) {
                  if (deadBlobs.has(tb.id) || chainTargets.has(tb.id)) continue;
                  const dd = d2(chainFrom, tb.pos);
                  if (dd < bestD2) { bestD2 = dd; best = tb; }
                }
                if (!best) break;
                chainTargets.add(best.id);
                best.hp -= chainDmg;
                if (player.lifesteal > 0) player.hp = Math.min(player.maxHp, player.hp + chainDmg * player.lifesteal);
                railgunFlashes.push({ id: uid++, fromX: chainFrom.x, fromY: chainFrom.y, toX: best.pos.x, toY: best.pos.y, age: 0, maxAge: 0.15, color: '#00ffee' });
                if (best.hp <= 0) { deadBlobs.add(best.id); if (best.spawnsChildren) splitterSpawns.push({ ...best.pos }); }
                chainFrom = { ...best.pos };
                chainDmg *= 0.6;
              }
            }
            if (b.explodeR > 0) {
              if (killed) pendingExp.push({ pos: { ...blob.pos }, r: b.explodeR * player.explodeRadiusMult });
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
            const baseDmg = effectiveDmg(b.weaponType) * player.damage * (crit ? player.critMult : 1.0);
            boss.hp -= baseDmg;
            if (player.lifesteal > 0) player.hp = Math.min(player.maxHp, player.hp + baseDmg * player.lifesteal);
            addFloater(
              { x: boss.pos.x + (Math.random()-0.5)*20, y: boss.pos.y - boss.radius },
              crit ? 'CRIT!' : Math.ceil(baseDmg).toString(),
              crit ? '#ffff44' : '#dd88ff'
            );
            // chain lightning from boss to nearby blobs
            if (b.weaponType === 'electric') {
              const chainTargets = new Set<number>();
              let chainFrom = { ...boss.pos };
              let chainDmg  = baseDmg * 0.6;
              for (let arc = 0; arc < 2; arc++) {
                let best: Blob | null = null, bestD2 = 240 * 240;
                for (const tb of blobs) {
                  if (deadBlobs.has(tb.id) || chainTargets.has(tb.id)) continue;
                  const dd = d2(chainFrom, tb.pos);
                  if (dd < bestD2) { bestD2 = dd; best = tb; }
                }
                if (!best) break;
                chainTargets.add(best.id);
                best.hp -= chainDmg;
                if (player.lifesteal > 0) player.hp = Math.min(player.maxHp, player.hp + chainDmg * player.lifesteal);
                railgunFlashes.push({ id: uid++, fromX: chainFrom.x, fromY: chainFrom.y, toX: best.pos.x, toY: best.pos.y, age: 0, maxAge: 0.15, color: '#00ffee' });
                if (best.hp <= 0) { deadBlobs.add(best.id); if (best.spawnsChildren) splitterSpawns.push({ ...best.pos }); }
                chainFrom = { ...best.pos };
                chainDmg *= 0.6;
              }
            }
            if (b.explodeR > 0) {
              explosions.push({ id: uid++, pos: { ...boss.pos }, age: 0, maxR: b.explodeR * player.explodeRadiusMult });
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
                pendingItem = rollItemDrop(); itemDecided = false;
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
              explosions.push({ id: uid++, pos: { ...blob.pos }, age: 0, maxR: 55 * player.explodeRadiusMult });
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
          (b.maxRange <= 0 || b.distTraveled < b.maxRange * player.attackRangeMult)
        );

        // explosions age
        explosions = explosions.filter(e => e.age < 0.45);
        for (const e of explosions) e.age += dt;

        // railgun flash age
        for (const f of railgunFlashes) f.age += dt;
        railgunFlashes = railgunFlashes.filter(f => f.age < (f.maxAge ?? 0.3));

        // XP orb pull & collect
        const PULL = player.xpRange;
        const got: number[] = [];
        for (const o of xpOrbs) {
          const dx = ship.x-o.pos.x, dy = ship.y-o.pos.y;
          const dist = Math.sqrt(dx*dx+dy*dy) || 1;
          if (dist < PULL) { const s = 160+(PULL-dist)*2.5; o.pos.x += (dx/dist)*s*dt; o.pos.y += (dy/dist)*s*dt; }
          if (dist < 14) got.push(o.id);
        }
        if (got.length) { xpOrbs = xpOrbs.filter(o => !got.includes(o.id)); const dm = stageConfig().modifier === 'xp_drought' ? 0.5 : 1; addXp(got.length * player.xpMult * dm * player.resourceFind); }

        // HP & shield regen
        hpRegenDelayTimer = Math.max(0, hpRegenDelayTimer - dt);
        if (player.regen > 0 && hpRegenDelayTimer <= 0) player.hp = Math.min(player.maxHp, player.hp + player.regen*dt);
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
