import { Collection, Db } from 'mongodb';
import * as nodemailer from 'nodemailer';
import { isDuplicateKey } from '../../../libs/kafka-toolkit/src';
import { Mail, Mailer, NotificationRecord, NotificationStore } from './notification.logic';

export class MongoNotificationStore implements NotificationStore {
  private readonly col: Collection<NotificationRecord>;
  constructor(db: Db) {
    this.col = db.collection('notifications');
  }
  async init(): Promise<this> {
    await this.col.createIndex({ activationId: 1, eventType: 1 }, { unique: true });
    return this;
  }
  async save(record: NotificationRecord) {
    try {
      await this.col.insertOne({ ...record });
      return true;
    } catch (e) {
      if (isDuplicateKey(e)) return false;
      throw e;
    }
  }
  async remove(activationId: string, eventType: string) {
    await this.col.deleteOne({ activationId, eventType });
  }
}

/** SMTP hacia Mailhog (bandeja visible en http://localhost:8025). */
export class SmtpMailer implements Mailer {
  private readonly transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
  });
  async send(mail: Mail) {
    await this.transport.sendMail({ from: 'Activaciones <no-reply@poc.demo>', ...mail });
  }
}
