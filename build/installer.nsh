; Custom NSIS hooks for ARK
; Only wipe user data on a real uninstall — NEVER during an in-app upgrade.
; (${isUpdated} is set by electron-builder when the installer replaces an existing build.)

!macro customUnInstall
  ${ifNot} ${isUpdated}
    RMDir /r "$APPDATA\ARK"
    RMDir /r "$LOCALAPPDATA\ARK"
  ${endIf}
!macroend
