; Close a running DeskHealth AI (and its AI engine) automatically before
; installing, updating or uninstalling, instead of asking the user to restart.
!macro customCheckAppRunning
  nsExec::Exec 'taskkill /F /T /IM "DeskHealth AI.exe"'
  nsExec::Exec 'taskkill /F /T /IM "deskhealth-engine.exe"'
  Sleep 1500
!macroend
