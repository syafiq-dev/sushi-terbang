# Sushi Terbang

Remake of the 2018-ish Construct 2 game in Phaser 3 + TypeScript + Vite. Same art, sounds and rules.

Tap (or press Space) to turn the sushi left/right. It speeds up until you tap again and wraps around the screen edges. Dodge the falling bars.

## Run it

    npm install
    npm run dev      # local dev server with hot reload
    npm test         # game-rule tests
    npm run build    # production build into dist/

## Deploy (Netlify, free)

Push this folder to GitHub, then on Netlify: Add new site → Import from Git → pick the repo.
netlify.toml already sets the build command and output folder.

## Where things are

- src/logic.ts — the game rules (speeds, wrap-around, high score); tweak numbers here
- src/main.ts  — scenes: Boot (loading), Start (title), Game
- public/assets — sprites and sounds from the original

High score is saved in the browser (localStorage key "hiscore").
