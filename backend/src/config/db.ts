
import dns from "node:dns";
import mongoose from "mongoose";

export async function connectDB(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.error("MONGODB_URI is missing.");
    process.exit(1);
  }

  try {
    dns.setServers(["8.8.8.8", "8.8.4.4"]);

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:");

    if (error instanceof Error) {
      console.error("Name:", error.name);
      console.error("Message:", error.message);

      const mongoError = error as any;

      if (mongoError.reason?.servers) {
        for (const [host, server] of mongoError.reason.servers) {
          console.error("Server:", host);
          console.error(
            "Server error:",
            server.error?.message || "No specific error"
          );
        }
      }
    } else {
      console.error(error);
    }

    process.exit(1);
  }
}


