import screenshotRoutes from "./routes/screenshot.routes";
import submissionRoutes from "./routes/submission.routes";
import milestoneRoutes from "./routes/milestone.routes";
import projectRoutes from "./routes/project.routes";
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config();
import authRoutes from "./routes/auth.routes";
import aiRoutes from "./routes/ai.routes";
import express from "express";
import { connectDB } from "./config/db";
import paymentRoutes from "./routes/payment.routes";
import paymentStatusRoutes from "./routes/payment-status.routes";
const app = express();

app.use(express.json());
app.use("/api/screenshots", screenshotRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/milestones", milestoneRoutes);
app.use("/api/milestones", paymentStatusRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/payments", paymentRoutes);

const port = Number(process.env.PORT) || 3000;

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

connectDB().then(() => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
});
