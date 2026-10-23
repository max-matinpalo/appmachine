import { Button } from '../ui/Button.jsx'
import { RolloutForm } from './RolloutForm.jsx'
import styles from './ReleaseCard.module.css'

export function ReleaseCard({ release, busy, saving, onSave }) {
  const rolledBack = release.state === 'rolledback'
  const date = new Date(release.created)

  return <article class={styles.card} aria-label={'Release ' + release.id} aria-busy={saving}>
    <div class={styles.details}>
      <div class={styles.identity}>
        <h2 class={styles.title}>Release {release.id}</h2>
        <span class={styles.state}>{rolledBack ? 'Rolled back' : release.state === 'paused' ? 'Paused' : 'Live'}</span>
        <span class={styles.rollout}>{release.rollout}% rollout</span>
      </div>
      <div class={styles.meta}>
        <code class={styles.commit} title={release.commit}>{release.commit.slice(0, 7)}</code>
        <time dateTime={date.toISOString()}>{date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>
      </div>
    </div>
    <dl class={styles.counts}>
      {['downloaded', 'active', 'failed'].map(key => <div key={key} class={styles.metric}>
        <dt class={styles.caption}>{key[0].toUpperCase() + key.slice(1)}</dt>
        <dd class={styles.count}>{release[key].toLocaleString()}</dd>
      </div>)}
    </dl>
    <div class={styles.actions}>
      <RolloutForm release={release} disabled={busy || rolledBack} onSave={onSave} />
      <div class={styles.buttons}>
        <Button disabled={busy || rolledBack} onClick={() => onSave({ state: release.state === 'paused' ? 'live' : 'paused' })}>
          {release.state === 'paused' ? 'Resume' : 'Pause'}
        </Button>
        <Button disabled={busy || rolledBack} onClick={() => {
          if (window.confirm('Roll back release ' + release.id + '? Devices will switch to the previous release on next launch.')) onSave({ state: 'rolledback' })
        }}>Rollback</Button>
      </div>
      {saving && <span class={styles.saving} role="status">Saving…</span>}
    </div>
  </article>
}
