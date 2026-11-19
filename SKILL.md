---
name: codex-image
description: Generate new PNG assets from text using the local Codex CLI and its ChatGPT sign-in. Use when the user asks for a generated raster image or a cutout with a transparent background.
---

# Generate a PNG with Codex

Run the bundled script from the project working directory so relative output
paths resolve there. Replace `<skill-dir>` with the directory containing
this `SKILL.md`.

```sh
node "<skill-dir>/bin/codex-image.mjs" -o "assets/hero.png" "Studio photo of a sea-green glass cube on warm ivory"
```

Use the user's requested destination when available. The script creates parent
directories, preserves existing files, and prints the absolute path of the PNG
on success. Use that path to present or incorporate the asset.

For a cutout, request an actual transparent background in the prompt. Codex
chooses quality and pixel dimensions automatically.

The script needs Node.js 22 or later, `codex` on PATH, and an existing ChatGPT
sign-in. If sign-in is required, have the user run `codex login` and choose
ChatGPT. The installed skill bundles the script and requires no npm dependencies.
