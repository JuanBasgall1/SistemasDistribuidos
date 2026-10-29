import { Db, MongoClient } from 'mongodb';
import { ProcessedEvents } from './ports';

export const MONGO_DB = 'MONGO_DB';

/** Una base por servicio: ningún servicio lee la base de otro. */
export async function connectMongo(dbName: string): Promise<Db> {
  const uri = process.env.MONGO_URI ?? 'mongodb://localhost:27017/?directConnection=true';
  const client = new MongoClient(uri);
  await client.connect();
  return client.db(dbName);
}

/** TTL de processed_events = retención de los topics (7 días). */
const SEVEN_DAYS = 7 * 24 * 60 * 60;

export class MongoProcessedEvents implements ProcessedEvents {
  constructor(private readonly db: Db) {}

  async init(): Promise<this> {
    const col = this.db.collection('processed_events');
    await col.createIndex({ eventId: 1 }, { unique: true });
    await col.createIndex({ processedAt: 1 }, { expireAfterSeconds: SEVEN_DAYS });
    return this;
  }

  async has(eventId: string): Promise<boolean> {
    return (await this.db.collection('processed_events').countDocuments({ eventId }, { limit: 1 })) > 0;
  }

  async mark(eventId: string, eventType: string): Promise<void> {
    try {
      await this.db.collection('processed_events').insertOne({ eventId, eventType, processedAt: new Date() });
    } catch (e: any) {
      if (e?.code !== 11000) throw e; // duplicado: ya estaba marcado
    }
  }
}

export const isDuplicateKey = (e: any) => e?.code === 11000;
