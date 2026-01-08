import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles.css'

// Use createRoot for better performance
const root = createRoot(document.getElementById('root'))

// Wrap in StrictMode for development optimizations
root.render(
  <StrictMode>
    <HashRouter>
    <App />
    </HashRouter>
  </StrictMode>
)
