import { Router } from "express"
import { getCurrentUser, loginUser, logoutUser, registerUser } from "../controllers/auth.controller.js"
import { verifyUser } from "../middlewares/auth.middleware.js"

const router = Router()

router.post("/register",registerUser)
router.post("/login",loginUser)
router.post("/logout",logoutUser)
router.get("/me", verifyUser, getCurrentUser)

export default router