import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { request } from '../api/request.js'
import { Button } from '../ui/Button.jsx'
import { ChannelTabs } from './ChannelTabs.jsx'
import { ReleaseCard } from './ReleaseCard.jsx'
import styles from './Releases.module.css'

export function Releases() {
  const [releases, setReleases] = useState(null)
  const [channel, setChannel] = useState('production')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(null)
  const pending = useRef(false)
  const sequence = useRef(0)

  const refresh = useCallback(async () => {
    // 1. Ignore stale refreshes and leave optimistic edits in place
    if (pending.current) return
    const current = ++sequence.current
    try {
      const nextReleases = await request('releases')
      if (current !== sequence.current) return
      setReleases(nextReleases)
      setError('')
    } catch {
      if (current === sequence.current) setError('Could not load releases. Try again.')
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

  async function save(release, patch) {
    // 1. Apply immediately and invalidate outstanding refreshes
    if (pending.current) return
    pending.current = true
    sequence.current++
    setSaving(release.id)
    setError('')
    setReleases(list => list.map(item => item.id === release.id ? { ...item, ...patch } : item))

    // 2. Keep the server response, or undo and explain the failure
    try {
      const updated = await request('releases/' + release.id, patch)
      setReleases(list => list.map(item => item.id === release.id ? updated : item))
    } catch {
      setReleases(list => list.map(item => item.id === release.id ? release : item))
      setError('Could not save release ' + release.id + '. Your change was undone.')
    } finally {
      pending.current = false
      setSaving(null)
    }
  }

  const visible = releases?.filter(release => release.channel === channel)
    .sort((a, b) => b.created - a.created || b.id - a.id)

  return <>
    <ChannelTabs channel={channel} onChange={setChannel} />
    {error && <div class={styles.error} role="alert">
      <p>{error}</p>
      <Button disabled={saving !== null} onClick={refresh}>Refresh</Button>
    </div>}
    <section id="releases-panel" role="tabpanel" aria-labelledby={channel + '-tab'} tabIndex="0">
      {releases === null ? !error && <p class={styles.message} role="status">Loading releases…</p>
        : visible.length ? <div class={styles.list}>
          {visible.map(release => <ReleaseCard key={release.id} release={release} busy={saving !== null} saving={saving === release.id} onSave={patch => save(release, patch)} />)}
        </div> : <div class={styles.empty}>
          <h2 class={styles.emptyTitle}>No releases yet</h2>
          <p class={styles.subtitle}>Publish your first {channel} release.</p>
          <code class={styles.command}>npx appmachine publish{channel === 'beta' ? ' --channel beta' : ''}</code>
        </div>}
    </section>
  </>
}
