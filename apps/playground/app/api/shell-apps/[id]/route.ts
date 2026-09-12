import { NextResponse } from 'next/server';
import { getShellApp } from '@/lib/shell-apps';

/** Serves one shell demo app's source - the production-shaped /apps route. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const app = getShellApp(id);

  if (!app) {
    return NextResponse.json({ error: `No shell app with id '${id}'` }, { status: 404 });
  }

  return NextResponse.json({ id: app.id, name: app.name, source: app.source });
}
