import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import User, { IUser } from '@/models/User';
import mongoose from 'mongoose';
import { verifyToken } from '@/lib/auth';

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

export async function POST(req: NextRequest) {
  console.log('API/users: Incoming POST request.');
  await dbConnect();

  const authorizationHeader = req.headers.get('Authorization');
  const token = authorizationHeader?.split(' ')[1];

  if (!token) {
    console.warn('API/users: Authentication token not provided.');
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  const decodedToken = verifyToken(token) as DecodedToken | null;
  if (!decodedToken || !decodedToken.userId) {
    console.warn('API/users: Invalid or expired token, or missing userId in token.');
    return NextResponse.json({ message: 'Invalid or expired token' }, { status: 401 });
  }

  console.log('API/users: Authenticated user ID:', decodedToken.userId);

  try {
    const { userIds }: UsersRequest = await req.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      console.warn('API/users: No user IDs provided in the request body.');
      return NextResponse.json({ message: 'User IDs are required' }, { status: 400 });
    }

    const invalidIds = userIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      console.warn('API/users: Invalid MongoDB ObjectId(s) found in request:', invalidIds);
      return NextResponse.json({ message: 'Invalid user ID format provided' }, { status: 400 });
    }

    console.log('API/users: Fetching details for user IDs:', userIds);
    const users = await User.find({ _id: { $in: userIds } })
      .select('_id firstName lastName profilePicture')
      .lean() as Array<Pick<IUser, '_id' | 'firstName' | 'lastName' | 'profilePicture'>>;

    if (users.length === 0) {
      console.warn('API/users: No users found for the provided IDs.');
      return NextResponse.json({ message: 'No users found' }, { status: 404 });
    }

    console.log(`API/users: Successfully fetched ${users.length} user details.`);
    const formattedUsers: UserResponse[] = users.map(user => ({
      id: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      profilePicture: user.profilePicture || '',
    }));

    return NextResponse.json({ users: formattedUsers }, { status: 200 });

  } catch (error) {
    console.error('API/users: Error fetching user details:', error);
    return NextResponse.json({ message: 'Internal server error fetching user details' }, { status: 500 });
  }
}