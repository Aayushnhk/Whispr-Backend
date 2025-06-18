import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import User, { IUser } from '@/models/User';
import mongoose from 'mongoose';
import { verifyToken } from '@/lib/auth';

interface DecodedToken {
  userId: string;
}

interface OnlineUsersRequest {
  userIds: string[];
}

interface OnlineUserResponse {
  id: string;
  firstName: string;
  lastName: string;
  profilePicture: string;
}

export async function POST(req: NextRequest) {
  console.log('API/users/online: Incoming POST request.');
  await dbConnect();

  const authorizationHeader = req.headers.get('Authorization');
  const token = authorizationHeader?.split(' ')[1];

  if (!token) {
    console.warn('API/users/online: Authentication token not provided.');
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  const decodedToken = verifyToken(token) as DecodedToken | null;
  if (!decodedToken || !decodedToken.userId) {
    console.warn('API/users/online: Invalid or expired token, or missing userId in token.');
    return NextResponse.json({ message: 'Invalid or expired token' }, { status: 401 });
  }

  console.log('API/users/online: Authenticated user ID:', decodedToken.userId);

  try {
    const { userIds }: OnlineUsersRequest = await req.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      console.warn('API/users/online: No user IDs provided in the request body.');
      return NextResponse.json({ message: 'User IDs are required' }, { status: 400 });
    }

    const invalidIds = userIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      console.warn('API/users/online: Invalid MongoDB ObjectId(s) found in request:', invalidIds);
      return NextResponse.json({ message: 'Invalid user ID format provided' }, { status: 400 });
    }

    console.log('API/users/online: Fetching details for user IDs:', userIds);
    const users = await User.find({ _id: { $in: userIds } })
      .select('_id firstName lastName profilePicture')
      .lean() as Array<Pick<IUser, '_id' | 'firstName' | 'lastName' | 'profilePicture'>>;

    if (users.length === 0) {
      console.warn('API/users/online: No online users found for the provided IDs.');
      return NextResponse.json({ message: 'No online users found' }, { status: 404 });
    }

    console.log(`API/users/online: Successfully fetched ${users.length} online user details.`);
    const formattedUsers: OnlineUserResponse[] = users.map(user => ({
      id: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      profilePicture: user.profilePicture || ''
    }));

    return NextResponse.json({ users: formattedUsers }, { status: 200 });

  } catch (error) {
    console.error('API/users/online: Error fetching online user details:', error);
    return NextResponse.json({ message: 'Internal server error fetching online user details' }, { status: 500 });
  }
}