import { Migration } from '@mikro-orm/migrations';

export class Migration20230205091909 extends Migration {

  async up(): Promise<void> {
    this.addSql('drop table if exists "message" cascade;');

    this.addSql('drop table if exists "typeorm_metadata" cascade;');

    this.addSql('alter table "download_job" add column "errorInfo" jsonb null;');
    this.addSql('alter table "download_job" alter column "progress" type real using ("progress"::real);');
    this.addSql('alter table "download_job" alter column "downloadSpeed" type real using ("downloadSpeed"::real);');
    this.addSql('alter table "download_job" alter column "eta" type real using ("eta"::real);');
    this.addSql('alter table "download_job" alter column "availability" type real using ("availability"::real);');
    this.addSql('alter table "download_job" alter column "size" type bigint using ("size"::bigint);');
    this.addSql('alter table "download_job" alter column "downloaded" type bigint using ("downloaded"::bigint);');
    this.addSql('alter table "download_job" alter column "amountLeft" type bigint using ("amountLeft"::bigint);');
  }

  async down(): Promise<void> {
    this.addSql('create table "message" ("id" uuid not null default uuid_generate_v4(), "exchange" varchar not null default null, "routingKey" varchar not null default null, "content" json not null default null, "enqueuedTime" timestamp not null default null, constraint "PK_ba01f0a3e0123651915008bc578" primary key ("id"));');

    this.addSql('create table "typeorm_metadata" ("type" varchar not null default null, "database" varchar null default null, "schema" varchar null default null, "table" varchar null default null, "name" varchar null default null, "value" text null default null);');

    this.addSql('alter table "download_job" alter column "progress" type float8 using ("progress"::float8);');
    this.addSql('alter table "download_job" alter column "downloadSpeed" type float8 using ("downloadSpeed"::float8);');
    this.addSql('alter table "download_job" alter column "eta" type float8 using ("eta"::float8);');
    this.addSql('alter table "download_job" alter column "availability" type float8 using ("availability"::float8);');
    this.addSql('alter table "download_job" drop column "errorInfo";');
    this.addSql('alter table "download_job" alter column "size" type int using ("size"::int);');
    this.addSql('alter table "download_job" alter column "downloaded" type int using ("downloaded"::int);');
    this.addSql('alter table "download_job" alter column "amountLeft" type int using ("amountLeft"::int);');
  }

}
