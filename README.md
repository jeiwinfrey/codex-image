# codex-image

Generate a PNG from a text prompt and optional reference images using the ChatGPT
account already signed into your local Codex CLI. Run it from a terminal, a
script, or a Codex agent with shell access.

## Install the Codex skill

Run this from the project where you want to generate images.

```sh
npx skills add jeiwinfrey/codex-image --skill codex-image -a codex
```

Then ask Codex to use `$codex-image` to generate an asset. The skill includes
the CLI. Add `-g` to the install command if you want the skill across projects.
The [skills installer](https://github.com/vercel-labs/skills#install-a-skill)
requires Node.js 22.20 or later.

## Install the standalone CLI

```sh
npm install -g git+https://github.com/jeiwinfrey/codex-image.git
```

The standalone CLI needs Node.js 22 or later. You can also run
`node bin/codex-image.mjs` from a checkout.

Both the skill and CLI use the local [Codex CLI](https://learn.chatgpt.com/docs/cli)
on your PATH. Run `codex login status` to check your sign-in. Use `codex login`
and choose ChatGPT if needed. Tested on macOS with Codex CLI 0.160.0.

## Generate an image

```sh
codex-image -o assets/hero.png "Studio photo of a sea-green glass cube on warm ivory"
printf '%s\n' 'Ink illustration of a heron in flight, transparent background' |
  codex-image -o assets/heron.png -
```

The command creates missing output directories, defaults to `image.png`, and
prints the absolute file path to stdout on success. Existing files are preserved.
Errors go to stderr and return a nonzero exit status.

## Use reference images

Pass a local image with `--reference` or `-r` and describe the result you want.
Repeat the flag for up to five files. Codex receives them in the order listed.

```sh
codex-image -r sketch.png -r palette.jpg -o assets/hero.png \
  "Use the first image for the composition and the second for the colors."
```

Request a transparent background in the description for a cutout. Codex
chooses quality and pixel dimensions automatically. Each call uses the signed-in
account's image-generation access and limits.

## How it works

The CLI launches [Codex App Server](https://learn.chatgpt.com/docs/app-server)
over local stdio. It checks the account type through `account/read`, starts an
ephemeral Codex turn, and takes the PNG from the built-in image tool's completion
event. Codex manages sign-in. No API key is required.

MIT licensed. This is an independent local CLI.
