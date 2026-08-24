' flo-success 프로덕션 서버를 **창 없이** 띄운다 (윈도우 로그온 시 자동 실행용).
'
' ★ 왜 VBS인가 — 작업 스케줄러가 node.exe를 직접 실행하면 콘솔 창이 남는다.
'   WScript.Shell.Run의 세 번째 인자 0이 "창 숨김"이라 배경에서 조용히 돈다.
' ★ 경로를 박아 두지 않는다 — 이 파일 위치(scripts/)에서 프로젝트 루트를 역산하므로
'   저장소를 다른 곳에 두거나 다른 PC에 복제해도 그대로 동작한다.
' ★ npm이 아니라 next를 직접 부른다 — npm.cmd는 셸을 한 겹 더 띄워 창이 깜빡인다.
'
' 수동 실행:  wscript scripts\start-server.vbs
' 종료:       작업 관리자에서 node.exe 종료, 또는 PowerShell에서
'             Get-Process node | Where-Object { $_.Path -like '*nodejs*' } | Stop-Process

Option Explicit

Dim fso, sh, root, nextBin, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

' scripts\start-server.vbs → scripts → 프로젝트 루트
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
nextBin = fso.BuildPath(root, "node_modules\next\dist\bin\next")

If Not fso.FileExists(nextBin) Then
  ' 의존성이 없으면 조용히 죽지 말고 이유를 남긴다.
  sh.LogEvent 1, "flo-success 자동 실행 실패: next를 찾을 수 없습니다 - " & nextBin
  WScript.Quit 1
End If

If Not fso.FolderExists(fso.BuildPath(root, ".next")) Then
  sh.LogEvent 1, "flo-success 자동 실행 실패: 빌드(.next)가 없습니다. npm run build를 먼저 실행하세요."
  WScript.Quit 1
End If

sh.CurrentDirectory = root
cmd = "node """ & nextBin & """ start"

' 0 = 창 숨김, False = 끝날 때까지 기다리지 않음
sh.Run cmd, 0, False
