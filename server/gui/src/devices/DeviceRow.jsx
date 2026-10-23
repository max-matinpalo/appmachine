import styles from './DeviceRow.module.css'

const regions = new Intl.DisplayNames(undefined, { type: 'region' })
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const unknown = <span class={styles.unknown}>Unknown</span>

function country(code) {
  try { return /^[A-Z]{2}$/.test(code) && code !== 'XX' ? regions.of(code) : '' } catch { return '' }
}

function ago(time) {
  const seconds = Math.round((time - Date.now()) / 1000)
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'Just now'
}

function Cell({ label, value, caption, children }) {
  return <td class={styles.cell} data-label={label}>
    <span class={styles.value}>{value || unknown}</span>
    {children}
    {caption && <span class={styles.caption}>{caption}</span>}
  </td>
}

export function DeviceRow({ device }) {
  const [, width, height, ratio] = device.screen.match(/^(\d+)x(\d+)@([\d.]+)$/) || []
  const hardware = [device.cores && device.cores + ' cores', device.memory && device.memory + ' GB RAM'].filter(Boolean).join(' · ')
  const last = new Date(device.last)

  return <tr class={styles.row}>
    <th class={styles.device} scope="row">
      <span class={styles.name}>{device.device}</span>
      <code class={styles.caption} title={device.id}>{device.id.slice(0, 8)}</code>
    </th>
    <Cell label="System" value={device.system} />
    <Cell label="Browser" value={device.browser} />
    <Cell label="Screen" value={width && width + ' × ' + height} caption={ratio && '@' + ratio + 'x'} />
    <Cell label="Hardware" value={hardware} />
    <Cell label="Opened from" value={device.standalone ? 'Home Screen' : 'Browser'} caption={device.installed && !device.standalone && 'Also installed'} />
    <Cell label="Country" value={country(device.country)} caption={device.language} />
    <Cell label="Version" value={device.running ? 'Release ' + device.running : 'From network'}
      caption={device.staged && 'Release ' + device.staged + ' on next launch'}>
      {device.channel === 'beta' && <span class={styles.badge}>Beta</span>}
    </Cell>
    <td class={styles.cell} data-label="Last seen">
      <time class={styles.value} dateTime={last.toISOString()} title={last.toLocaleString()}>{ago(device.last)}</time>
      <span class={styles.caption}>Since {new Date(device.first).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
    </td>
  </tr>
}
