CREATE TABLE "reliefs" (
	"key" text PRIMARY KEY NOT NULL,
	"svg" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_legs" (
	"key" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"meters" integer NOT NULL,
	"seconds" integer NOT NULL,
	"line" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
