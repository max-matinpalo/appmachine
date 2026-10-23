import { useEffect, useState } from 'preact/hooks'
import { Button } from '../ui/Button.jsx'
import styles from './RolloutForm.module.css'

export function RolloutForm({ release, disabled, onSave }) {
  const [value, setValue] = useState(String(release.rollout))
  useEffect(() => setValue(String(release.rollout)), [release.rollout])
  const valid = /^\d+$/.test(value) && Number(value) <= 100

  return <form class={styles.form} onSubmit={event => {
    event.preventDefault()
    if (valid && !disabled && Number(value) !== release.rollout) onSave({ rollout: Number(value) })
  }}>
    <label class={styles.label} for={'rollout-' + release.id}>Rollout %</label>
    <div class={styles.controls}>
      <input
        class={styles.input}
        id={'rollout-' + release.id}
        aria-label={'Rollout for release ' + release.id}
        type="number"
        inputMode="numeric"
        min="0"
        max="100"
        step="1"
        required
        value={value}
        disabled={disabled}
        onInput={event => setValue(event.currentTarget.value)}
      />
      <Button type="submit" disabled={disabled || !valid || Number(value) === release.rollout}>Set rollout</Button>
    </div>
  </form>
}
