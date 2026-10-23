// checkLayout: finds common layout bugs in a page part at every viewport.
// Copied into projects' test/ folders; needs only a Playwright page.

export const VIEWPORTS = [[320, 568], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]]

const FREEZE = '*,*::before,*::after{transition:none!important;animation:none!important}'
const settle = () => document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))

// Returns issues like `320,390 · p "Long title" · clipped by div.card (12px)`; [] means clean.
// scope: CSS selector or Playwright locator. ignore: selectors of intended exceptions.
export async function checkLayout(page, scope = 'body', { ignore = [], viewports = VIEWPORTS } = {}) {
  const start = page.viewportSize()
  const style = await page.addStyleTag({ content: FREEZE })
  const found = new Map()
  let visible = false
  try {
    for (const [width, height] of viewports) {
      // 1. Resize and let the layout settle
      await page.setViewportSize({ width, height })
      await page.evaluate(settle)
      // 2. Measure in the browser
      const root = typeof scope === 'string' ? scope : (await scope.count()) ? await scope.first().elementHandle() : null
      const issues = root && (await page.evaluate(measure, { root, ignore }))
      if (!issues) continue
      visible = true
      // 3. Merge the same issue across widths
      for (const [where, kind, detail] of issues) {
        const key = where + kind
        if (!found.has(key)) found.set(key, { widths: [], text: `${where} · ${kind}${detail}` })
        found.get(key).widths.push(width)
      }
    }
  } finally {
    await style.evaluate(s => s.remove())
    if (start) await page.setViewportSize(start)
  }
  if (!visible) throw new Error(`checkLayout: ${scope} is not visible at any viewport`)
  return [...found.values()].map(f => `${f.widths.join(',')} · ${f.text}`)
}

// Runs in the browser: returns [where, kind, detail] issues, or null when root is hidden.
function measure({ root, ignore }) {
  // 1. Helpers
  root = typeof root === 'string' ? document.querySelector(root) : root
  if (!root?.checkVisibility()) return null
  const W = innerWidth, H = innerHeight, out = [], keys = new Set(), styles = new Map()
  const css = el => styles.get(el) || styles.set(el, getComputedStyle(el)).get(el)
  const shown = el => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && !ignore.some(s => el.closest(s))
  const name = el => el.localName + (el.id ? '#' + el.id : el.classList[0] ? '.' + el.classList[0] : '')
  const label = el => {
    const t = (el.localName === 'img' ? el.alt || el.src.split('/').pop() : el.textContent).trim().replace(/\s+/g, ' ')
    return name(el) + (t ? ` "${t.length > 30 ? t.slice(0, 30) + '…' : t}"` : '')
  }
  const add = (el, kind, detail = '') => {
    const where = label(el)
    if (keys.has(where + kind)) return
    keys.add(where + kind)
    out.push([where, kind, detail])
  }
  const px = n => ` (${Math.round(n)}px)`
  const range = document.createRange()
  const rectsOf = node => (range.selectNodeContents(node), [...range.getClientRects()].filter(r => r.width && r.height))
  const boundsOf = node => (range.selectNodeContents(node), range.getBoundingClientRect())
  const boxed = el => {
    const s = css(el)
    return !/^transparent$|, 0\)$/.test(s.backgroundColor) || s.backgroundImage !== 'none' || s.boxShadow !== 'none' ||
      parseFloat(s.borderTopWidth) + parseFloat(s.borderRightWidth) + parseFloat(s.borderBottomWidth) + parseFloat(s.borderLeftWidth) > 0
  }
  const replaced = el => /^(img|svg|video|canvas|input|select|textarea|button|iframe)$/.test(el.localName)
  const layer = (el, re) => { for (let a = el; a; a = a.parentElement) if (re.test(css(a).position)) return true }
  const scrolls = v => v === 'auto' || v === 'scroll'

  // 2. Collect visible elements and text in scope
  const els = [root, ...root.querySelectorAll('*')].filter(shown), isShown = new Set(els)
  const texts = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const t = walker.currentNode, p = t.parentElement
    if (t.data.trim() && isShown.has(p) && !/^(option|textarea)$/.test(p.localName) && rectsOf(t).length) texts.push(t)
  }
  const leaves = els.filter(el => replaced(el) && !el.parentElement.closest('svg'))
  const html = document.documentElement, view = css(html).overflowX === 'visible' ? css(document.body) : css(html)
  const pageScrollsX = html.scrollWidth > W + 1 && !/hidden|clip/.test(view.overflowX)

  // 3. Clipped by a box or the screen: 'cut' when reported, false when hidden or scrolled by design
  function clipCheck(node, r, tolY) {
    const el = node.nodeType === 3 ? node.parentElement : node
    if (r.right <= 0 || r.left >= W) return false
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = css(a)
      if (a === node || (s.overflowX === 'visible' && s.overflowY === 'visible')) continue
      if (a.clientWidth <= 2 || a.clientHeight <= 2) return false
      const b = a.getBoundingClientRect(), left = b.left + a.clientLeft, top = b.top + a.clientTop
      const right = left + a.clientWidth, bottom = top + a.clientHeight
      if (r.right <= left || r.left >= right || r.bottom <= top || r.top >= bottom) return false
      const overX = Math.max(left - r.left, r.right - right), overY = Math.max(top - r.top, r.bottom - bottom)
      if (overX <= 1 && overY <= tolY) continue
      if ((overX > 1 && scrolls(s.overflowX)) || (overY > tolY && scrolls(s.overflowY))) return false
      // Truncated on purpose: still visible text, not a bug
      if (s.textOverflow === 'ellipsis' || /^\d/.test(s.getPropertyValue('-webkit-line-clamp'))) return 'truncated'
      return add(el, `clipped by ${name(a)}`, px(Math.max(overX, overY))), 'cut'
    }
    const overX = Math.max(-r.left, pageScrollsX ? 0 : r.right - W)
    if (overX > 1) return add(el, 'cut off by the screen edge', px(overX)), 'cut'
    let f = el
    while (f && css(f).position !== 'fixed') f = f.parentElement
    const fr = f?.getBoundingClientRect()
    if (f && fr.top < H && fr.bottom > 0 && (r.top < -1 || r.bottom > H + 1))
      return add(el, 'off screen in a fixed layer, cannot scroll to it'), 'cut'
    return true
  }

  // 4. Text spilling out of its block or the nearest visible box
  function spillCheck(t, r, tolY) {
    let first = true
    for (let a = t.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = css(a)
      if (s.display === 'inline' || s.display === 'contents') continue
      const isBox = boxed(a)
      if (first || isBox) {
        const b = a.getBoundingClientRect()
        const overX = Math.max(b.left - r.left, r.right - b.right), overY = Math.max(b.top - r.top, r.bottom - b.bottom)
        if (overX > 1 || overY > tolY) return add(t.parentElement, `text spills out of ${name(a)}`, px(Math.max(overX, overY)))
      }
      if (isBox || /absolute|fixed/.test(s.position)) return
      first = false
    }
  }

  const seen = [], hasText = new Set()
  for (const t of texts) {
    const tolY = parseFloat(css(t.parentElement).fontSize) * 0.25 + 1, r = boundsOf(t), clip = clipCheck(t, r, tolY)
    if (clip === true) seen.push(t), spillCheck(t, r, tolY)
    if (clip) for (let a = t.parentElement; a && !hasText.has(a); a = a.parentElement) hasText.add(a)
  }
  leaves.forEach(el => clipCheck(el, el.getBoundingClientRect(), 1))

  // 5. Elements that make the page scroll sideways
  if (pageScrollsX) {
    const clipsX = el => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (css(a).overflowX !== 'visible') return true }
    const wide = new Set(els.filter(el => el.getBoundingClientRect().right > W + 1 && !layer(el, /fixed/) && !clipsX(el)))
    const causes = [...wide].filter(el => el === root || !wide.has(el.parentElement))
    causes.forEach(el => add(el, 'makes the page scroll sideways', px(el.getBoundingClientRect().right - W)))
    if (!causes.length && root === document.body) add(root, 'page scrolls sideways', px(document.documentElement.scrollWidth - W))
  }

  // 6. Icons: centered when alone in a box, aligned with the text beside them
  const iconCount = new Map(), leafCount = new Map()
  leaves.forEach(l => { for (let a = l.parentElement; a; a = a.parentElement) leafCount.set(a, (leafCount.get(a) || 0) + 1) })
  const icons = els.filter(el => (el.localName === 'img' || (el.localName === 'svg' && !el.parentElement.closest('svg'))) &&
    el.getBoundingClientRect().width <= 48 && el.getBoundingClientRect().height <= 48)
  icons.forEach(i => { for (let a = i.parentElement; a; a = a.parentElement) iconCount.set(a, (iconCount.get(a) || 0) + 1) })
  const sibling = (node, dir) => { do node = node[dir]; while (node?.nodeType === 3 && !node.data.trim()); return node }
  for (const icon of icons) {
    const r = icon.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2
    for (let a = icon.parentElement; a && a !== document.body && !hasText.has(a) && leafCount.get(a) === 1; a = a.parentElement) {
      if (!a.matches('button,a,[role=button]') && !boxed(a)) continue
      const b = a.getBoundingClientRect(), dx = cx - b.left - b.width / 2, dy = cy - b.top - b.height / 2
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) add(a, 'icon off-center', ` (x ${Math.round(dx)}, y ${Math.round(dy)}px)`)
      break
    }
    for (const dir of ['previousSibling', 'nextSibling']) {
      const sib = sibling(icon, dir)
      if (!sib || !(sib.nodeType === 3 ? seen.includes(sib) : hasText.has(sib) && !iconCount.get(sib) && !/absolute|fixed/.test(css(sib).position))) continue
      const gap = l => dir === 'nextSibling' ? l.left - r.right : r.left - l.right
      const line = rectsOf(sib).find(l => gap(l) > -2 && gap(l) < 16 && l.top < r.bottom && l.bottom > r.top)
      const d = line && cy - (line.top + line.bottom) / 2
      if (Math.abs(d) > 1.5) add(icon.parentElement, 'icon not aligned with its text', ` (${Math.round(Math.abs(d))}px ${d > 0 ? 'low' : 'high'})`)
    }
  }

  // Symbol-only buttons ("+", "×") are icons too
  for (const t of seen) {
    const b = t.parentElement.closest('button,[role=button]')
    if (!b || !root.contains(b) || !/^[^\p{L}\p{N}]{1,2}$/u.test(b.textContent.trim())) continue
    const r = boundsOf(t), br = b.getBoundingClientRect()
    const dx = r.left + r.width / 2 - br.left - br.width / 2, dy = r.top + r.height / 2 - br.top - br.height / 2
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) add(b, 'icon off-center', ` (x ${Math.round(dx)}, y ${Math.round(dy)}px)`)
  }

  // 7. Short button labels that wrap
  for (const t of seen) {
    const b = t.parentElement.closest('button,[role=button],a')
    if (!b || !root.contains(b) || (b.localName === 'a' && !boxed(b)) || b.textContent.trim().length > 40) continue
    const lines = new Set(rectsOf(t).map(l => Math.round(l.top))).size
    if (lines > 1) add(b, 'label wraps', ` (${lines} lines)`)
  }

  // 8. Inputs and buttons side by side with different heights
  const controls = els.filter(el => el.matches('input:not([type=checkbox],[type=radio],[type=range],[type=hidden],[type=file]),select,button,[role=button]'))
  for (const i of controls.filter(el => /^(input|select)$/.test(el.localName))) {
    const r = i.getBoundingClientRect()
    for (const c of controls) {
      const o = c.getBoundingClientRect(), gap = Math.max(o.left - r.right, r.left - o.right)
      if (c !== i && gap >= -1 && gap <= 16 && o.top < r.bottom && o.bottom > r.top && Math.abs(o.height - r.height) > 1)
        add(i, `height differs from ${label(c)}`, ` (${Math.round(r.height)} vs ${Math.round(o.height)}px)`)
    }
  }

  // 9. Small tap targets on phones and tablets
  if (W <= 768) for (const el of els) {
    if (!el.matches('a[href],button,input:not([type=hidden],[type=checkbox],[type=radio]),select,textarea,summary,[role=button]')) continue
    if (el.localName === 'a' && css(el).display === 'inline') continue
    const r = el.getBoundingClientRect()
    if (r.width < 24 || r.height < 24) add(el, 'tap target under 24px', ` (${Math.round(r.width)}×${Math.round(r.height)}px)`)
  }

  // 10. Text touching the screen edge on phones
  if (W <= 390) for (const t of seen) {
    const gap = Math.min(...rectsOf(t).map(l => Math.min(l.left, W - l.right)))
    if (gap > -1 && gap < 8) add(t.parentElement, 'text too close to the screen edge', px(gap))
  }

  // 11. Broken or stretched images
  for (const img of els.filter(el => el.localName === 'img' && el.complete)) {
    const r = img.getBoundingClientRect()
    if (!img.naturalWidth) add(img, 'image failed to load')
    else if (css(img).objectFit === 'fill' && Math.abs((r.width / r.height) / (img.naturalWidth / img.naturalHeight) - 1) > 0.03)
      add(img, 'image stretched', ` (${Math.round(r.width)}×${Math.round(r.height)} for ${img.naturalWidth}×${img.naturalHeight})`)
  }

  // 12. Text covered by other elements, checked one screen at a time.
  // Fixed and sticky bars may cover text that scrolling can move out from under them.
  const y0 = scrollY, maxY = html.scrollHeight - H, rb = root.getBoundingClientRect(), end = rb.bottom + y0
  const pending = new Set(seen.filter(t => css(t.parentElement).pointerEvents !== 'none'))
  for (let y = Math.max(0, rb.top + y0); pending.size; y += H) {
    scrollTo({ top: y, behavior: 'instant' })
    for (const t of pending) {
      const lines = rectsOf(t)
      if (lines.some(l => l.top < 0 || l.bottom > H)) continue
      const p = t.parentElement, inBar = layer(p, /fixed|sticky/)
      let later = false
      covered: for (const l of lines) for (const x of [l.left + 2, (l.left + l.right) / 2, l.right - 2]) {
        const yy = (l.top + l.bottom) / 2
        for (const hit of document.elementsFromPoint(x, yy)) {
          if (hit === p || p.contains(hit) || hit.contains(p)) break
          if (!hit.checkVisibility({ opacityProperty: true })) continue
          const textHere = [...hit.childNodes].some(n => n.nodeType === 3 && n.data.trim() &&
            rectsOf(n).some(q => x >= q.left && x <= q.right && yy >= q.top && yy <= q.bottom))
          if (!boxed(hit) && !replaced(hit) && !textHere) continue
          const h = hit.getBoundingClientRect()
          if (!inBar && layer(hit, /fixed|sticky/) && ((h.top + h.bottom) / 2 < H / 2 ? scrollY > 0 : scrollY < maxY - 1)) {
            later = true
            break
          }
          add(p, `covered by ${label(hit)}`)
          later = false
          break covered
        }
      }
      if (!later) pending.delete(t)
    }
    if (y + H >= end || scrollY < y - 1) break
  }
  scrollTo({ top: y0, behavior: 'instant' })
  return out
}
