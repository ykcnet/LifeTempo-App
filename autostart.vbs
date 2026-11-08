' LifeTempo auto-start (portable)
' Put a shortcut/copy of this file in the Windows Startup folder.
' It starts autostart.ps1 from the same folder, hidden.
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & scriptDir & "\autostart.ps1""", 0, False
