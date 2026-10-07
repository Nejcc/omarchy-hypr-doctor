// Run with: node --test tests/*.test.mjs
// Logic.js is a QML JavaScript library, so it is loaded into a sandbox with
// its `.pragma library` line stripped. No dependencies.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import vm from "node:vm"

const source = readFileSync(new URL("../Logic.js", import.meta.url), "utf8").replace(/^\.pragma library\s*$/m, "")
const L = vm.createContext({})
vm.runInContext(source, L)
const plain = (v) => JSON.parse(JSON.stringify(v))
const parse = (raw) => plain(L.parseErrors(raw))

// Byte-for-byte what configErrorsRequest in Hyprland 0.56 src/debug/HyprCtl.cpp
// writes for -j: the error string split on "\n", each line as `\n\t"<line>",`,
// trailing comma trimmed, then `\n]\n`.
const hyprctlJson = (errors) => {
  const lines = errors.join("\n").split("\n")
  return "[" + lines.map((l) => "\n\t" + JSON.stringify(l) + ",").join("").replace(/,$/, "") + "\n]\n"
}

const H = "/home/user/.config/hypr"

// One string per Hyprland error, in the shapes src/config/lua emits.
const SAMPLE = [
  // Internal::configError: "<source>:<line>: <message>"
  `${H}/bindings.lua:12: hl.bind: 'key' is required`,
  // A runtime error through the reload pcall's traceback handler.
  `${H}/hyprland.lua:3: attempt to call a nil value (global 'foo')\nstack traceback:\n\t[C]: in function 'foo'\n\t${H}/hyprland.lua:3: in main chunk`,
  // A module with a syntax error, reported by the require wrapper.
  `require("looknfeel"): ${H}/looknfeel.lua:8: unexpected symbol near '='`,
  // The searcher's own message, where the location is on the detail line.
  `require("monitors"): error loading module 'monitors' from file '${H}/monitors.lua':\n\t${H}/monitors.lua:2: '=' expected near 'y'`,
  // Lua shortens long chunk names; there is a line but no file to open.
  `...omarchy/default/hypr/bindings/media.lua:9: hl.bind: expected a string`,
  // Hyprland could not tell where the call came from.
  `?:?: hl.window_rule: 'match' is required`,
  `[Lua] execution timed out in config reload`,
  // hyprlang, for configs still on hyprland.conf.
  `Config error in file ${H}/hyprland.conf at line 42: invalid field foo: missing a value`,
]

test("no errors: hyprctl -j prints [\"\"]", () => {
  assert.equal(hyprctlJson([""]), '[\n\t""\n]\n')
  assert.deepEqual(parse(hyprctlJson([""])), [])
  assert.deepEqual(parse("\n"), [])
  assert.deepEqual(parse(""), [])
  assert.deepEqual(parse("garbage {"), [{ file: "", line: 0, message: "garbage {", openable: false }])
})

test("every error shape becomes one entry with file, line and message", () => {
  const got = parse(hyprctlJson(SAMPLE))
  assert.deepEqual(got, [
    { file: `${H}/bindings.lua`, line: 12, message: "hl.bind: 'key' is required", openable: true },
    { file: `${H}/hyprland.lua`, line: 3, message: "attempt to call a nil value (global 'foo')", openable: true },
    { file: `${H}/looknfeel.lua`, line: 8, message: `require("looknfeel"): unexpected symbol near '='`, openable: true },
    {
      file: `${H}/monitors.lua`, line: 2,
      message: `require("monitors"): error loading module 'monitors' from file '${H}/monitors.lua': '=' expected near 'y'`,
      openable: true,
    },
    { file: "...omarchy/default/hypr/bindings/media.lua", line: 9, message: "hl.bind: expected a string", openable: false },
    { file: "", line: 0, message: "hl.window_rule: 'match' is required", openable: false },
    { file: "", line: 0, message: "[Lua] execution timed out in config reload", openable: false },
    { file: `${H}/hyprland.conf`, line: 42, message: "invalid field foo: missing a value", openable: true },
  ])
})

test("plain hyprctl output parses the same as -j", () => {
  assert.deepEqual(parse(SAMPLE.join("\n") + "\n"), parse(hyprctlJson(SAMPLE)))
})

test("where and summary", () => {
  const errors = L.parseErrors(hyprctlJson(SAMPLE))
  assert.equal(L.where(errors[0]), "bindings.lua:12")
  assert.equal(L.where(errors[6]), "")
  assert.equal(L.summary(errors), "bindings.lua:12  hl.bind: 'key' is required\n+7 more")
  assert.equal(L.summary(errors.slice(6, 7)), "[Lua] execution timed out in config reload")
  assert.equal(L.summary([]), "")
})

test("bin/hypr-doctor-open uses the line syntax of the default editor", () => {
  const home = mkdtempSync(join(tmpdir(), "hypr-doctor-"))
  const stubs = join(home, "bin")
  mkdirSync(stubs)
  mkdirSync(join(home, ".local/state/omarchy/defaults"), { recursive: true })
  for (const name of ["nvim", "code", "hx", "omarchy-launch-editor"]) {
    writeFileSync(join(stubs, name), "#!/bin/sh\n")
    chmodSync(join(stubs, name), 0o755)
  }
  const run = (editor, ...args) => {
    writeFileSync(join(home, ".local/state/omarchy/defaults/editor"), editor + "\n")
    const r = spawnSync("bash", [new URL("../bin/hypr-doctor-open", import.meta.url).pathname, "--print", ...args], {
      env: { HOME: home, PATH: `${stubs}:/usr/bin:/bin` }, encoding: "utf8",
    })
    assert.equal(r.status, 0, r.stderr)
    return r.stdout.trim().split("\n")
  }
  assert.deepEqual(run("nvim", "/a b.lua", "12"), ["omarchy-launch-editor", "+12", "/a b.lua"])
  assert.deepEqual(run("code", "/x.lua", "3"), ["omarchy-launch-editor", "--goto", "/x.lua:3"])
  assert.deepEqual(run("hx", "/x.lua", "3"), ["omarchy-launch-editor", "/x.lua:3"])
  // Not installed: omarchy-launch-editor falls back to nvim, so we do too.
  assert.deepEqual(run("not-installed", "/x.lua", "3"), ["omarchy-launch-editor", "+3", "/x.lua"])
  assert.deepEqual(run("nvim", "/x.lua", "0"), ["omarchy-launch-editor", "/x.lua"])
  assert.deepEqual(run("nvim", "/x.lua", "$(id)"), ["omarchy-launch-editor", "/x.lua"])
})
