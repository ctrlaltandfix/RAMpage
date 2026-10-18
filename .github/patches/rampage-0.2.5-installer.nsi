; RAMpage 0.2.5 beta repair-release installer.
; Update the per-user installation; do not touch saved library data.
Unicode true
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
SetOverwrite try
Name "RAMpage"
OutFile "..\..\dist\RAMpage-Setup-0.2.exe"
InstallDir "$LOCALAPPDATA\Programs\RAMpage"
InstallDirRegKey HKCU "Software\RAMpage" "InstallDir"
VIProductVersion "0.2.5.0"
VIAddVersionKey "ProductName" "RAMpage"
VIAddVersionKey "FileDescription" "RAMpage 0.2 Beta Setup"
VIAddVersionKey "ProductVersion" "0.2 Beta"
VIAddVersionKey "FileVersion" "0.2.5"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.rampage.launcher"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Var WaitCount
Var ProcessResult

Function .onInit
  SetShellVarContext current
FunctionEnd

Function WaitUntilClosed
  StrCpy $WaitCount 0
  Loop:
    nsExec::ExecToStack 'powershell.exe -NoProfile -NonInteractive -Command "if (Get-Process -Name RAMpage -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"'
    Pop $ProcessResult
    Pop $R9
    StrCmp $ProcessResult "0" Closed
    Sleep 500
    IntOp $WaitCount $WaitCount + 1
    IntCmp $WaitCount 60 Blocked Loop Blocked
  Blocked:
    CreateDirectory "$APPDATA\RAMpage"
    FileOpen $0 "$APPDATA\RAMpage\update-failed.txt" w
    FileWrite $0 "RAMpage 0.2.5 setup could not replace the app because RAMpage was still running."
    FileClose $0
    MessageBox MB_ICONSTOP "RAMpage is still running. Close it, then run this update again." /SD IDOK
    Abort "RAMpage remained open; update did not run."
  Closed:
FunctionEnd

Section "RAMpage" SecMain
  nsExec::ExecToLog 'taskkill /IM "RAMpage.exe" /T'
  Call WaitUntilClosed
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  SetOverwrite try
  ClearErrors
  File /r "..\..\dist\win-unpacked\*.*"
  IfErrors FailedCopy
  SetOverwrite on

  FileOpen $0 "$INSTDIR\installed-build.txt" w
  FileWrite $0 "0.2.5"
  FileClose $0
  IfErrors FailedCopy
  Delete "$APPDATA\RAMpage\update-failed.txt"
  WriteUninstaller "$INSTDIR\Uninstall RAMpage.exe"

  CreateShortCut "$SMPROGRAMS\RAMpage.lnk" "$INSTDIR\RAMpage.exe" "" "$INSTDIR\RAMpage.exe"
  CreateShortCut "$SMPROGRAMS\RAMpage Big Picture.lnk" "$INSTDIR\RAMpage.exe" "--bigpicture" "$INSTDIR\RAMpage.exe"
  ReadRegStr $0 HKCU "Software\RAMpage" "InstallDir"
  StrCmp $0 "" CreateDesktop
  Goto SkipDesktop
  CreateDesktop:
    CreateShortCut "$DESKTOP\RAMpage.lnk" "$INSTDIR\RAMpage.exe" "" "$INSTDIR\RAMpage.exe"
  SkipDesktop:
  WriteRegStr HKCU "Software\RAMpage" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "RAMpage Game Launcher"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "0.2 Beta"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "RAMpage"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\RAMpage.exe,0"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall RAMpage.exe"'
  WriteRegStr HKCU "${UNINSTKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall RAMpage.exe" /S'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1

  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/RELAUNCH" $1
  IfErrors Complete
    Exec '"$INSTDIR\RAMpage.exe"'
  Complete:
  Goto Success

  FailedCopy:
    CreateDirectory "$APPDATA\RAMpage"
    FileOpen $0 "$APPDATA\RAMpage\update-failed.txt" w
    FileWrite $0 "RAMpage 0.2.5 update could not replace all files. Please close the app and retry setup."
    FileClose $0
    MessageBox MB_ICONSTOP "RAMpage update failed to copy all files. Your library was not deleted. Please run setup again." /SD IDOK
    Abort "Update failed; install files not replaced."
  Success:
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\RAMpage.lnk"
  Delete "$SMPROGRAMS\RAMpage Big Picture.lnk"
  Delete "$DESKTOP\RAMpage.lnk"
  DeleteRegKey HKCU "${UNINSTKEY}"
  RMDir /r "$INSTDIR"
  ; Preserve $APPDATA\RAMpage and $LOCALAPPDATA\RAMpage\data.
SectionEnd
