import { Router } from "express";

const router = Router();

router.post("/create", (req, res) => {
  res.send("create room");
});

router.get("/:roomId", (req, res) => {
  res.send("get room");
});

router.post("/join", (req, res) => {
  res.send("join room");
}); 

export default router;