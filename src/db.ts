import { MongoClient, Db } from "mongodb";
import logger from "./logger";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (!db) {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      logger.error("MONGO_URI environment variable is not set");
      throw new Error("MONGO_URI environment variable is not set");
    }
    logger.info("Connecting to MongoDB...", { uri: uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@") });
    try {
      client = new MongoClient(uri);
      await client.connect();
      db = client.db("payport");
      logger.info("MongoDB connected successfully", { database: "payport" });
    } catch (error) {
      logger.error("MongoDB connection failed", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
  return db;
}
