import { Router } from "express";
import {login, register, logout, getMe, refreshToken} from '../controllers/authController.js';

const authRouter = Router();

authRouter.post("/register", register);

authRouter.post("/login", login);

authRouter.post("/logout", logout);

authRouter.get("/me", getMe)

authRouter.post("/refresh", refreshToken);

export default authRouter;