import { Migration } from '@mikro-orm/migrations';

export class Migration20260801055428 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "downloaded_object" alter column "id" drop default;`);
    this.addSql(`alter table "downloaded_object" alter column "id" type uuid using ("id"::text::uuid);`);
    this.addSql(`alter table "downloaded_object" alter column "id" set default gen_random_uuid();`);
    this.addSql(`alter table "downloaded_object" alter column "name" type text using ("name"::text);`);
    this.addSql(`alter table "downloaded_object" alter column "localPath" type text using ("localPath"::text);`);
    this.addSql(`alter table "downloaded_object" alter column "s3Uri" type text using ("s3Uri"::text);`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "downloaded_object" alter column "id" type text using ("id"::text);`);

    this.addSql(`alter table "downloaded_object" alter column "id" drop default;`);
    this.addSql(`alter table "downloaded_object" alter column "id" type varchar(255) using ("id"::varchar(255));`);
    this.addSql(`alter table "downloaded_object" alter column "name" type varchar(255) using ("name"::varchar(255));`);
    this.addSql(`alter table "downloaded_object" alter column "localPath" type varchar(255) using ("localPath"::varchar(255));`);
    this.addSql(`alter table "downloaded_object" alter column "s3Uri" type varchar(255) using ("s3Uri"::varchar(255));`);
  }

}
