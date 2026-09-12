import { NextResponse } from 'next/server';
import { storeScriptSource } from '@/lib/store-script';

export async function GET() {
  return NextResponse.json({ source: storeScriptSource });
}
