.pragma library

// Turns `hyprctl -j configerrors` output into { file, line, message } entries.
// Kept free of QML so it runs under plain Node (see tests/).
//
// Hyprland keeps one string per error and joins them with "\n"; hyprctl then
// splits that on "\n" again, so a Lua traceback arrives as extra lines. Shapes
// (Hyprland 0.56, src/config/lua and hyprlang):
//   /path/file.lua:12: message          syntax, runtime and hl.* argument errors
//   require("mod"): /path/mod.lua:3: …  a module that failed to load
//   stack traceback: / <tab>…           traceback lines, folded into the entry
//   Config error in file F at line N: … hyprlang (.conf) configs
// With no errors hyprctl -j prints [""].

// Lua shortens long chunk names to "...tail/of/path.lua", so that form has
// a location but no file we can open.
var LOCATION = /(\/[^\s:"']+|\.\.\.[^\s:"']+):(\d+):\s*/

function rawLines(raw) {
  var list
  try {
    list = JSON.parse(raw)
  } catch (e) {
    list = String(raw || "").split("\n")
  }
  return Array.isArray(list) ? list.map(String) : []
}

// Pulls the first file:line out of text. Returns the text with it removed.
function locate(entry, text) {
  var m = LOCATION.exec(text)
  if (!m) return text
  entry.file = m[1]
  entry.line = Number(m[2])
  return text.slice(0, m.index) + text.slice(m.index + m[0].length)
}

function startEntry(line) {
  var m = /^Config error in file (.+?) at line (\d+): (.*)$/.exec(line)
  if (m) return { file: m[1], line: Number(m[2]), message: m[3] }
  m = /^Config error at line (\d+): (.*)$/.exec(line)
  if (m) return { file: "", line: Number(m[1]), message: m[2] }
  m = /^Config error in file (.+?): (.*)$/.exec(line)
  if (m) return { file: m[1], line: 0, message: m[2] }

  var entry = { file: "", line: 0, message: "" }
  // "?:?" is what Hyprland writes when it cannot tell where a call came from.
  entry.message = locate(entry, line.replace(/^\?:\?: /, "")).trim()
  return entry
}

function parseErrors(raw) {
  var out = []
  var current = null
  var inTrace = false
  rawLines(raw).forEach(function (line) {
    if (line.trim() === "") return
    if (current && (line === "stack traceback:" || /^\s/.test(line))) {
      if (line === "stack traceback:") inTrace = true
      // Detail before the traceback, e.g. "error loading module … :\n\t<why>".
      else if (!inTrace) {
        var rest = current.file ? line.trim() : locate(current, line.trim()).trim()
        current.message = (current.message + " " + rest).trim()
      }
      return
    }
    inTrace = false
    current = startEntry(line)
    out.push(current)
  })
  out.forEach(function (e) {
    e.openable = e.file.charAt(0) === "/"
  })
  return out
}

function baseName(path) {
  var parts = String(path).split("/")
  return parts[parts.length - 1]
}

// "bindings.lua:12" or "" when Hyprland gave no location.
function where(e) {
  if (!e.file) return e.line > 0 ? "line " + e.line : ""
  return e.line > 0 ? baseName(e.file) + ":" + e.line : baseName(e.file)
}

// Show paths under the home folder as "~/…" (shorter, and screenshots don't
// carry the user name).
function tildePath(path, home) {
  if (!home || !path) return path || ""
  home = home.replace(/\/+$/, "")
  if (path === home) return "~"
  return path.indexOf(home + "/") === 0 ? "~" + path.slice(home.length) : path
}

// Toast body: the first error, plus how many more there are.
function summary(errors) {
  if (!errors.length) return ""
  var first = errors[0]
  var text = (where(first) ? where(first) + "  " : "") + first.message
  if (errors.length > 1) text += "\n+" + (errors.length - 1) + " more"
  return text
}
