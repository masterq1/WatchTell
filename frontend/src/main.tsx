import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { configureAmplify } from './lib/auth'
import './index.css'

configureAmplify()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
