import { Migration } from '@mikro-orm/migrations';

export class Migration20260801113827 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "download_job" add column "finishMessageResend" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "download_job" drop column "finishMessageResend";`);
  }

}
