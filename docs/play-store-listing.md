# Google Play store listing copy

Paste-ready text for **Play Console -> Grow -> Store presence -> Main store listing**.

Everything here describes what the game actually does today. Play rejects listings that promise
features the build doesn't have, so if a feature slips, update this file and the listing together.

---

## App name (max 30)

```
Path of Boredom
```

15/30. Already entered.

---

## Short description (max 80)

```
A fast action RPG. Three classes, 30 waves, six areas, then Endless. No ads.
```

76/80.

Alternatives if you'd rather emphasise something else:

```
Pick a class, clear 30 waves across six areas, then survive Endless. No ads.
```
75/80

```
Hack-and-slash action RPG with skill trees, loot, and an endless survival mode.
```
79/80

---

## Full description (max 4000)

```
Six dawns were stolen. One promise remains.

Path of Boredom is a fast, no-nonsense action RPG. Pick a class, fight through a
30-wave campaign across six areas, and then keep going for as long as you can
survive in Endless mode.

CHOOSE YOUR EXILE

- Ember Knight - balanced melee. Reliable damage, broad cleaves, and a nova that
  hits every enemy around you.
- Dawn Ranger - ranged skirmisher. Fast but fragile, with ricochets, piercing
  shots, and volleys that punish anything standing in a line. Keep moving.
- Iron Warden - armored bruiser. High health and innate armor, paid for with
  slower movement and heavier attack timing.

FIGHT THROUGH SIX AREAS

From the Ashen Hollow through the Drowned Wilds, Cinder Citadel, Glass Expanse
and Storm Archive, to the Starless Gate. Thirty waves, escalating threats, and
bosses that do not wait for you to be ready.

BUILD YOUR RUN

- Choose a lasting boon every time you level up - one of three, and it sticks
  for the whole run.
- Spend gold at the forge on weapon damage, armor, cleave power, dodge recovery,
  critical chance and more.
- Unlock class-specific skill trees and pick which skills cast manually and
  which fire automatically.
- Walk over loot to equip it. Better weapons and armor swap in automatically.
- Max out the forge to unlock unlimited stat training.

THREE DIFFICULTIES

Hard, Nightmare and Inferno change enemy health, damage, speed, how many spawn
per wave, and how much your flasks heal. On Inferno, healing restores only 40%
of its normal amount, so mistakes are far harder to recover from.

ENDLESS MODE

Finish the campaign and the Endless Watch opens permanently. Keep your character
and see how far the waves take you.

LEADERBOARDS

Every class keeps its own best kill score for each difficulty and starting mode.
Inspect any record to see the exact build that earned it.

NO ADS, NO IN-APP PURCHASES, NO TRACKING

There are no advertisements in this game, nothing to buy, and no analytics or
tracking SDKs. Signing in with Google is optional and only used to save your
progress and submit scores - you can play the entire game without an account.

Developed by MadBone.
```

Roughly 1,900 characters, within the 4000 limit.

### Claims in this text that must stay true

- **"No ads, no in-app purchases, no tracking"** - matches the privacy policy. If an ad SDK or
  analytics is ever added, both this listing and `docs/privacy-policy.html` must change.
- **"Signing in with Google is optional"** - this is the planned design (sign-in gates saving and
  leaderboards, not play). If sign-in ever becomes mandatory at launch, this line is false and the
  Play "app access" declaration also has to change.
- **"you can play the entire game without an account"** - true today.

---

## Graphics still needed

These cannot be written, they have to be produced. All are **required** before the listing can be
submitted.

| Asset | Spec | Notes |
| --- | --- | --- |
| App icon | PNG/JPEG, 512x512, max 1 MB | `Path of Boredom.Maui/Resources/AppIcon/appicon.svg` is a placeholder diamond; export at 512x512 or design something better |
| Feature graphic | PNG/JPEG, 1024x500, max 15 MB | Shown when the app is featured. Title over a dark background works |
| Phone screenshots | 2-8 images, PNG/JPEG, 16:9 or 9:16, each side 320-3840 px | **See the blocker below** |

For promotion eligibility: at least 4 screenshots, at least 3 in 16:9 or 9:16, at least 1080 px.

### Blocker: screenshots

Screenshots have to show the real game running on a phone. The Android build currently renders but
**cannot be played by touch** - the game only binds keyboard input (WASD/arrows, J, Q, Space, E, P).
Until touch controls exist, any screenshot would show either a menu or a motionless character.

Take screenshots after touch controls land. Good candidates:

1. Mid-combat, several enemies on screen
2. The level-up boon draft (three cards)
3. The forge with gold and ranks visible
4. The skills and loadout panel
5. A boss encounter

The emulator can produce correctly sized screenshots: landscape Pixel at 1920x1080 satisfies both
the 16:9 and the 1080 px requirements.

---

## Other listing fields

- **Video** - optional, leave blank.
- **Tablet / Desktop / Android XR assets** - optional. The app is landscape-only on phone and
  tablet, so tablet screenshots can be added later from the same emulator.
- **Privacy policy URL** - `https://bogdanmadose.github.io/Path-of-Boredom/privacy-policy.html`
- **Delete account URL** - `https://bogdanmadose.github.io/Path-of-Boredom/delete-account.html`
