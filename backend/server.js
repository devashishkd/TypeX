import express from "express";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRouter from "./routes/authRoutes.js";
import roomRouter from "./routes/roomRoutes.js";
import userRouter from "./routes/userRoutes.js";
import leaderboardRouter from "./routes/leaderboardRoutes.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import { initSocket } from "./config/socket.js";
import { registerSocketHandlers } from "./socket/index.js";
import http from "http";

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);
initSocket(server);
registerSocketHandlers();

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use("/api/auth", authRouter);
app.use("/api/rooms", roomRouter);
app.use("/api/users", userRouter);
app.use("/api/leaderboard", leaderboardRouter);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

server.listen(process.env.PORT || 3000, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});