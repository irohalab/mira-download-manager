import { Migration } from '@mikro-orm/migrations';

export class Migration20260301132558 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "downloaded_object" ("id" varchar(255) not null, "name" varchar(255) not null, "localPath" varchar(255) not null, "s3Uri" varchar(255) not null, "expiration" timestamptz not null, "downloadJob" varchar(255) not null, constraint "downloaded_object_pkey" primary key ("id"));`);

    this.addSql(`alter table "downloaded_object" add constraint "downloaded_object_downloadJob_foreign" foreign key ("downloadJob") references "download_job" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "downloaded_object" cascade;`);
  }

}
