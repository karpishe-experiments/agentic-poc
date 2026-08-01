CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`booklet_id` text NOT NULL,
	`artifact_version_id` text NOT NULL,
	`scope` text NOT NULL,
	`subject_key` text,
	`action` text NOT NULL,
	`origin` text NOT NULL,
	`source_approval_id` text,
	`card_response_id` text,
	`quality_review_id` text,
	`created_at_ms` integer NOT NULL,
	FOREIGN KEY (`booklet_id`) REFERENCES `booklets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artifact_version_id`) REFERENCES `artifact_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_response_id`) REFERENCES `card_responses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quality_review_id`) REFERENCES `quality_reviews`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `artifact_dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`downstream_version_id` text NOT NULL,
	`upstream_version_id` text NOT NULL,
	`created_at_ms` integer NOT NULL,
	FOREIGN KEY (`downstream_version_id`) REFERENCES `artifact_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`upstream_version_id`) REFERENCES `artifact_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artifact_dependencies_pair_unique` ON `artifact_dependencies` (`downstream_version_id`,`upstream_version_id`);--> statement-breakpoint
CREATE TABLE `artifact_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`schema_version` text NOT NULL,
	`content_json` text NOT NULL,
	`created_by` text NOT NULL,
	`source_version_id` text,
	`created_at_ms` integer NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artifact_versions_artifact_number_unique` ON `artifact_versions` (`artifact_id`,`version_number`);--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`booklet_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`state` text NOT NULL,
	`current_version_id` text,
	`created_at_ms` integer NOT NULL,
	`updated_at_ms` integer NOT NULL,
	FOREIGN KEY (`booklet_id`) REFERENCES `booklets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_booklet_type_unique` ON `artifacts` (`booklet_id`,`artifact_type`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`booklet_id` text,
	`kind` text NOT NULL,
	`uri` text NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer,
	`height` integer,
	`source_asset_id` text,
	`metadata_json` text,
	`created_at_ms` integer NOT NULL,
	FOREIGN KEY (`booklet_id`) REFERENCES `booklets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_uri_unique` ON `assets` (`uri`);--> statement-breakpoint
CREATE TABLE `booklets` (
	`id` text PRIMARY KEY NOT NULL,
	`schema_version` text NOT NULL,
	`working_title` text NOT NULL,
	`lifecycle` text NOT NULL,
	`current_stage` text NOT NULL,
	`cover_asset_id` text,
	`created_at_ms` integer NOT NULL,
	`updated_at_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `booklets_updated_at_idx` ON `booklets` (`updated_at_ms`);--> statement-breakpoint
CREATE TABLE `card_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`action` text NOT NULL,
	`value_json` text,
	`revision_instruction` text,
	`followup_status` text NOT NULL,
	`followup_message_id` text,
	`created_at_ms` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`followup_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`booklet_id` text NOT NULL,
	`message_id` text,
	`artifact_id` text,
	`family` text NOT NULL,
	`variant` text NOT NULL,
	`status` text NOT NULL,
	`schema_version` text NOT NULL,
	`card_json` text NOT NULL,
	`created_at_ms` integer NOT NULL,
	`updated_at_ms` integer NOT NULL,
	FOREIGN KEY (`booklet_id`) REFERENCES `booklets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`booklet_id` text NOT NULL,
	`artifact_version_id` text NOT NULL,
	`status` text NOT NULL,
	`asset_id` text,
	`page_asset_ids_json` text NOT NULL,
	`preflight_json` text,
	`error_json` text,
	`created_at_ms` integer NOT NULL,
	`updated_at_ms` integer NOT NULL,
	FOREIGN KEY (`booklet_id`) REFERENCES `booklets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artifact_version_id`) REFERENCES `artifact_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `generation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`item_key` text NOT NULL,
	`position` integer NOT NULL,
	`status` text NOT NULL,
	`attempt_count` integer NOT NULL,
	`input_json` text NOT NULL,
	`result_json` text,
	`asset_id` text,
	`error_json` text,
	`started_at_ms` integer,
	`finished_at_ms` integer,
	FOREIGN KEY (`job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_items_job_key_unique` ON `generation_items` (`job_id`,`item_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `generation_items_job_position_unique` ON `generation_items` (`job_id`,`position`);--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`booklet_id` text NOT NULL,
	`job_type` text NOT NULL,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`input_json` text NOT NULL,
	`error_json` text,
	`created_at_ms` integer NOT NULL,
	`started_at_ms` integer,
	`finished_at_ms` integer,
	`updated_at_ms` integer NOT NULL,
	FOREIGN KEY (`booklet_id`) REFERENCES `booklets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_jobs_idempotency_unique` ON `generation_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`booklet_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`role` text NOT NULL,
	`schema_version` text NOT NULL,
	`ui_message_json` text NOT NULL,
	`created_at_ms` integer NOT NULL,
	FOREIGN KEY (`booklet_id`) REFERENCES `booklets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_booklet_sequence_unique` ON `messages` (`booklet_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `model_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`booklet_id` text NOT NULL,
	`operation` text NOT NULL,
	`skill_id` text,
	`artifact_version_id` text,
	`job_id` text,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`trace_id` text,
	`provider_request_id` text,
	`status` text NOT NULL,
	`attempt` integer NOT NULL,
	`started_at_ms` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`input_ref_json` text NOT NULL,
	`output_ref_json` text,
	`usage_json` text,
	`actual_cost_usd` text,
	`estimated_cost_usd` text,
	`pricing_version` text,
	`error_kind` text,
	`error_message` text,
	FOREIGN KEY (`booklet_id`) REFERENCES `booklets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artifact_version_id`) REFERENCES `artifact_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `quality_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`booklet_id` text NOT NULL,
	`gate` text NOT NULL,
	`attempt` integer NOT NULL,
	`status` text NOT NULL,
	`artifact_version_ids_json` text NOT NULL,
	`issues_json` text NOT NULL,
	`repair_version_ids_json` text,
	`accepted_at_ms` integer,
	`created_at_ms` integer NOT NULL,
	FOREIGN KEY (`booklet_id`) REFERENCES `booklets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `style_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`preview_asset_id` text NOT NULL,
	`prompt` text NOT NULL,
	`provenance` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at_ms` integer NOT NULL,
	FOREIGN KEY (`preview_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
