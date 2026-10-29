import { Collection, Db } from 'mongodb';
import { EventEnvelope } from '../../../libs/contracts/src';
import { isDuplicateKey } from '../../../libs/kafka-toolkit/src';
import { EventLogStore } from './crm.logic';

export class MongoEventLogStore implements EventLogStore {
  private readonly col: Collection<EventEnvelope & { topic: string; receivedAt: Date }>;
  constructor(db: Db) {
    this.col = db.collection('event_log');
  }
  async init(): Promise<this> {
    await this.col.createIndex({ eventId: 1 }, { unique: true });
    await this.col.createIndex({ correlationId: 1 });
    return this;
  }
  async append(event: EventEnvelope, topic: string) {
    try {
      await this.col.insertOne({ ...event, topic, receivedAt: new Date() });
      return true;
    } catch (e) {
      if (isDuplicateKey(e)) return false;
      throw e;
    }
  }
  count() {
    return this.col.countDocuments();
  }
}
