import { Collection, Db } from 'mongodb';
import { isDuplicateKey } from '../../../libs/kafka-toolkit/src';
import { BillingAccount, BillingStore } from './billing.logic';

export class MongoBillingStore implements BillingStore {
  private readonly accounts: Collection<BillingAccount>;
  private readonly failed: Collection<{ _id: string; at: Date }>;

  constructor(db: Db) {
    this.accounts = db.collection('billing_accounts');
    this.failed = db.collection('failed_activations');
  }

  async init(): Promise<this> {
    await this.accounts.createIndex({ activationId: 1 }, { unique: true });
    return this;
  }

  findByActivation(activationId: string) {
    return this.accounts.findOne({ activationId }, { projection: { _id: 0 } });
  }

  async create(account: BillingAccount): Promise<boolean> {
    try {
      await this.accounts.insertOne({ ...account });
      return true;
    } catch (e) {
      if (isDuplicateKey(e)) return false;
      throw e;
    }
  }

  cancel(activationId: string) {
    return this.accounts.findOneAndUpdate(
      { activationId, status: 'CREATED' },
      { $set: { status: 'CANCELLED', cancelledAt: new Date().toISOString() } },
      { returnDocument: 'after', projection: { _id: 0 } },
    );
  }

  async markFailed(activationId: string) {
    await this.failed.updateOne({ _id: activationId }, { $setOnInsert: { at: new Date() } }, { upsert: true });
  }

  async isFailed(activationId: string) {
    return (await this.failed.countDocuments({ _id: activationId }, { limit: 1 })) > 0;
  }
}
