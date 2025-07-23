import jwt, { JwtPayload } from "jsonwebtoken";
const ACCESS_TOKEN_SECRET = "anamcara_access_secret";
const REFRESH_TOKEN_SECRET = "anamcara_refresh_secret";
const RESET_PASSWORD_SECRET = "anamcara_reset_password_secret";

export const generateAccessToken = (payload: object) => {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: "15m" });
};

export const generateRefreshToken = (payload: object) => {
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: "7d" });
};


export const verifyToken = (
  token: string,
  secretKey: string = ACCESS_TOKEN_SECRET
): JwtPayload | null => {
  try {
    const decoded = jwt.verify(token, secretKey) as JwtPayload;
    return decoded;
  } catch (error) {
    console.error("Token verification failed:", error);
    return null;
  }
};


export const verifyResetToken = (token: string , secretKey: string = RESET_PASSWORD_SECRET): JwtPayload | null => {
  try {
    const decoded = jwt.verify(token, secretKey) as JwtPayload;
    return decoded;
  } catch (error) {
    console.error("Reset token verification failed:", error);
    return null;
  }
};  