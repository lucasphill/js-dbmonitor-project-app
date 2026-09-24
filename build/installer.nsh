!include "LogicLib.nsh"

; Keep the Run value name, argument, and opt-out path in sync with electron/startup.cjs.
!macro customInstall
  ${If} ${FileExists} "$APPDATA\DBMonitor\startup-disabled"
    ; An explicit opt-out survives both upgrades and reinstalls with AppData retained.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DBMonitor"
  ${Else}
    ; Rewriting an unchanged value may reset Windows StartupApproved state.
    StrCpy $1 '"$appExe" --dbmonitor-autostart'
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DBMonitor"
    ${If} $0 != $1
      WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DBMonitor" $1
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  ; The old uninstaller is also called during upgrades with --updated.
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DBMonitor"
  ${endIf}
!macroend
