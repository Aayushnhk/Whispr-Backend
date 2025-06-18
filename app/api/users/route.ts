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

export async function OPTIONS(_req: NextRequest) {
  return handleOptions();
}

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