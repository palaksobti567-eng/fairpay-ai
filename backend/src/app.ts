import milestoneRoutes from "./routes/milestone.routes";
import projectRoutes from "./routes/project.routes";
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config();
import authRoutes from "./routes/auth.routes";
import express from "express";
import { connectDB } from "./config/db";

const app = express();

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/milestones", milestoneRoutes);
const port = Number(process.env.PORT) || 3000;

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

connectDB().then(() => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
});
