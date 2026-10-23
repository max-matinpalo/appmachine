// Turns a User-Agent and client hints into readable device, system and browser names.
const find = (agent, pattern) => agent.match(pattern)?.[1]?.replace(/_/g, '.') || '';

export function describe(agent, model, platform) {

  // 1. Name the device and its system.
  const apple = find(agent, /\b(iPhone|iPad|iPod)\b/);
  const android = find(agent, /Android (\d+(?:\.\d+)*)/);
  const major = Number(platform.split('.')[0]);
  let device = model, system = '';
  if (apple) {
    device ||= apple;
    system = `${apple === 'iPad' ? 'iPadOS' : 'iOS'} ${find(agent, / OS (\d+(?:_\d+)*)/)}`.trim();
  } else if (android || /Android/.test(agent)) {
    const named = find(agent, /Android[^;)]*; ([^;)]+?)(?: Build\/[^;)]*)?\)/);
    device ||= named && named !== 'K' ? named : 'Android phone';
    system = `Android ${platform || android}`.trim();
  } else if (/Windows NT/.test(agent)) {
    device ||= 'PC';
    system = !platform ? 'Windows' : major >= 13 ? 'Windows 11' : 'Windows 10';
  } else if (/Macintosh/.test(agent)) {
    device ||= 'Mac';
    system = `macOS ${platform}`.trim();
  } else if (/CrOS/.test(agent)) {
    device ||= 'Chromebook';
    system = 'ChromeOS';
  } else if (/Linux/.test(agent)) {
    device ||= 'PC';
    system = 'Linux';
  }

  // 2. Name the browser; brands that embed "Chrome" or "Safari" come first.
  const browsers = [['Edge', /Edg(?:A|iOS)?\/(\d+)/], ['Samsung Internet', /SamsungBrowser\/(\d+(?:\.\d+)?)/], ['Opera', /OPR\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/], ['Chrome', /(?:CriOS|Chrome)\/(\d+)/], ['Safari', /Version\/(\d+(?:\.\d+)?).*Safari/]];
  const [name, pattern] = browsers.find(([, pattern]) => pattern.test(agent)) || [apple ? 'Safari' : '', /$^/];
  const browser = `${name} ${find(agent, pattern)}`.trim();
  return { device: device || 'Unknown', system, browser };
}
