# Migrate from prev-1.0 version

From 1.0 version, we change the database and old data are no long usable. You may need to make sure all task are done, before start to upgrade.

A sync schema step is needed if you are currently using prev-1.0 version. this operation will drop download_job and clean_up_tasks tables and then recreate them with current new schema.

To do this, You need to go the deployment folder if you are using mira-docker to deploy your system, then run the following command:

```bash
docker run -rm --network $mira --env-file .env mira-download-manager:$version node dist/migrate.js --sync --silent
```