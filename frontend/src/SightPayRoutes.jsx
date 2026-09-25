import { Routes, Route, Navigate } from 'react-router-dom'
import './styles/sightpay.css'

import Landing from './pages/Landing'
import Login from './pages/Login'
import Fse from './pages/Fse'
import FseMobile from './pages/FseMobile'
import PriorityQueue from './pages/PriorityQueue'
import MerchantDetail from './pages/MerchantDetail'
import VisitAudit from './pages/VisitAudit'
import AIAudit from './pages/AIAudit'
import Manager from './pages/Manager'
import Analytics from './pages/Analytics'

export default function SightPayRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/fse" element={<Fse />} />
      <Route path="/fse/mobile" element={<FseMobile />} />
      <Route path="/queue" element={<PriorityQueue />} />
      <Route path="/fse/queue" element={<PriorityQueue />} />
      <Route path="/merchants/:id" element={<MerchantDetail />} />
      <Route path="/fse/merchants" element={<Navigate to="/merchants/m1" replace />} />
      <Route path="/visits/:id" element={<VisitAudit />} />
      <Route path="/fse/visits/:id" element={<VisitAudit />} />
      <Route path="/fse/visits" element={<Navigate to="/visits/SP-10482" replace />} />
      <Route path="/audits/:id" element={<AIAudit />} />
      <Route path="/fse/audits" element={<AIAudit />} />
      <Route path="/fse/evidence" element={<Navigate to="/visits/SP-10482" replace />} />
      <Route path="/manager" element={<Manager />} />
      <Route path="/analytics" element={<Analytics />} />
      <Route path="/fse/impact" element={<Analytics />} />
      <Route path="*" element={<Navigate to="/fse" replace />} />
    </Routes>
  )
}