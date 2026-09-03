; Custom NSIS hooks for ARK
; Only wipe user data on a real uninstall — NEVER during an in-app upgrade.
; (${isUpdated} is set by electron-builder when the installer replaces an existing build.)

!macro customInstall
  ; Fresh install (not an in-place upgrade): drop setup completion + saved
  ; sign-in so the user always sees Auth → then Hardware → Models → Connect.
  ; Keeps models/keys unless uninstall already removed AppData.
  ${ifNot} ${isUpdated}
    CreateDirectory "$APPDATA\ARK"
    Delete "$APPDATA\ARK\ark-setup.json"
    Delete "$APPDATA\ARK\ark-install-id"
    Delete "$APPDATA\ARK\ark-auth-storage.dat"
  ${endIf}

  ; Force Windows to re-read ARK.exe / shortcut icons after upgrades
  ; (Start menu + taskbar otherwise keep a cached older mark).
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    RMDir /r "$APPDATA\ARK"
    RMDir /r "$LOCALAPPDATA\ARK"
  ${endIf}
!macroend
