import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { NextRequest } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error(
    "JWT_SECRET or JWT_REFRESH_SECRET is not defined in environment variables"
  );
}

interface DecodedToken extends JwtPayload {
  id: string;
}

export function verifyToken(
  token: string,
  isRefreshToken = false
): DecodedToken | null {
  try {
    const secret = isRefreshToken ? JWT_REFRESH_SECRET : JWT_SECRET;
    const decoded = jwt.verify(token, secret) as DecodedToken;
    return decoded;
  } catch (error) {
    console.error("Token verification failed:", error);
    return null;
  }
}

type ExpiresIn = number | "1h" | "2h" | "1d" | "7d" | "30d" | undefined;

export function generateToken(
  payload: object,
  expiresIn: ExpiresIn = "1h",
  isRefreshToken = false
): string {
  const secret = isRefreshToken ? JWT_REFRESH_SECRET : JWT_SECRET;
  const options: SignOptions = {};
  if (expiresIn !== undefined) {
    options.expiresIn = expiresIn;
  }
  return jwt.sign(payload, secret, options);
}

export function isTokenExpired(decodedToken: DecodedToken): boolean {
  if (!decodedToken.exp) return true;
  return Date.now() >= decodedToken.exp * 1000;
}

interface AuthMiddlewareResult {
  error?: string;
  status?: number;
  decoded?: DecodedToken;
}

export function authMiddleware(request: NextRequest): AuthMiddlewareResult {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Unauthorized: No token provided", status: 401 };
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return { error: "Unauthorized: Invalid token", status: 401 };
  }

  if (isTokenExpired(decoded)) {
    return { error: "Unauthorized: Token expired", status: 401 };
  }

  return { decoded };
}
