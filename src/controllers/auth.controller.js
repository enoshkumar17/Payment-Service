import { User } from "../models/user.model.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { sendVerificationEmail, sendResetPasswordEmail } from "../services/email.service.js"
import { TokenBlacklist } from "../models/blackList.model.js"
import { generateVerificationToken } from "../utils/token.js"

const generateAccessAndRefreshTokens = async(userId)=>{
  try {
    const user = await User.findById(userId)

    if (!user) {
    throw new ApiError(404, "User not found")
    }

    const accessToken = await  user.generateAccessToken()
    const refreshToken = await user.generateRefreshToken()

    user.refreshToken = refreshToken 
    await user.save({validateBeforeSave : false})

    return {accessToken,refreshToken}
    
  } catch (error) {
    throw new ApiError(500,"Something went wrong!");
  }
}

const registerUser = asyncHandler(async(req,res)=>{
  const { email, password, name } = req.body

  if([email,password,name].some((field)=>!field || field.trim()===""))
  {
    throw new ApiError(400,"All fields are required")
  }

  const existingUser = await User.findOne({email})

  if(existingUser) {
    throw new ApiError(409,"Email registered already")
  }

  const user = await User.create({
    email,
    password,
    name
  })

  const verificationToken = generateVerificationToken(user._id,process.env.EMAIL_TOKEN_SECRET,'4m')
  
  await sendVerificationEmail(email, verificationToken)

  return res.status(200)
            .json(new ApiResponse(200,user,"An verification email sent, please verify"))

})

const loginUser = asyncHandler(async(req,res)=>{
  const { email,password } = req.body

  if ([email, password].some(field => !field || field.trim() === "")) 
  {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({email}).select("+password")

  if(!user)
  {
    throw new ApiError(404,"User not Registered")
  }
  if(user.authProvider === "Google")
  {
    throw new ApiError(400,"This account was created by Google, Please login with Google")
  }

  const isPasswordCorrect = await user.comparePassword(password)

  if(!isPasswordCorrect)
  {
    throw new ApiError(401,"Incorrect Password")
  }

  const {accessToken,refreshToken} = await generateAccessAndRefreshTokens(user._id)
  user.refreshToken = refreshToken
  await user.save({validateBeforeSave:false})

  const options={
    httpOnly:true,
    secure:true
  }

  return res.status(200)
            .cookie("accessToken",accessToken,options)
            .cookie("refreshToken",refreshToken,options)
            .json(new ApiResponse(200,{user:{
              _id:user._id,
              email:user.email,
              name:user.name
            }},"Logged in Successfully"))
})

const forgotPassword = asyncHandler(async(req,res)=>{
    const { email } = req.body;

    if (!email) {
        throw new ApiError(400, "Email is required");
    }

    const user = await User.findOne({ email });

    if (!user) {
        throw new ApiError(400, "Email not registered");
    }

    const resetToken = generateVerificationToken(
        user._id,
        process.env.PASSWORD_TOKEN_SECRET
    );

    await sendResetPasswordEmail(email, resetToken);

    return res.status(200).json(
        new ApiResponse(
            200,
            {},
            "Password reset link sent to your email"
        )
    );
}) 

const getCurrentUser = asyncHandler(async (req, res) => {
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        authProvider: req.user.authProvider,
      },
      "Current user fetched successfully"
    )
  );
});

const logoutUser = asyncHandler(async(req,res)=>{
  const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ","")

  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  };

  if(token)
  {
    await TokenBlacklist.create({
      token:token
    });
  }
  
  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);
  
  return res.status(200)
            .json(new ApiResponse(200,{},"User LoggedOut successfully"))
})

export {
  registerUser,
  loginUser,
  logoutUser,
  generateAccessAndRefreshTokens,
  forgotPassword,
  getCurrentUser,
}