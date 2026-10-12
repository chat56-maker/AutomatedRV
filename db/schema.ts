import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const runs = sqliteTable('runs', {
 id: text('id').primaryKey(), owner: text('owner').notNull(), code: text('code').notNull(), mode: text('mode').notNull(),
 status: text('status').notNull(), config: text('config').notNull(), snapshot: text('snapshot'),
 privateTarget: text('private_target'), feedback: text('feedback'), evaluation: text('evaluation'),
 createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), revision: integer('revision').notNull().default(0),
});
export const files = sqliteTable('files', {id:text('id').primaryKey(), owner:text('owner').notNull(), runId:text('run_id').notNull(), purpose:text('purpose').notNull(), name:text('name').notNull(), type:text('type').notNull(), size:integer('size').notNull(), createdAt:text('created_at').notNull()});
export const preferences = sqliteTable('preferences', {owner:text('owner').primaryKey(), config:text('config').notNull()});
export const events = sqliteTable('events', {id:text('id').primaryKey(), owner:text('owner').notNull(), runId:text('run_id').notNull(), type:text('type').notNull(), data:text('data').notNull(), createdAt:text('created_at').notNull()});
