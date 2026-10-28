import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the startup ORDER of the stack, and the one string that order rests on.
 *
 * WHY THIS EXISTS
 * `web` waits for `api` to report HEALTHY before it starts. Before that it
 * waited only for the api container to have been STARTED, which is true long
 * before Nest has bound :4000 — Next is ready in about 200ms and server-renders
 * immediately, so it won that race nearly every time and the first request
 * after every deploy died with:
 *
 *     [TypeError: fetch failed] ... connect ECONNREFUSED 172.x.x.x:4000
 *
 * `apiFetch` deliberately throws on an unreachable API rather than rendering
 * empty data, so what the reader got was an error page on a stack that was
 * seconds away from being fine — and the deploy's own health check, which
 * fetches /ar, could fail on it too.
 *
 * WHAT CAN SILENTLY UNDO THE FIX
 * `condition: service_healthy` against a service with no healthcheck does not
 * error. Compose simply does not wait, and the race comes back exactly as it
 * was, with nothing in any log to say why. So the probe is spelled out in BOTH
 * compose files rather than inherited from the image by omitting `test:`, and
 * this suite asserts all three copies — the two compose files and
 * apps/api/Dockerfile — are still the same command. Three copies of a string
 * is the kind of thing that rots; this is the smoke alarm for it.
 *
 * It reads files instead of importing anything, so it needs no YAML parser and
 * no Docker, and runs in milliseconds as part of the ordinary suite.
 */

const REPO = join(__dirname, '..', '..', '..');

const FILES = {
  dockerfile: 'apps/api/Dockerfile',
  dev: 'docker-compose.yml',
  prod: 'docker-compose.prod.yml',
} as const;

function read(relative: string): string {
  return readFileSync(join(REPO, relative), 'utf8');
}

/**
 * The health probe command, normalised.
 *
 * The three copies live in different syntaxes — a Dockerfile `HEALTHCHECK CMD`
 * line and two YAML list items — so a plain string compare would fail on
 * quoting and indentation rather than on drift. Matching from `require(` to the
 * final `)` and stripping all whitespace compares the COMMAND and nothing else.
 */
function probe(source: string): string[] {
  const matches = source.match(/require\('node:http'\).*?process\.exit\(1\)\)/gs) ?? [];
  return matches.map((match) => match.replace(/\s+/g, ''));
}

describe('deploy startup order', () => {
  it('defines the api health probe in all three places, identically', () => {
    const found = Object.entries(FILES).map(([name, relative]) => {
      const probes = probe(read(relative));
      expect(probes).toHaveLength(1);
      return [name, probes[0]] as const;
    });

    const distinct = new Set(found.map(([, command]) => command));
    expect(distinct.size).toBe(1);
  });

  it('hits the health route on the api port', () => {
    // Not a tautology against the line above: that one only proves the three
    // copies agree, which they would also do if all three were wrong together.
    const [command] = probe(read(FILES.dockerfile));

    expect(command).toContain('/api/v1/health');
    expect(command).toContain('API_PORT||4000');
    expect(command).toContain('statusCode===200');
  });

  it.each([
    ['dev', FILES.dev],
    ['prod', FILES.prod],
  ])('makes web wait for a HEALTHY api in %s', (_name, relative) => {
    const source = read(relative);

    // The `api:` key under a `depends_on:`, and whatever condition follows it.
    // Deliberately narrow: it must be the keyed long form, because the short
    // form (`depends_on: [api]`) means service_started and is the bug.
    const conditions = [
      ...source.matchAll(
        /depends_on:[\s\S]{0,800}?\n\s+api:\s*\n(?:\s*#[^\n]*\n)*\s+condition:\s*(\S+)/g,
      ),
    ].map((match) => match[1]);

    expect(conditions).toEqual(['service_healthy']);
  });

  it.each([
    ['dev', FILES.dev],
    ['prod', FILES.prod],
  ])('gives the api service a healthcheck of its own in %s', (_name, relative) => {
    // Without this, the `service_healthy` above is a no-op that waits for
    // nothing. Asserted by position: the api service block must contain a
    // `healthcheck:` key before the next top-level service begins.
    const source = read(relative);
    const apiBlock = source.match(
      /\n {2}api:\n([\s\S]*?)(?=\n {2}[a-z][a-z-]*:\n|\nvolumes:|\nnetworks:|$)/,
    );

    expect(apiBlock).not.toBeNull();
    expect(apiBlock?.[1]).toContain('healthcheck:');
  });
});
