import { BrowserRouter } from 'react-router-dom'
import SightPayRoutes from './SightPayRoutes'
import { LanguageProvider } from './components/Language'

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider><SightPayRoutes /></LanguageProvider>
    </BrowserRouter>
  )
}
