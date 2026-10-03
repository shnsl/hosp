import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import App from './App.tsx'
import './index.css'
import { setupImmersiveMode } from './lib/immersive'
import { setupSuppressBrowserChrome } from './lib/suppressBrowserChrome'

setupImmersiveMode()
setupSuppressBrowserChrome()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
