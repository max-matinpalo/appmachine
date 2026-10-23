// Docs: how AppMachine works, from one publish to every device.
import styles from './Docs.module.css'

export function Docs({ app }) {
  const id = app?.id || '<app>'
  return <article class={styles.docs} aria-label="How it works">
    <section>
      <h2>How it works</h2>
      <p>One web app runs everywhere: in the browser (PWA), and inside the Android and iOS apps. A publish sends a new web version to all of them; no store review needed for web changes.</p>
      <ol>
        <li><b>Publish</b> builds the web app, signs its file list and uploads only changed files.</li>
        <li><b>Devices check</b> for the newest release of their channel and download the changed files in the background.</li>
        <li><b>Verify</b>: the device checks the signature; a tampered bundle is never used.</li>
        <li><b>Next launch</b> starts the new version as a trial; it is kept once it reports ready.</li>
        <li><b>Failure</b> (crash or hang before ready): the device goes back to the last working version and reports it failed.</li>
      </ol>
    </section>

    <section>
      <h2>Channels</h2>
      <table class={styles.table}>
        <thead><tr><th>Channel</th><th>Address</th><th>Gets releases from</th></tr></thead>
        <tbody>
          <tr><td>Production</td><td><code>https://{id}.maxapp.dev</code></td><td>Tag <code>web</code>, or <code>npx appmachine publish</code></td></tr>
          <tr><td>Beta</td><td><code>https://{id}-beta.maxapp.dev</code></td><td>Tag <code>webdev</code>, or <code>npx appmachine publish --channel beta</code></td></tr>
        </tbody>
      </table>
      <p>Development app builds use Beta, Production builds use Production; a PWA by its address.</p>
    </section>

    <section>
      <h2>Publish</h2>
      <pre class={styles.code}>npx appmachine publish [--channel beta] [--rollout 0–100] [--dir dist]</pre>
      <p>Needs <code>OTA_PRIVATE_KEY</code>, <code>CF_ACCESS_CLIENT_ID</code> and <code>CF_ACCESS_CLIENT_SECRET</code> in the environment (GitHub secrets for the tag builds).</p>
    </section>

    <section>
      <h2>Controls</h2>
      <dl class={styles.terms}>
        <dt>Rollout</dt><dd>Share of devices that get the release. Raising it only adds devices.</dd>
        <dt>Pause</dt><dd>Devices without the release stop getting it; devices with it keep it.</dd>
        <dt>Resume</dt><dd>A paused release is offered again.</dd>
        <dt>Rollback</dt><dd>Devices switch back to the previous release on their next launch.</dd>
      </dl>
      <p>Each release shows how many devices downloaded it, run it, or failed with it.</p>
    </section>

    <section>
      <h2>Devices</h2>
      <p>Every device that checked for updates: model, system, browser, release it runs, channel and when it was last seen. A device is a random ID; no personal data.</p>
    </section>

    <section>
      <h2>Status</h2>
      <ul>
        <li>Live: PWA updates, this Admin, publish from the command line.</li>
        <li>Android app shell builds and loads the web app from its channel's address.</li>
        <li>Not yet: updates inside the Android and iOS apps (they load the live address for now), crash reports, backups.</li>
      </ul>
    </section>
  </article>
}
