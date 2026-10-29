import { Collection, Db } from 'mongodb';
import { isDuplicateKey } from '../../../libs/kafka-toolkit/src';
import { ProvisioningOrder, ProvisioningStore } from './provisioning.logic';

export class MongoProvisioningStore implements ProvisioningStore {
  private readonly orders: Collection<ProvisioningOrder>;

  constructor(db: Db) {
    this.orders = db.collection('provisioning_orders');
  }

  async init(): Promise<this> {
    await this.orders.createIndex({ activationId: 1 }, { unique: true });
    return this;
  }

  async save(order: ProvisioningOrder) {
    try {
      await this.orders.insertOne({ ...order });
      return true;
    } catch (e) {
      if (isDuplicateKey(e)) return false;
      throw e;
    }
  }
}
