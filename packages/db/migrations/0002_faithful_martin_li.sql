ALTER TYPE "public"."operation_type" ADD VALUE 'day.order' BEFORE 'trip.update';--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "done" boolean DEFAULT false NOT NULL;