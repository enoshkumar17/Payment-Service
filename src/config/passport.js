import passport from "passport"
import GoogleStrategy from "passport-google-oauth20"
import { User } from "../models/user.model.js"
import { sendWelcomeEmail } from "../services/email.service.js"

if (process.env.LOGIN_CLIENT_ID && process.env.LOGIN_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.LOGIN_CLIENT_ID,
        clientSecret: process.env.LOGIN_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/v2/auth/google/callback",
        proxy: true,
      },
      async (accessToken, refreshToken, profile, done) => {
        const email = profile.emails[0].value;
        const user = await User.findOne({ email });

        try {
          if (!user) {
            const user = await User.create({
              email,
              name: profile.displayName,
              verifiedUser: true,
              authProvider: "Google",
            });

            try {
              await sendWelcomeEmail(user.email, user.name);
            } catch (emailErr) {
              console.warn("Welcome email could not be sent:", emailErr.message);
            }

            return done(null, user);
          }

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
} else {
  console.log("[AUTH] Google OAuth Strategy disabled: LOGIN_CLIENT_ID or LOGIN_CLIENT_SECRET missing");
}

passport.serializeUser((user, done)=>{
  return done(null, user._id)
})

passport.deserializeUser(async(id, done)=>{
  try {

    const user = await User.findOne({id})
    return done(null, user)

  } catch (error) {
    return done(error, null)
  }
})

export default passport