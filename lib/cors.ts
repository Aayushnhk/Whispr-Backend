import { NextRequest, NextResponse } from 'next/server';

const allowedOrigins = ['https://whispr-o7.vercel.app', 'http://localhost:4000'];

export function corsMiddleware(req: NextRequest, response: NextResponse = NextResponse.next()) {
  const origin = req.headers.get('origin');
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  } else {
    response.headers.set('Access-Control-Allow-Origin', 'https://whispr-o7.vercel.app');
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  console.log(`CORS: Origin=${origin}, Allowed=${response.headers.get('Access-Control-Allow-Origin')}`);
  return response;
}

export async function handleOptions() {
  const response = NextResponse.json({}, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', allowedOrigins[0]);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}