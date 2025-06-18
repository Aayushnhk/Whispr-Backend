// app/api/users/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import connect from '@/lib/db/connect';
import User, { IUser } from '@/models/User';
import { verifyToken } from '@/lib/auth';
import { corsMiddleware, handleOptions } from '@/lib/cors';

interface DecodedToken {
 userId: string;
}

export async function OPTIONS(req: NextRequest) {
 return handleOptions();
}

export async function GET(request: NextRequest) {
 await connect();

 // Extract userId from req.nextUrl.pathname
 const userId = request.nextUrl.pathname.split('/').pop();
 if (!userId) {
 const response = NextResponse.json({ message: 'User ID is required' }, { status: 400 });
 return corsMiddleware(request, response);
 }

 try {
 const token = request.headers.get('authorization')?.split(' ')[1];
 if (!token) {
 const response = NextResponse.json({ message: 'Authentication required' }, { status: 401 });
 return corsMiddleware(request, response);
 }
 const decoded = verifyToken(token) as DecodedToken | null;
 if (!decoded) {
 const response = NextResponse.json({ message: 'Invalid token' }, { status: 401 });
 return corsMiddleware(request, response);
 }

 const user = await User.findById(userId).select('-password') as IUser | null;

 if (!user) {
 const response = NextResponse.json({ message: 'User not found' }, { status: 404 });
 return corsMiddleware(request, response);
 }

 const response = NextResponse.json({ user }, { status: 200 });
 return corsMiddleware(request, response);
 } catch (error: unknown) {
 console.error('Error fetching user profile:', error);
 const response = NextResponse.json({ message: 'Internal server error' }, { status: 500 });
 return corsMiddleware(request, response);
 }
}