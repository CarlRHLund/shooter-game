# Retro Shooter — Project Progress

## What This Is

A retro 2D top-down canvas shooter built entirely in Next.js (TypeScript). All game logic lives in a single file: `app/game.tsx`. The game runs in the browser on a `<canvas>` element with no external game libraries.

- **GitHub:** https://github.com/CarlRHLund/shooter-game (branch: `master`)
- **Local path:** `c:\Users\carlrh\claude\shooter-game-test`

---

## What Has Been Built

### Core Game Loop
- 10 stages with progressive difficulty scaling
- Enemies chase the player ship; player auto-fires toward nearest target
- Kill a set number of enemies → boss spawns → defeat boss → advance stage
- Stage completion: choose a boss item drop + a permanent upgrade, then continue

### Difficulty Modes
| Mode | Name | Flavour |
|---|---|---|
| Easy | CADET | Enemies weaker, slower spawns |
| Normal | PILOT | Intended experience |
| Hard | COMMANDER | Harder enemies, faster spawns |
| Nightmare | ADMIRAL | Maximum chaos |

### Weapons (6 types)
| Weapon | Behaviour |
|---|---|
| Pistol | Fast, single shot — starting weapon |
| Shotgun | 5-pellet spread, short range |
| Laser | Rapid-fire, infinite pierce |
| Rocket | Slow, AOE explosion, homing |
| Railgun | Instant line, pierces everything, flash visual |
| **Electric** *(new)* | Homing orb, **chains to 2 nearby enemies** at 60% then 36% damage with cyan arc flash |

### Enemy Types
- **Standard** — default behaviour
- **Swarm** — small, fast, weak
- **Tank** — large, slow, high HP
- **Ghost** — 40% dodge chance
- **Splitter** — spawns 2 mini-blobs on death

### Boss Patterns
Chase · Orbit · Charge · Summon (spawns adds) · Teleport

### Stage Modifiers
Dense spawn · XP drought · Fog · Explosive death · Regen enemies · Berserk (speed burst cycles)

---

## Player Stats (19 total)

| Stat | Base | Notes |
|---|---|---|
| HP / Max HP | 100 | |
| HP Regen | 0/s | Delayed by `regenDelay` after taking damage |
| Regen Delay | 3.0s | Time after damage before regen ticks |
| Lifesteal | 0% | Fraction of damage dealt returned as HP |
| Armor | 0% | Flat damage reduction |
| Dodge | 0% | Chance to evade all hits |
| Speed | 0.14 | Ship tracking speed |
| Crit Chance | 0% | Crit multiplier is fixed ×2.0 |
| Shield / Shield Regen | 0 | Absorbs damage before HP; regens after 3s |
| XP Range | 160px | Orb magnet radius |
| XP Mult | ×1.0 | Multiplier on XP gained |
| Attack Speed Mult | ×1.0 | Applied at fire-check time, all weapons |
| Bullet Damage Mult | ×1.0 | Pistol / Shotgun / Rocket / Railgun |
| Laser Damage Mult | ×1.0 | Laser only |
| Electric Damage Mult | ×1.0 | Electric only |
| Attack Range Mult | ×1.0 | Extends bullet travel before despawn |
| Explode Radius Mult | ×1.0 | Scales all explosion radii |
| Resource Find | ×1.0 | Multiplies XP value of orbs |
| Rarity Find | 0.0 | Biases upgrade and item rarity rolls upward |

---

## Upgrade System (Level-Up Cards)

33 entries in `UPGRADE_POOL`, each with **4 rarity variants**: normal / rare / epic / legendary.

Higher rarities give larger bonuses but epic and legendary cards can carry **penalties** shown in red (e.g. armor reduction, max HP loss, range penalty).

**Rarity roll odds** (modified by `rarityFind`):
- Normal: ~58% · Rare: ~25% · Epic: ~14% · Legendary: ~3%

### Upgrade Categories
| Category | Examples |
|---|---|
| Weapon mods | Rapid Fire, Multi Shot, Explosive, Piercing, Bouncing, Storm, Homing, Bullet Size |
| Weapon archetypes | Add Shotgun / Laser / Rocket / Railgun / **Tesla (Electric)** |
| Stat | Max Health, HP Regen, Speed, Armor, Dodge, Crit, Vampiric, Quick Recovery, Kinetic Amp, Laser Focus, Surge Coil, Assault Mode, Long Range, Blast Wave |
| Passive | Shield Cell, XP Magnet, Double XP, Vampire, Scavenger, Fortune |

---

## Item System (Boss Drops)

24 items across 3 equipment slots (hull / drive / core), 8 per slot.

**Rarity tiers:** Common · Rare · Epic · **Legendary** *(new)*

| Slot | Legendary Item | Effect |
|---|---|---|
| Hull | Titan Hull | +80 HP · regen 6/s · -25% dmg · +12% dodge · regen delay -2s |
| Drive | Apex Drive | +25% dodge · +30% speed · XP ×2 · +50% resource find |
| Core | Singularity | Dmg ×2.0 · +25% atk speed · +20% crit |

Item rarity weighted by stage and `rarityFind`. Legendary items start appearing from stage 4.

### Sound Engine

10 procedural sounds via Web Audio API — no audio files, all synthesized in `game.tsx`.

| Sound | Trigger |
|---|---|
| Pistol / Shotgun / Laser / Rocket / Railgun / Electric | Each weapon fires |
| Enemy death | Any blob killed (once per frame batch) |
| Explosion | Rocket AOE, explosive-death modifier, rocket hitting boss |
| Boss death | Boss HP reaches 0 |
| Level up | XP threshold crossed — rising C4→E4→G4 arpeggio |
| Stage complete | Boss defeated, stage advances — C4→E4→G4→C5 fanfare |
| Shield hit | Damage fully absorbed by shield |
| Player hit | HP reduced |

AudioContext initialized on difficulty-card click (satisfies browser autoplay policy).

---

## Current State

- **TypeScript:** Compiles clean (`tsc --noEmit` exit 0)
- **Git:** All changes committed and pushed — commit `c981981`
- **Tested:** No runtime errors confirmed via TypeScript; gameplay balance untested in browser

---

## Known Gaps / Next Steps

### Immediate
- [ ] **Browser test** — play through at least one full run to verify all new stats, rarity cards, chain lightning, item drops, and sounds work correctly in-game
- [ ] **Balance pass** — legendary card bonuses and penalties may need tuning after play-testing
- [ ] **HUD for new stats** — `attackSpeedMult`, `resourceFind`, etc. are not yet shown in the HUD; add compact stat row

### Features to Consider
- [x] **Sound effects** — weapon fire, explosions, level-up, boss death *(done — commit c981981)*
- [ ] **Kill streak / combo counter** — visual feedback for rapid kills
- [ ] **More boss patterns** — spiral shot, wall of bullets, split-phase
- [ ] **New enemy type** — e.g. Bomber (explodes on death), Sniper (fires from range)
- [ ] **Stage 11+ endless mode** — survive as long as possible after clearing stage 10
- [ ] **Persistent high score** — localStorage leaderboard (stage reached, level, difficulty)
- [ ] **Mobile polish** — virtual joystick or tap-to-move for touch screens
- [ ] **Visual FX** — screen shake on boss hit, particle trails for electric arcs
- [ ] **Stat screen at game over** — show damage dealt, kills, upgrades taken
