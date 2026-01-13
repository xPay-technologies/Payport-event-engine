import { Session, EventMode } from "./types";
import { getDb } from "./db";
import logger from "./logger";

const COLLECTION_NAME = "sessions";

// Get the sessions collection
async function getCollection() {
  const db = await getDb();
  return db.collection<Session>(COLLECTION_NAME);
}

// Create indexes for efficient queries (call once on startup)
export async function initSessionStore() {
  const collection = await getCollection();
  await collection.createIndex({ email: 1 }, { unique: true });
  await collection.createIndex({ isActive: 1 });
  await collection.createIndex({ endsAt: 1 });
  logger.info("Session store initialized with indexes");
}

export async function createSession(
  email: string,
  name: string,
  endsAt: number
): Promise<Session> {
  const collection = await getCollection();
  
  const session: Session = {
    email,
    name,
    endsAt,
    isActive: true,
    mode: "normal"
  };
  
  await collection.insertOne(session);
  logger.info("Session created", { 
    email, 
    name, 
    endsAt: new Date(endsAt).toISOString()
  });
  return session;
}

export async function getSession(email: string): Promise<Session | null> {
  const collection = await getCollection();
  const session = await collection.findOne({ email });
  
  if (!session) {
    logger.debug("Session not found", { email });
    return null;
  }

  // Check if session has expired
  if (Date.now() > session.endsAt && session.isActive) {
    await collection.updateOne(
      { email },
      { $set: { isActive: false } }
    );
    session.isActive = false;
    logger.info("Session expired", { email, endsAt: new Date(session.endsAt).toISOString() });
  }
  
  return session;
}

export async function stopSession(email: string): Promise<void> {
  const collection = await getCollection();
  const result = await collection.updateOne(
    { email },
    { $set: { isActive: false } }
  );
  
  if (result.matchedCount > 0) {
    logger.info("Session stopped", { email });
  } else {
    logger.warn("Attempted to stop non-existent session", { email });
  }
}

export async function updateMode(email: string, mode: EventMode): Promise<void> {
  const collection = await getCollection();
  const result = await collection.updateOne(
    { email },
    { $set: { mode } }
  );
  
  if (result.matchedCount === 0) {
    logger.error("Cannot update mode: session not found", { email, mode });
    throw new Error("Session not found");
  }
  
  logger.info("Session mode updated", { email, newMode: mode });
}

// ============== ADMIN FUNCTIONS ==============

// Resume an expired/stopped session for evaluation
export async function resumeSession(email: string, durationMs: number): Promise<Session> {
  const collection = await getCollection();
  const newEndsAt = Date.now() + durationMs;
  
  const result = await collection.findOneAndUpdate(
    { email },
    { $set: { isActive: true, endsAt: newEndsAt } },
    { returnDocument: "after" }
  );
  
  if (!result) {
    logger.error("Cannot resume session: not found", { email });
    throw new Error("Session not found");
  }
  
  logger.info("Session resumed (admin)", { 
    email, 
    newEndsAt: new Date(newEndsAt).toISOString(),
    durationMinutes: durationMs / 60000 
  });
  return result;
}

// Create a fresh evaluation session (doesn't require /start)
export async function createEvalSession(
  email: string, 
  durationMs: number, 
  mode: EventMode = "normal"
): Promise<Session> {
  const collection = await getCollection();
  
  // Remove existing session if any
  await collection.deleteOne({ email });
  logger.debug("Cleared existing session for eval", { email });

  const session: Session = {
    email,
    name: "Evaluator",
    endsAt: Date.now() + durationMs,
    isActive: true,
    mode
  };
  
  await collection.insertOne(session);
  logger.info("Evaluation session created (admin)", { 
    email, 
    mode,
    endsAt: new Date(session.endsAt).toISOString()
  });
  return session;
}

// List all sessions (for admin dashboard)
export async function listSessions(): Promise<Session[]> {
  const collection = await getCollection();
  return collection.find({}).toArray();
}

// List only active sessions
export async function listActiveSessions(): Promise<Session[]> {
  const collection = await getCollection();
  const now = Date.now();
  return collection.find({ 
    isActive: true,
    endsAt: { $gt: now }
  }).toArray();
}

// Check if email already exists (for uniqueness check)
export async function emailExists(email: string): Promise<boolean> {
  const collection = await getCollection();
  const count = await collection.countDocuments({ email });
  return count > 0;
}

// Delete a session (admin only)
export async function deleteSession(email: string): Promise<boolean> {
  const collection = await getCollection();
  const result = await collection.deleteOne({ email });
  if (result.deletedCount > 0) {
    logger.info("Session deleted (admin)", { email });
    return true;
  }
  return false;
}
