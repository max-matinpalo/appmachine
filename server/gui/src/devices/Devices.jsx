import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { request } from '../api/request.js'
import { Button } from '../ui/Button.jsx'
import { DeviceRow } from './DeviceRow.jsx'
import styles from './Devices.module.css'

const columns = ['Device', 'System', 'Browser', 'Screen', 'Hardware', 'Opened from', 'Country', 'Version', 'Last seen']

export function Devices() {
  const [devices, setDevices] = useState(null)
  const [error, setError] = useState('')
  const sequence = useRef(0)

  const refresh = useCallback(async () => {
    // 1. Keep only the newest response
    const current = ++sequence.current
    try {
      const list = await request('devices')
      if (current !== sequence.current) return
      setDevices(list)
      setError('')
    } catch {
      if (current === sequence.current) setError('Could not load devices. Try again.')
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      sequence.current++
    }
  }, [refresh])

  const installed = devices?.filter(device => device.installed).length

  return <section aria-labelledby="devices-title">
    <div class={styles.top}>
      <h2 id="devices-title" class={styles.title}>Devices</h2>
      {devices?.length > 0 && <p class={styles.summary}>{devices.length} {devices.length === 1 ? 'device' : 'devices'} · {installed} installed</p>}
    </div>
    {error && <div class={styles.error} role="alert">
      <p>{error}</p>
      <Button onClick={refresh}>Refresh</Button>
    </div>}
    {devices === null ? !error && <p class={styles.message} role="status">Loading devices…</p>
      : devices.length ? <table class={styles.table}>
        <thead class={styles.head}>
          <tr>{columns.map(column => <th key={column} class={styles.column} scope="col">{column}</th>)}</tr>
        </thead>
        <tbody class={styles.body}>{devices.map(device => <DeviceRow key={device.id} device={device} />)}</tbody>
      </table> : <div class={styles.empty}>
        <h3 class={styles.emptyTitle}>No devices yet</h3>
        <p class={styles.summary}>Devices appear here after they open the app.</p>
      </div>}
  </section>
}
