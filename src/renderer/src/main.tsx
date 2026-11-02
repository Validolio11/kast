import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initMobilePlatform } from './lib/platform'

async function main() {
  await initMobilePlatform().catch((error) => console.error('Mobile initialization failed', error))
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  )
}

void main()
