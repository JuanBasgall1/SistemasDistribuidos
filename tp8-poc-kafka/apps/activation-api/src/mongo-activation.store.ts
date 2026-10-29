import { Collection, Db } from 'mongodb';
import { Activation, ActivationStore, HistoryEntry, Step, StepResult } from './activation.model';

export class MongoActivationStore implements ActivationStore {
  private readonly activations: Collection<Activation>;
  private readonly counters: Collection<{ _id: string; seq: number }>;

  constructor(db: Db) {
    this.activations = db.collection<Activation>('activations');
    this.counters = db.collection('counters');
  }

  async init(): Promise<this> {
    await this.activations.createIndex({ customerId: 1 });
    await this.activations.createIndex({ createdAt: -1 });
    return this;
  }

  /** act-0001, act-0002, ... (contador atómico en Mongo). */
  async nextId(): Promise<string> {
    const doc = await this.counters.findOneAndUpdate(
      { _id: 'activation' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    );
    return `act-${String(doc!.seq).padStart(4, '0')}`;
  }

  async insert(activation: Activation): Promise<void> {
    await this.activations.insertOne(activation);
  }

  get(id: string) {
    return this.activations.findOne({ _id: id });
  }

  list(limit: number) {
    return this.activations.find().sort({ createdAt: -1 }).limit(limit).toArray();
  }

  /** Update atómico con pipeline: resultado del paso + historial + PENDING -> IN_PROGRESS. */
  saveStep(id: string, step: Step, result: StepResult, entry: HistoryEntry) {
    return this.activations.findOneAndUpdate(
      { _id: id },
      [
        {
          $set: {
            [`steps.${step}`]: { $literal: result },
            history: { $concatArrays: ['$history', [{ $literal: entry }]] },
            status: { $cond: [{ $eq: ['$status', 'PENDING'] }, 'IN_PROGRESS', '$status'] },
            updatedAt: new Date().toISOString(),
          },
        },
      ],
      { returnDocument: 'after' },
    );
  }

  appendHistory(id: string, entry: HistoryEntry) {
    return this.activations.findOneAndUpdate(
      { _id: id },
      { $push: { history: entry }, $set: { updatedAt: new Date().toISOString() } },
      { returnDocument: 'after' },
    );
  }

  /** La condición sobre status hace que la transición final ocurra una sola vez. */
  async finish(id: string, status: 'ACTIVE' | 'FAILED', entry: HistoryEntry, reason?: string): Promise<boolean> {
    const res = await this.activations.updateOne(
      { _id: id, status: { $in: ['PENDING', 'IN_PROGRESS'] } },
      {
        $set: { status, updatedAt: new Date().toISOString(), ...(reason ? { failureReason: reason } : {}) },
        $push: { history: entry },
      },
    );
    return res.modifiedCount === 1;
  }
}
