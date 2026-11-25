# CAGED Flow

A guitar trainer for memorising the CAGED shapes and the notes on the fretboard, then improvising with them over backing tracks in any key.
It is a single installable web app (PWA). Host it once and it runs in any browser, installs to the home screen on phones,
installs as a desktop app on PC and Mac, and works offline.

## What's inside

| Area | What it does |
|---|---|
| **Daily Workout** (~12 min) | Six steps that rotate through all 12 keys on the circle of 4ths. It introduces the shapes in order, then keeps drilling your weakest one, and finishes with a 4-minute jam. |
| **Name the Note** | A dot lights up and you name it. Adaptive: slow or wrong positions come up more often. Keys A–G (Shift = ♯) work on desktop. |
| **Find the Note** | Find a note on one string, or every instance on the neck. You can answer **by playing your real guitar** (microphone pitch detection). |
| **Shape Sprint** | "B♭ major, G shape. Go!" Tap a root inside that shape. Trains instant shape location in any key. |
| **Build the Shape** | Draw a whole pattern (pentatonic, blues, major/minor scale, arpeggios) from memory and get it marked, or **play it up and down on your guitar** while the app listens. |
| **Interval Spotter** | Name the interval (3, ♭7…) of a flashing note inside a shape, so you can aim for chord tones on purpose. |
| **Name That Shape** | Identify a pattern's CAGED shape and its key. |
| **Jam** | Synthesized drums, bass and keys for 12 progressions (blues, pop, rock, Mixolydian, ii–V–I, minor, Dorian…) in any key and tempo. The neck shows your position, lights up the **current chord's tones**, previews the **next chord's tones** one beat early, can **auto-shift you through the shapes**, or can **follow each chord's own CAGED shape**. Optional improv challenges every 4 bars. |
| **Explore** | Any key × any scale × any shape (or all five), labelled with intervals or note names, plus how each shape maps between major and minor. |
| **Progress** | A fretboard heat-map of your note knowledge, a shape mastery table, interval accuracy, weakest spots and streaks. |
| **Guide** | A short, visual explanation of CAGED and how to turn it into solos. |

Progress is saved on the device (localStorage). Use Settings → Export/Import to move it between devices.
There's also a left-handed mode, a vertical fretboard on phones held upright, and a built-in tuner.

## Run it locally

```bash
npm start          # or: node tools/serve.mjs 8080
```
Then open http://localhost:8080. No dependencies and no build step.
(Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`.)

## Put it online (free)

### GitHub Pages (set up in this repo)

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The workflow
syntax-checks the JavaScript, copies the app files into `_site/`, stamps the service-worker cache version
with the commit hash, and publishes the result to `https://<user>.github.io/<repo>/`.

One-time setup: in the GitHub repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
You can also re-run a deploy by hand from the **Actions** tab ("Run workflow").

### Other hosts

It's a static folder, so any of these works too:

- **Netlify Drop:** drag the `caged-flow` folder onto https://app.netlify.com/drop.
- **Cloudflare Pages / Vercel:** "static site", no build command, output directory = root.

HTTPS (which all of these provide) is required for installing the app and for the microphone.

## Installing as an app

- **Android / Chrome:** menu → *Install app* (or *Add to Home screen*).
- **iPhone / iPad:** Safari → Share → *Add to Home Screen*.
- **Windows / Mac:** Chrome or Edge → install icon in the address bar.

Want real store listings? Wrap the hosted URL with [PWABuilder](https://www.pwabuilder.com/) (Microsoft Store, Google Play, iOS),
or with Capacitor (mobile) or Tauri (desktop). No code changes are needed.

## Updating

Deploys through the GitHub Action stamp `VERSION` in `sw.js` automatically, so installed copies pick up each new version.
If you host it somewhere else, bump `VERSION` by hand after changing files.
Run `npm run icons` to regenerate the PNG icons.

## Project layout

```
index.html, css/styles.css, manifest.webmanifest, sw.js
.github/workflows/deploy.yml   GitHub Pages deployment
tools/           local dev server + icon generator (not deployed)
js/theory.js     notes, scales, CAGED shape geometry (per-string fret windows)
js/fretboard.js  SVG fretboard (horizontal / vertical, left-handed)
js/drills.js     all drills + session runner
js/jam.js        backing-track view
js/audio.js      Web Audio: plucked-string synth, drums/bass/keys, scheduler
js/pitch.js      microphone pitch detection (YIN)
js/stats.js      progress storage + adaptive weighting
js/app.js        routing, Explore, Train/Workout, Progress, Guide, Settings
```
