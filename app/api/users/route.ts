import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connect';
import User from '@/models/User';
import { verifyToken } from '@/lib/auth'; // Assuming you have this utility
import mongoose from 'mongoose';

export async function POST(req: NextRequest) {
  console.log('API/users/online: Incoming POST request.');
  await dbConnect();

  // 1. Authenticate the request
  const authorizationHeader = req.headers.get('Authorization');
  const token = authorizationHeader?.split(' ')[1];

  if (!token) {
    console.warn('API/users/online: Authentication token not provided.');
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  const decodedToken: any = verifyToken(token); // Use your verifyToken utility
  if (!decodedToken || !decodedToken.userId) {
    console.warn('API/users/online: Invalid or expired token, or missing userId in token.');
    return NextResponse.json({ message: 'Invalid or expired token' }, { status: 401 });
  }

  console.log('API/users/online: Authenticated user ID:', decodedToken.userId);

  try {
    // 2. Parse the request body to get userIds
    const body = await req.json();
    const { userIds } = body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      console.warn('API/users/online: No user IDs provided in the request body.');
      return NextResponse.json({ message: 'User IDs are required' }, { status: 400 });
    }

    // Optional: Validate if all userIds are valid MongoDB ObjectIds
    const invalidIds = userIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      console.warn('API/users/online: Invalid MongoDB ObjectId(s) found in request:', invalidIds);
      return NextResponse.json({ message: 'Invalid user ID format provided' }, { status: 400 });
    }

    // 3. Fetch user details from the database
    console.log('API/users/online: Fetching details for user IDs:', userIds);
    const users = await User.find({ _id: { $in: userIds } })
                            .select('_id firstName lastName profilePicture')
                            .lean(); // Use .lean() for plain JavaScript objects

    if (users.length === 0) {
      console.warn('API/users/online: No online users found for the provided IDs.');
      return NextResponse.json({ message: 'No online users found' }, { status: 404 });
    }

    console.log(`API/users/online: Successfully fetched ${users.length} online user details.`);
    // 4. Return the fetched user details
    return NextResponse.json({ users }, { status: 200 });

  } catch (error: any) {
    console.error('API/users/online: Error fetching online user details:', error);
    // Provide a more specific error message if possible based on error.message
    return NextResponse.json(
      { message: 'Internal server error fetching online user details', error: error.message },
      { status: 500 }
    );
  }
}
