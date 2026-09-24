; Custom NSIS hooks for NOVA
; Only wipe user data on a real uninstall — NEVER during an in-app upgrade.

!macro customInstall
  ${ifNot} ${isUpdated}
    CreateDirectory "$APPDATA\NOVA"
    Delete "$APPDATA\NOVA\nova-setup.json"
    Delete "$APPDATA\NOVA\nova-install-id"
    Delete "$APPDATA\NOVA\nova-auth-storage.dat"
  ${endIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    RMDir /r "$APPDATA\NOVA"
    RMDir /r "$LOCALAPPDATA\NOVA"
    RMDir /r "$APPDATA\NOVA-Dev"
    RMDir /r "$LOCALAPPDATA\NOVA-Dev"
  ${endIf}
!macroend
