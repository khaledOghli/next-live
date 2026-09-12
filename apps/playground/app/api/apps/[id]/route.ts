import { NextResponse } from 'next/server';
import { precompile } from 'next-live/server';
import { getApp } from '@/lib/apps';

/** Precompiled output, keyed by content hash. Survives across requests. */
const cache = new Map<string, { code: string; linePrefixOffset: number; expression: boolean }>();

/**
 * Serves one sub-app's source, the way a real control panel would.
 *
 * With `?precompile=1` the transpiling happens here instead of in the browser
 * and the result is cached by content hash — so a hundred users opening the
 * same app compile it once, and none of them download Sucrase.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const app = getApp(id);

  if (!app) {
    return NextResponse.json({ error: `No app with id '${id}'` }, { status: 404 });
  }

  const wantsPrecompiled = new URL(request.url).searchParams.get('precompile') === '1';
  if (!wantsPrecompiled) {
    return NextResponse.json({ id: app.id, name: app.name, source: app.source });
  }

  try {
    const result = precompile(app.source, { filePath: `${app.id}.tsx` });
    const cached = cache.get(result.hash);
    if (!cached) {
      cache.set(result.hash, {
        code: result.code,
        linePrefixOffset: result.linePrefixOffset,
        expression: result.expression,
      });
    }

    return NextResponse.json(
      {
        id: app.id,
        name: app.name,
        source: app.source,
        compiled: cache.get(result.hash),
        hash: result.hash,
        cacheHit: Boolean(cached),
      },
      { headers: { ETag: `"${result.hash}"` } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 422 },
    );
  }
}
