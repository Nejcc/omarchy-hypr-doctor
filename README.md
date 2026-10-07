# Hypr Doctor

Shows Hyprland config errors in the [Omarchy](https://omarchy.org) bar, so a
typo doesn't quietly break your keybinds.

## The problem

One bad line in `~/.config/hypr/*.lua` and Hyprland drops whatever came after
it: a binding stops working, a window rule is gone. The error banner is easy to
miss or dismiss, and then you're left guessing which file and which line.

## What it does

- A warning icon with the error count in the bar. With a clean config the
  widget takes no space at all.
- Click it for the list: file, line and Hyprland's message for each error, and
  a button that opens the file at that line in your editor.
- A toast after a reload that leaves errors behind. Clicking the toast opens
  the first error.

Keys in the panel: `Up`/`Down` (or `j`/`k`) to move, `Enter` to open, `Esc` to
close.

## Install

```sh
omarchy plugin add https://github.com/Nejcc/omarchy-hypr-doctor.git
```

Then add **Hypr Doctor** to the bar (it goes on the right by default).

IPC: `omarchy-shell nejcc.hypr-doctor refresh|open|close|toggle`.

## Runtime deps

Nothing new: `hyprctl`, `omarchy-notification-send` and
`omarchy-launch-editor`, which Omarchy already ships. Without
`omarchy-launch-editor` the file opens with `xdg-open`.

## How it works

- Runs `hyprctl -j configerrors` once at startup and again on every
  `configreloaded` event from Hyprland's event socket. No polling.
- `Logic.js` turns the output into file, line and message. It knows the Lua
  config shapes (`/path/file.lua:12: message`, `require("mod"): …`, tracebacks)
  and the older `Config error in file … at line …` from hyprland.conf.
- `bin/hypr-doctor-open` opens the file in the editor from Omarchy's defaults
  (the same one `omarchy-launch-editor` picks), with that editor's line syntax:
  `+12 file` for nvim/vim/nano/emacs, `file:12` for helix/micro/zed,
  `--goto file:12` for VS Code. Other editors get the file without a line.

## Limits

- Lua shortens very long paths to `...tail/of/path.lua`. Those errors still
  show, but without the open button.
- Errors Hyprland reports without a location (a timeout, `?:?`) have no file to
  open.
- Read-only: it never touches your config.

## Tests

```sh
node --test tests/*.test.mjs
```

## License

MIT
