import QtQuick
import Quickshell.Hyprland
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Logic.js" as Logic

// Warning icon with the error count, shown only while `hyprctl configerrors`
// has something to say. Checks once at startup and again on every
// configreloaded event; nothing runs in between.
BarWidget {
  id: root
  moduleName: "nejcc.hypr-doctor"

  property var errors: []
  property bool reloadSeen: false
  property bool recheck: false

  readonly property string openScript: decodeURIComponent(String(Qt.resolvedUrl("bin/hypr-doctor-open")).replace(/^file:\/\//, ""))

  function check(fromReload) {
    if (fromReload) reloadSeen = true
    if (errorsProc.running) {
      recheck = true
      return
    }
    errorsProc.running = true
  }

  function apply(text) {
    var next = Logic.parseErrors(text)
    var toast = reloadSeen && next.length > 0
    reloadSeen = false
    errors = next
    if (next.length === 0) close()
    if (toast && isLeader()) notify(next)
  }

  // One bar per monitor means one widget per monitor; only the first one toasts.
  function isLeader() {
    var peers = root.bar && typeof root.bar.moduleWidgets === "function" ? root.bar.moduleWidgets(root.moduleName) : []
    return peers.length === 0 || peers[0] === root
  }

  function openArgv(e) {
    return ["bash", openScript, e.file, String(e.line)]
  }

  function openError(e) {
    if (e && e.openable) Util.execArgv(openArgv(e))
  }

  function notify(list) {
    var title = list.length === 1 ? "Hyprland config error" : list.length + " Hyprland config errors"
    var argv = ["omarchy-notification-send", "--app-name", "Hypr Doctor", "-u", "normal", "-g", "", title, Logic.summary(list)]
    if (list[0].openable) argv = argv.concat(["--exec"], openArgv(list[0]))
    Util.execArgv(argv)
  }

  // ---- Panel routing, same shape as the clock: the bar finds open/close/opened
  //      on the widget root.
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function open() { if (panelLoader.item && errors.length > 0) panelLoader.item.open() }
  function close() { if (panelLoader.item) panelLoader.item.close() }
  function togglePanel() { opened ? close() : open() }
  function closeForPopoutSwitch() { if (panelLoader.item) panelLoader.item.closeForPopoutSwitch() }
  function refresh() { check(false) }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    target.bar = root.bar
    target.settings = root.settings
    target.anchorItem = button
    target.hostWidget = root
  }

  visible: errors.length > 0
  implicitWidth: root.visible ? button.implicitWidth : 0
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()
  Component.onCompleted: check(false)

  Connections {
    target: Hyprland
    function onRawEvent(event) {
      if (event && String(event.name) === "configreloaded") root.check(true)
    }
  }

  Process {
    id: errorsProc
    command: ["hyprctl", "-j", "configerrors"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        if (root.recheck) return
        root.apply(text)
      }
    }
    onExited: {
      if (!root.recheck) return
      root.recheck = false
      running = true
    }
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  IpcHandler {
    target: "nejcc.hypr-doctor"

    function refresh(): void { root.broadcast("refresh") }
    function open(): void { root.open() }
    function close(): void { root.close() }
    function toggle(): void { root.togglePanel() }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    // Vertical bars only have room for the glyph.
    text: root.errors.length === 0 ? "" : (root.vertical ? "\uf071" : "\uf071 " + root.errors.length)
    active: true
    tooltipText: root.errors.length === 1 ? "1 Hyprland config error" : root.errors.length + " Hyprland config errors"
    onPressed: root.togglePanel()
  }
}
