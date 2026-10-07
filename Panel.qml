pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "Logic.js" as Logic

// The error list: one row per error with where it is and what Hyprland said,
// and a button that opens the file at that line. Up/Down (or j/k) move,
// Enter opens, Esc closes.
Panel {
  id: root
  moduleName: "nejcc.hypr-doctor"
  ipcTarget: "nejcc.hypr-doctor"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root
  readonly property var errors: hostWidget ? hostWidget.errors : []
  property int selectedIndex: 0

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  onErrorsChanged: selectedIndex = Math.min(selectedIndex, Math.max(0, errors.length - 1))

  function openSelected() {
    if (hostWidget && errors[selectedIndex]) hostWidget.openError(errors[selectedIndex])
  }

  function switchPanel(direction) {
    if (bar && typeof bar.switchPanelFrom === "function") return bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(460))
    contentHeight: panel.fittedContentHeight(column.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function(dx, dy) {
        if (dy !== 0) root.selectedIndex = Math.max(0, Math.min(root.errors.length - 1, root.selectedIndex + dy))
      }
      onActivateRequested: root.openSelected()
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Flickable {
        anchors.fill: parent
        contentHeight: column.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        Column {
          id: column
          width: parent.width
          spacing: Style.space(6)

          PanelSectionHeader {
            text: root.errors.length === 1 ? "1 config error" : root.errors.length + " config errors"
            foreground: root.foreground
            fontFamily: root.fontFamily
          }

          Repeater {
            model: root.errors

            Rectangle {
              id: row
              required property var modelData
              required property int index
              readonly property bool selected: index === root.selectedIndex

              width: column.width
              height: rowContent.implicitHeight + Style.space(12)
              radius: Style.space(4)
              color: selected ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08) : "transparent"

              MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                onEntered: root.selectedIndex = row.index
                onClicked: root.openSelected()
              }

              Column {
                id: rowContent
                anchors.left: parent.left
                anchors.right: openButton.left
                anchors.verticalCenter: parent.verticalCenter
                anchors.leftMargin: Style.space(8)
                anchors.rightMargin: Style.space(8)
                spacing: Style.space(2)

                Text {
                  visible: text !== ""
                  width: parent.width
                  text: Logic.where(row.modelData)
                  textFormat: Text.PlainText
                  elide: Text.ElideMiddle
                  color: root.urgent
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  font.bold: true
                }

                Text {
                  width: parent.width
                  text: row.modelData.message
                  textFormat: Text.PlainText
                  wrapMode: Text.Wrap
                  maximumLineCount: 4
                  elide: Text.ElideRight
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                }

                Text {
                  visible: row.modelData.file !== ""
                  width: parent.width
                  text: Logic.tildePath(row.modelData.file, Quickshell.env("HOME"))
                  textFormat: Text.PlainText
                  elide: Text.ElideMiddle
                  color: Qt.darker(root.foreground, 1.4)
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }
              }

              PanelActionButton {
                id: openButton
                anchors.right: parent.right
                anchors.rightMargin: Style.space(4)
                anchors.verticalCenter: parent.verticalCenter
                visible: row.modelData.openable
                width: openButton.visible ? openButton.size : 0
                iconText: ""
                tooltipText: "Open in editor"
                foreground: root.foreground
                fontFamily: root.fontFamily
                hasCursor: row.selected
                onClicked: {
                  root.selectedIndex = row.index
                  root.openSelected()
                }
              }
            }
          }
        }
      }
    }
  }
}
