import { useEffect, useState } from 'react'
import { ContentContext, loadContent, type Content } from './content'
import { loadProgress, totals } from './lib/score'
import type { Company } from './types/content'
import { Home } from './pages/Home'
import { ReportCard } from './pages/ReportCard'
import { CompanyPicker, TIER_LABEL } from './pages/CompanyPicker'
import { ChatPanel } from './pages/Chat'
import { DesignModule } from './modules/design/DesignModule'
import { QueryModule } from './modules/query/QueryModule'
import { PresentModule } from './modules/present/PresentModule'
import { SlotOutlet, SlotsProvider } from './components/Slots'
import { HotkeysProvider, useHotkeys } from './lib/hotkeys'
import { setChatContext } from './lib/chatContext'

export type View = 'work' | 'report' | 'packs'
export type Program = 'design' | 'query' | 'present'

const COMPANY_KEY = 'dbsim.company'
const PROGRAM_KEY = 'dbsim.program'

export default function App() {
  const [content, setContent] = useState<Content | null>(null)
  const [view, setView] = useState<View>('work')
  const [program, setProgram] = useState<Program>(() => (localStorage.getItem(PROGRAM_KEY) as Program) || 'design')
  const [companyId, setCompanyId] = useState<string | null>(() => localStorage.getItem(COMPANY_KEY))
  const [reloadKey, setReloadKey] = useState(0)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    loadContent().then((c) => alive && setContent(c))
    return () => {
      alive = false
    }
  }, [reloadKey])

  useEffect(() => {
    const h = () => setTick((t) => t + 1)
    const open = () => setView('packs')
    window.addEventListener('dbsim-progress', h)
    window.addEventListener('dbsim-open-settings', open)
    return () => {
      window.removeEventListener('dbsim-progress', h)
      window.removeEventListener('dbsim-open-settings', open)
    }
  }, [])

  const pickCompany = (c: Company | null) => {
    setCompanyId(c?.id ?? null)
    if (c) localStorage.setItem(COMPANY_KEY, c.id)
    else localStorage.removeItem(COMPANY_KEY)
    setView('work')
  }
  const pickProgram = (p: Program) => {
    setProgram(p)
    localStorage.setItem(PROGRAM_KEY, p)
    setView('work')
  }

  const company = content?.companies.find((c) => c.id === companyId) ?? null
  useEffect(() => {
    setChatContext({ company: company?.name ?? null, module: view === 'work' ? program : view })
  }, [company, program, view])

  if (!content) {
    return (
      <div className="page">
        <p className="muted">Loading content packs…</p>
      </div>
    )
  }
  const t = totals(loadProgress())
  void tick

  const programs: [Program, string, string][] = [
    ['design', '✏', 'Diagramming'],
    ['query', '⚡', 'Query Workbench'],
    ['present', '📊', 'Viz'],
  ]

  return (
    <ContentContext.Provider value={content}>
      <SlotsProvider>
        <HotkeysProvider>
          <GlobalHotkeys company={!!company} pickProgram={pickProgram} setView={setView} />
          <div className="app">
            <header className="topbar">
              <div className="brand">
                DB Analyst Simulator<small>{content.notation.name}</small>
              </div>
              {company && (
                <button className="employer" onClick={() => pickCompany(null)} title="Change employer">
                  <span>{company.logo ?? '🏢'}</span> {company.name} <span className={`badge tier ${company.tier}`}>{TIER_LABEL[company.tier]}</span>
                </button>
              )}
              <nav>
                {company &&
                  programs.map(([id, icon, label]) => (
                    <button key={id} className={view === 'work' && program === id ? 'active' : ''} onClick={() => pickProgram(id)}>
                      {icon} {label}
                    </button>
                  ))}
                <button className={view === 'report' ? 'active' : ''} onClick={() => setView('report')}>
                  Report card
                </button>
                <button className={view === 'packs' ? 'active' : ''} onClick={() => setView('packs')}>
                  Settings &amp; packs
                </button>
              </nav>
              <div className="spacer" />
              <div className="score" title="Design points · best query sprint · presentation points">
                ✏ {t.design} · ⚡ {t.queryBest} · 📊 {t.present}
              </div>
            </header>
            <div className="workspace">
              <section className="pane main">
                {view === 'packs' && <Home onReload={() => setReloadKey((k) => k + 1)} />}
                {view === 'report' && <ReportCard />}
                {view === 'work' && !company && <CompanyPicker onPick={pickCompany} />}
                {view === 'work' && company && program === 'design' && <DesignModule key={company.id} company={company} />}
                {view === 'work' && company && program === 'query' && <QueryModule key={company.id} company={company} />}
                {view === 'work' && company && program === 'present' && <PresentModule key={company.id} company={company} />}
              </section>
              <section className="pane side">
                <div className="pane-title">Instructions &amp; help</div>
                <SlotOutlet name="help" className="pane-body help" fallback={<div className="muted">Nothing to show yet.</div>} />
              </section>
              <section className="pane controls-pane">
                <div className="pane-title">
                  <SlotOutlet name="controlsTitle" inline fallback="Controls" />
                </div>
                <SlotOutlet name="controls" className="pane-body" fallback={<div className="muted">Pick a job to start.</div>} />
              </section>
              <section className="pane chat-pane">
                <ChatPanel />
              </section>
            </div>
          </div>
        </HotkeysProvider>
      </SlotsProvider>
    </ContentContext.Provider>
  )
}

function GlobalHotkeys({ company, pickProgram, setView }: { company: boolean; pickProgram: (p: Program) => void; setView: (v: View) => void }) {
  useHotkeys('Navigation', [
    { keys: 'ctrl+shift+1', label: 'Diagramming', handler: () => company && pickProgram('design') },
    { keys: 'ctrl+shift+2', label: 'Query Workbench', handler: () => company && pickProgram('query') },
    { keys: 'ctrl+shift+3', label: 'Viz', handler: () => company && pickProgram('present') },
    { keys: 'ctrl+shift+4', label: 'Report card', handler: () => setView('report') },
  ])
  return null
}

export function notifyProgress() {
  window.dispatchEvent(new Event('dbsim-progress'))
}
