// WHISPR-BACKEND/app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import User, { IUser } from '@/models/User';
import mongoose from 'mongoose';
import { verifyToken } from '@/lib/auth';
import { corsMiddleware, handleOptions } from '@/lib/cors';

interface DecodedToken {
  userId: string;
}

interface UsersRequest {
  userIds: string[];
}

interface UserResponse {
  id: string;
  firstName: string;
  lastName: string;
  profilePicture: string;
}

// FIX: Removed 'request: NextRequest' as it's unused when calling handleOptions()
export async function OPTIONS() {
  return handleOptions();
}

// Your GET handler
export async function GET(req: NextRequest) {
  console.log('API/users: Incoming GET request.');
  await dbConnect();

  const userId = req.nextUrl.searchParams.get('userId');

  if (!userId) {
    const response = NextResponse.json({ message: 'User ID query parameter is required' }, { status: 400 });
    return corsMiddleware(req, response);
  }

  const authorizationHeader = req.headers.get('Authorization');
  const token = authorizationHeader?.split(' ')[1];

  if (!token) {
    console.warn('API/users: Authentication token not provided.');
    const response = NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    return corsMiddleware(req, response);
  }

  const decodedToken = verifyToken(token) as DecodedToken | null;
  if (!decodedToken || !decodedToken.userId) {
    console.warn('API/users: Invalid or expired token, or missing userId in token.');
    const response = NextResponse.json({ message: 'Invalid or expired token' }, { status: 401 });
    return corsMiddleware(req, response);
  }

  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.warn('API/users: Invalid MongoDB ObjectId format for userId:', userId);
      const response = NextResponse.json({ message: 'Invalid user ID format provided' }, { status: 400 });
      return corsMiddleware(req, response);
    }

    console.log('API/users: Fetching details for user ID:', userId);
    const user = await User.findById(userId)
      .select('_id firstName lastName profilePicture')
      .lean() as Pick<IUser, '_id' | 'firstName' | 'lastName' | 'profilePicture'> | null;

    if (!user) {
      console.warn('API/users: User not found for ID:', userId);
      const response = NextResponse.json({ message: 'User not found' }, { status: 404 });
      return corsMiddleware(req, response);
    }

    console.log(`API/users: Successfully fetched user details for ${user.firstName} ${user.lastName}.`);
    const formattedUser: UserResponse = {
      id: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      profilePicture: user.profilePicture || '',
    };

    const response = NextResponse.json({ user: formattedUser }, { status: 200 });
    return corsMiddleware(req, response);

  } catch (error) {
    console.error('API/users: Error fetching user details:', error);
    const response = NextResponse.json({ message: 'Internal server error fetching user details' }, { status: 500 });
    return corsMiddleware(req, response);
  }
}

// Your existing POST handler
export async function POST(_req: NextRequest) {
  console.log('API/users: Incoming POST request.');
  await dbConnect();

  const authorizationHeader = _req.headers.get('Authorization');
  const token = authorizationHeader?.split(' ')[1];

  if (!token) {
    console.warn('API/users: Authentication token not provided.');
    const response = NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    return corsMiddleware(_req, response);
  }

  const decodedToken = verifyToken(token) as DecodedToken | null;
  if (!decodedToken || !decodedToken.userId) {
    console.warn('API/users: Invalid or expired token, or missing userId in token.');
    const response = NextResponse.json({ message: 'Invalid or expired token' }, { status: 401 });
    return corsMiddleware(_req, response);
  }

  console.log('API/users: Authenticated user ID:', decodedToken.userId);

  try {
    const { userIds }: UsersRequest = await _req.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      console.warn('API/users: No user IDs provided in the request body.');
      const response = NextResponse.json({ message: 'User IDs are required' }, { status: 400 });
      return corsMiddleware(_req, response);
    }

    const invalidIds = userIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      console.warn('API/users: Invalid MongoDB ObjectId(s) found in request:', invalidIds);
      const response = NextResponse.json({ message: 'Invalid user ID format provided' }, { status: 400 });
      return corsMiddleware(_req, response);
    }

    console.log('API/users: Fetching details for user IDs:', userIds);
    const users = await User.find({ _id: { $in: userIds } })
      .select('_id firstName lastName profilePicture')
      .lean() as Array<Pick<IUser, '_id' | 'firstName' | 'lastName' | 'profilePicture'>>;

    if (users.length === 0) {
      console.warn('API/users: No users found for the provided IDs.');
      const response = NextResponse.json({ message: 'No users found' }, { status: 404 });
      return corsMiddleware(_req, response);
    }

    console.log(`API/users: Successfully fetched ${users.length} user details.`);
    const formattedUsers: UserResponse[] = users.map(user => ({
      id: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      profilePicture: user.profilePicture || '',
    }));

    const response = NextResponse.json({ users: formattedUsers }, { status: 200 });
    return corsMiddleware(_req, response);

  } catch (error) {
    console.error('API/users: Error fetching user details:', error);
    const response = NextResponse.json({ message: 'Internal server error fetching user details' }, { status: 500 });
    return corsMiddleware(_req, response);
  }
}