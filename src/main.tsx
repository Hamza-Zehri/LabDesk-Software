import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LabProvider } from './app/LabProvider'
import { applyTheme, readTheme } from './core/theme'
import './index.css'

// Apply the stored appearance before the first paint so the shell never flashes
// the wrong palette.
applyTheme(readTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LabProvider>
      <App />
    </LabProvider>
  </React.StrictMode>,
)
