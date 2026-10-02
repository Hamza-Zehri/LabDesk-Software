; ---------------------------------------------------------------------------
; LabDesk — NSIS installer customisation.
;
; electron-builder injects this file *before* templates/nsis/installer.nsi, so
; the defines and macros below are visible to the template. The assisted
; installer has no welcome page by default; defining `customWelcomePage` adds
; one, and MUI defaults only apply when the value is still undefined, so the
; credit text below is what the user sees.
; ---------------------------------------------------------------------------

!define MUI_WELCOMEPAGE_TITLE "Welcome to LabDesk Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of LabDesk - Laboratory Management System.$\r$\n$\r$\nSoftware by Engr. Hamza Asad$\r$\nBrightpixel.vercel.app$\r$\n$\r$\nClick Next to continue."

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

; Keep the official product name on the finish page short and branded.
!define MUI_FINISHPAGE_TITLE "LabDesk is ready"
