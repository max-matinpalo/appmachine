import styles from './ChannelTabs.module.css'

export function ChannelTabs({ channel, onChange }) {
  return <div class={styles.tabs} role="tablist" aria-label="Release channel">
    {['production', 'beta'].map(value => <button
      key={value}
      id={value + '-tab'}
      class={styles.tab}
      type="button"
      role="tab"
      aria-selected={channel === value}
      aria-controls="releases-panel"
      tabIndex={channel === value ? 0 : -1}
      onClick={() => onChange(value)}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? 'production' : event.key === 'End' ? 'beta' : channel === 'production' ? 'beta' : 'production'
        onChange(next)
        document.getElementById(next + '-tab').focus()
      }}
    >{value === 'production' ? 'Production' : 'Beta'}</button>)}
  </div>
}
