import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const root = document.querySelector('#root')

if (!(root instanceof HTMLElement)) {
  throw new Error('Admin root element was not found')
}

createRoot(root).render(
  <StrictMode>
    <main>
      <h1>play-cms</h1>
    </main>
  </StrictMode>,
)
