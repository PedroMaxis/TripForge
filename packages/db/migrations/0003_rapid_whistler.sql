CREATE TYPE "public"."task_list" AS ENUM('todo', 'pack');--> statement-breakpoint
ALTER TYPE "public"."operation_type" ADD VALUE 'item.vote' BEFORE 'member.changed';--> statement-breakpoint
ALTER TYPE "public"."operation_type" ADD VALUE 'item.booking' BEFORE 'member.changed';--> statement-breakpoint
ALTER TYPE "public"."operation_type" ADD VALUE 'comment.create' BEFORE 'member.changed';--> statement-breakpoint
ALTER TYPE "public"."operation_type" ADD VALUE 'comment.delete' BEFORE 'member.changed';--> statement-breakpoint
ALTER TYPE "public"."operation_type" ADD VALUE 'attachment.added' BEFORE 'member.changed';--> statement-breakpoint
ALTER TYPE "public"."operation_type" ADD VALUE 'attachment.delete' BEFORE 'member.changed';--> statement-breakpoint
ALTER TYPE "public"."operation_type" ADD VALUE 'task.create' BEFORE 'member.changed';--> statement-breakpoint
ALTER TYPE "public"."operation_type" ADD VALUE 'task.update' BEFORE 'member.changed';--> statement-breakpoint
ALTER TYPE "public"."operation_type" ADD VALUE 'task.delete' BEFORE 'member.changed';--> statement-breakpoint
ALTER TYPE "public"."operation_type" ADD VALUE 'expense.create' BEFORE 'member.changed';--> statement-breakpoint
ALTER TYPE "public"."operation_type" ADD VALUE 'expense.update' BEFORE 'member.changed';--> statement-breakpoint
ALTER TYPE "public"."operation_type" ADD VALUE 'expense.delete' BEFORE 'member.changed';--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"code" text,
	"details" text
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trip_id" uuid NOT NULL,
	"title" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"paid_by" text NOT NULL,
	"split" text[] NOT NULL,
	"date" date NOT NULL,
	"payment" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_check" CHECK ("expenses"."amount" > 0),
	CONSTRAINT "expenses_split_check" CHECK (cardinality("expenses"."split") > 0)
);
--> statement-breakpoint
CREATE TABLE "item_votes" (
	"item_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "item_votes_item_id_user_id_pk" PRIMARY KEY("item_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trip_id" uuid NOT NULL,
	"list" "task_list" NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"assignee_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_votes" ADD CONSTRAINT "item_votes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_votes" ADD CONSTRAINT "item_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_trip_id_idx" ON "attachments" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "attachments_user_id_idx" ON "attachments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comments_item_id_idx" ON "comments" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "expenses_trip_id_idx" ON "expenses" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "tasks_trip_id_idx" ON "tasks" USING btree ("trip_id");