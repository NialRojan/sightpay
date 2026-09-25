import { BrowserRouter } from 'react-router-dom'
import SightPayRoutes from './SightPayRoutes'

export default function App() {
  return (
    <BrowserRouter>
      <SightPayRoutes />
    </BrowserRouter>
  )
}