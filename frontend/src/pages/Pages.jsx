import { Navigate, useParams } from 'react-router-dom'

import { merchants } from '../data/demoData'

import PriorityQueue from './PriorityQueue'
import MerchantDetail from './MerchantDetail'
import VisitAudit from './VisitAudit'
import AIAudit from './AIAudit'
import Manager from './Manager'
import Analytics from './Analytics'

import Layout from '../components/Layout'
import { PriorityTable } from '../components/ui'

const names = {
  visits: 'My Visits',
  queue: 'Priority Queue',
  merchants: 'Merchants',
  audits: 'AI Audits',
  evidence: 'Visit Evidence',
  impact: 'Impact',
}

export function FseSection() {
  const { section } = useParams()

  if (section === 'queue') {
    return <PriorityQueue />
  }

  if (section === 'merchants') {
    return <Navigate to="/merchants/m1" replace />
  }

  // Dedicated AI Audit page
  if (section === 'audits') {
    return <AIAudit />
  }

  // Visit Evidence remains separate
  if (section === 'evidence') {
    return <Navigate to="/visits/SP-10482" replace />
  }

  if (section === 'visits') {
    return <Navigate to="/visits/SP-10482" replace />
  }

  if (section === 'impact') {
    return <Analytics />
  }

  return (
    <Layout crumb={names[section] || 'Not found'}>
      <div className="pad">
        <h1>{names[section] || 'Not found'}</h1>

        <div className="card top16">
          <PriorityTable rows={merchants} />
        </div>
      </div>
    </Layout>
  )
}

export {
  PriorityQueue,
  MerchantDetail,
  VisitAudit,
  AIAudit,
  Manager,
  Analytics,
}