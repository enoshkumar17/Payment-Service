import { Router } from "express"
import passport from "../config/passport.js"

const router = Router()

router.get("/google",passport.authenticate("google",{scope:['profile','email']}))

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  async (req, res) => {
    try {
      const accessToken = await req.user.generateAccessToken();
      const refreshToken = await req.user.generateRefreshToken();

      req.user.refreshToken = refreshToken;
      await req.user.save({ validateBeforeSave: false });

      const cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 24 * 60 * 60 * 1000,
      };

      res.cookie("accessToken", accessToken, cookieOptions);
      res.cookie("refreshToken", refreshToken, {
        ...cookieOptions,
        maxAge: 10 * 24 * 60 * 60 * 1000,
      });

      const frontendUrl =
        process.env.FRONTEND_URL || "https://payment-service-dashboard.vercel.app";
      return res.redirect(frontendUrl);
    } catch (error) {
      console.error("Google callback auth error:", error);
      const frontendUrl =
        process.env.FRONTEND_URL || "https://payment-service-dashboard.vercel.app";
      return res.redirect(`${frontendUrl}?auth_error=true`);
    }
  }
);

export default router