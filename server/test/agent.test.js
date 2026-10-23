import { expect, test } from 'bun:test';
import { describe as name } from '../src/Utils/agent.js';

test('names devices, systems and browsers from User-Agents and client hints', () => {
  const cases = [
    ['Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1', '', '', ['iPad', 'iPadOS 17.4', 'Chrome 141']],
    ['Mozilla/5.0 (Linux; Android 13; SM-S918B Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36', '', '', ['SM-S918B', 'Android 13', 'Samsung Internet 23.0']],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0', '', '15.0.0', ['PC', 'Windows 11', 'Edge 141']],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0', '', '', ['PC', 'Windows', 'Firefox 132']],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15', '', '', ['Mac', 'macOS', 'Safari 26.0']],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', '', '', ['Chromebook', 'ChromeOS', 'Chrome 141']],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', '', '', ['iPhone', 'iOS 18.6', 'Safari']],
    ['curl/8.5.0', '', '', ['Unknown', '', '']],
  ];
  for (const [agent, model, platform, [device, system, browser]] of cases) expect(name(agent, model, platform)).toEqual({ device, system, browser });
});
