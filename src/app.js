import express from "express"
import cookieParser from "cookie-parser"
import jwt from "jsonwebtoken"
import { User } from "./models/user.model.js"
import { sendWelcomeEmail } from "./services/email.service.js"
import path from "path"
import session from "express-session"
import { fileURLToPath } from "url";
import passport from "./config/passport.js"

import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(
  cors({
    origin: "https://payment-service-dashboard.vercel.app",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-api-key",
      "x-dashboard-admin",
    ],
  })
);

app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "default_session_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

app.use(express.static(path.join(__dirname,"views")))

// Dashboard root redirect and SPA routing
app.get("/", (req, res) => {
  res.redirect("/dashboard");
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "dashboard", "index.html"));
});

app.get("/dashboard/:page", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "dashboard", "index.html"));
});


app.use(passport.initialize())

app.use(passport.session())

app.use("/login",(req,res)=>{
  console.log("User came for Login using OAUTH")
  const filePath = path.join(__dirname,"views","login.html")
  res.sendFile(filePath)
})

  
app.get("/reset-password/:token", async(req,res)=>{
  const { token } = req.params
  const { newPassword, confirmPassword } = req.body

  if(!newPassword || !confirmPassword)
  {
    return res.status(400)
              .json({
                message:'newPassword, confirmPassword both are required'
              })
  }

  if(newPassword!==confirmPassword)
  {
    return res.status(400)
              .json({
                message:'newPassword and confirmPassword are not matching'
              })
  }

  try {
    const decodedToken = jwt.verify(token,process.env.PASSWORD_TOKEN_SECRET)

    const user = await User.findById(decodedToken._id)

    if(!user)
    {
      return res.status(404)
                .json({
                  message:"Token expired or invalid Token"
                })
    }

    user.password = newPassword
    await user.save()

    return res.status(200)
              .json({
                message:'Password changed successfully'
              })

  } catch (error) {
    return res.status(404)
              .json({
                message:"Token expired or invalid Token"
              })
  }
})



//routes
import authRouter from './routes/auth.routes.js'
import accountRouter from './routes/account.routes.js'
import transactionRouter from './routes/transaction.routes.js'
import merchantRouter from './routes/merchant.routes.js'
import passportRouter from './routes/passport.routes.js'
import verificationRouter from './routes/verification.routes.js'
import passwordRouter from './routes/password.routes.js'

//secured routes
app.use("/api/v1/auth",authRouter)
app.use("/api/v1/accounts",accountRouter)
app.use("/api/v1/transactions",transactionRouter)
app.use("/api/v1/merchants",merchantRouter)
app.use("/api/v2/auth",passportRouter)
app.use("/api/v2/verify",verificationRouter)
app.use("/api/v2/reset-password",passwordRouter)

export default app