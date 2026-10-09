function findBrokenImageSources(images) {
  return images.flatMap((image) => {
    if (!image.source) {
      if (image.inactiveSampleLightboxPlaceholder === true) return [];
      return [`missing-src:${image.descriptor || 'img'}`];
    }
    if (image.complete && image.naturalWidth > 0) return [];
    return [image.source];
  });
}

function readbackResponseHeaders(headers) {
  const allowed = [
    'age', 'cache-control', 'cf-cache-status', 'cf-ray', 'cf-mitigated',
    'content-type', 'date', 'retry-after', 'server', 'via',
    'x-cache', 'x-served-by', 'x-github-request-id',
  ];
  return Object.fromEntries(allowed.flatMap((name) => {
    const value = headers[name];
    return value === undefined ? [] : [[name, String(value).slice(0, 2048)]];
  }));
}

// Retry only transient HTTP server responses to the SAME public GET URL.
// Authentication, throttling, wrong content and navigation errors remain failures.
async function navigatePublicPage({
  url, expectedStatus, navigate, observe = async () => {},
  sleeper = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => performance.now(),
}) {
  const requested = new URL(url);
  if (requested.origin !== 'https://auxtho.com') throw new Error('HOLD: browser readback origin is not exact');
  const deadline = now() + 25_000;
  const observations = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const remaining = deadline - now();
    if (remaining <= 0) break;
    let response;
    let observation;
    try {
      response = await navigate(requested.href, {
        waitUntil: 'networkidle', timeout: Math.ceil(remaining),
      });
      if (!response) throw new Error('navigation returned no response');
      observation = {
        attempt, requested_url: requested.href, final_url: response.url(),
        expected_status: expectedStatus, status: response.status(),
        headers: readbackResponseHeaders(await response.allHeaders()),
      };
    } catch (error) {
      observation = { attempt, requested_url: requested.href, error: String(error.message || error) };
      observations.push(observation);
      await observe(observation, response);
      const failure = new Error(`HOLD: browser navigation failed for ${requested.href}: ${observation.error}`);
      failure.readbackObservations = observations;
      throw failure;
    }
    observations.push(observation);
    await observe(observation, response);
    const exactOrigin = new URL(observation.final_url).origin === requested.origin;
    if (exactOrigin && observation.status === expectedStatus && now() < deadline) {
      return { response, observations };
    }
    if (!exactOrigin || ![502, 503, 504].includes(observation.status) || attempt === 3) break;
    const delay = attempt === 1 ? 1000 : 3000;
    if (now() + delay >= deadline) break;
    await sleeper(delay);
  }
  const last = observations.at(-1);
  const failure = new Error(`HOLD: browser readback ${requested.href} expected HTTP ${expectedStatus}, received ${last?.status ?? 'no timely response'} after ${observations.length} attempt(s)`);
  failure.readbackObservations = observations;
  throw failure;
}

module.exports = { findBrokenImageSources, navigatePublicPage, readbackResponseHeaders };
