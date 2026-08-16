; Custom NSIS hooks for ARK
; Wipe all ARK user data (models, keys, projects, setup) on uninstall.

!macro customUnInstall
  RMDir /r "$APPDATA\ARK"
  RMDir /r "$LOCALAPPDATA\ARK"
!macroend
