export async function request(path, body) {
  const response = await fetch('/api/' + path, {
    cache: 'no-store',
    ...(body && {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  })
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  return response.json()
}
