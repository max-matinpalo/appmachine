// App: page shell with the app name and the Releases | Devices views (#devices).
import { useEffect, useState } from 'preact/hooks'
import { request } from './api/request.js'
import { Releases } from './releases/Releases.jsx'
import { Devices } from './devices/Devices.jsx'
import styles from './App.module.css'

const views = [['releases', 'Releases'], ['devices', 'Devices']]
const current = () => location.hash === '#devices' ? 'devices' : 'releases'

export function App() {
  const [app, setApp] = useState(null)
  const [view, setView] = useState(current)

  useEffect(() => {
    request('app').then(setApp, () => {})
    const update = () => setView(current())
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  return <main class={styles.page}>
    <header class={styles.header}>
      <p class={styles.brand}>AppMachine</p>
      <h1 class={styles.app}>{app?.name || 'Web updates'}</h1>
      <nav class={styles.nav} aria-label="Views">
        {views.map(([value, label]) => <a key={value} href={'#' + value} class={styles.link} aria-current={view === value ? 'page' : undefined}>{label}</a>)}
      </nav>
    </header>
    {view === 'devices' ? <Devices /> : <Releases />}
  </main>
}
