import { createGroupHandler, type RouteEntry } from "@/lib/api-router";

import * as h1 from "@/server/api/admin-audit";
import * as h2 from "@/server/api/admin-competencies";
import * as h3 from "@/server/api/admin-migration-$batchId$";
import * as h4 from "@/server/api/admin-migration-$batchId$-assessment";
import * as h5 from "@/server/api/admin-migration-$batchId$-cancel";
import * as h6 from "@/server/api/admin-migration-$batchId$-dry-run";
import * as h7 from "@/server/api/admin-migration-$batchId$-import";
import * as h8 from "@/server/api/admin-migration-$batchId$-items";
import * as h9 from "@/server/api/admin-migration-$batchId$-mapping";
import * as h10 from "@/server/api/admin-migration-$batchId$-reconciliation";
import * as h11 from "@/server/api/admin-migration-$batchId$-retry";
import * as h12 from "@/server/api/admin-migration-$batchId$-validate";
import * as h13 from "@/server/api/admin-migration-dedup";
import * as h14 from "@/server/api/admin-migration-google-callback";
import * as h15 from "@/server/api/admin-migration-google-connect";
import * as h16 from "@/server/api/admin-migration-google-disconnect";
import * as h17 from "@/server/api/admin-migration-history";
import * as h18 from "@/server/api/admin-migration-items-$itemId$-force";
import * as h19 from "@/server/api/admin-migration-scan";
import * as h20 from "@/server/api/admin-migration-sources";
import * as h21 from "@/server/api/admin-migration-status";
import * as h22 from "@/server/api/admin-migration-sync-drive";
import * as h23 from "@/server/api/admin-migration-sync-status";
import * as h24 from "@/server/api/admin-migration-upload";
import * as h25 from "@/server/api/admin-rooms";
import * as h26 from "@/server/api/admin-rooms-$id$";
import * as h27 from "@/server/api/admin-rooms-$id$-actions";
import * as h28 from "@/server/api/admin-slides";
import * as h29 from "@/server/api/admin-slides-$name$";
import * as h30 from "@/server/api/admin-users";
import * as h31 from "@/server/api/admin-users-$id$";
import * as h32 from "@/server/api/auth-login";
import * as h33 from "@/server/api/auth-logout";
import * as h34 from "@/server/api/borang-actions";
import * as h35 from "@/server/api/borang-actions-$id$";
import * as h36 from "@/server/api/borang-entries";
import * as h37 from "@/server/api/borang-entries-$id$";
import * as h38 from "@/server/api/borang-entries-$id$-workflow";
import * as h39 from "@/server/api/borang-export";
import * as h40 from "@/server/api/diklat-trainings";
import * as h41 from "@/server/api/diklat-trainings-$id$";
import * as h42 from "@/server/api/diklat-trainings-$id$-assessments";
import * as h43 from "@/server/api/diklat-trainings-$id$-attendance";
import * as h44 from "@/server/api/diklat-trainings-$id$-certificates";
import * as h45 from "@/server/api/diklat-trainings-$id$-participants";
import * as h46 from "@/server/api/diklat-trainings-$id$-participants-$participantId$";
import * as h47 from "@/server/api/documents-$id$";
import * as h48 from "@/server/api/documents-$id$-download";
import * as h49 from "@/server/api/komite-staff";
import * as h50 from "@/server/api/komite-staff-$id$";
import * as h51 from "@/server/api/komite-staff-$id$-documents";
import * as h52 from "@/server/api/documents-$id$-thumbnail";
import * as h53 from "@/server/api/diklat-certificate-template";
import * as h54 from "@/server/api/diklat-trainings-$id$-certificates-generate";
import * as h55 from "@/server/api/csp-report";
import * as h56 from "@/server/api/admin-room-kepala-ruang";

// Consolidated API route table.
// Every URL/method that previously lived in its own route.ts file is
// dispatched from here so the whole API surface is a single Vercel Function.
const routes: RouteEntry[] = [
  { pattern: ["admin", "audit"], module: h1 },
  { pattern: ["admin", "competencies"], module: h2 },
  { pattern: ["admin", "migration", ":batchId"], module: h3 },
  { pattern: ["admin", "migration", ":batchId", "assessment"], module: h4 },
  { pattern: ["admin", "migration", ":batchId", "cancel"], module: h5 },
  { pattern: ["admin", "migration", ":batchId", "dry-run"], module: h6 },
  { pattern: ["admin", "migration", ":batchId", "import"], module: h7 },
  { pattern: ["admin", "migration", ":batchId", "items"], module: h8 },
  { pattern: ["admin", "migration", ":batchId", "mapping"], module: h9 },
  { pattern: ["admin", "migration", ":batchId", "reconciliation"], module: h10 },
  { pattern: ["admin", "migration", ":batchId", "retry"], module: h11 },
  { pattern: ["admin", "migration", ":batchId", "validate"], module: h12 },
  { pattern: ["admin", "migration", "dedup"], module: h13 },
  { pattern: ["admin", "migration", "google", "callback"], module: h14 },
  { pattern: ["admin", "migration", "google", "connect"], module: h15 },
  { pattern: ["admin", "migration", "google", "disconnect"], module: h16 },
  { pattern: ["admin", "migration", "history"], module: h17 },
  { pattern: ["admin", "migration", "items", ":itemId", "force"], module: h18 },
  { pattern: ["admin", "migration", "scan"], module: h19 },
  { pattern: ["admin", "migration", "sources"], module: h20 },
  { pattern: ["admin", "migration", "status"], module: h21 },
  { pattern: ["admin", "migration", "sync-drive"], module: h22 },
  { pattern: ["admin", "migration", "sync-status"], module: h23 },
  { pattern: ["admin", "migration", "upload"], module: h24 },
  { pattern: ["admin", "rooms"], module: h25 },
  { pattern: ["admin", "rooms", "kepala-ruang"], module: h56 },
  { pattern: ["admin", "rooms", ":id"], module: h26 },
  { pattern: ["admin", "rooms", ":id", "actions"], module: h27 },
  { pattern: ["admin", "slides"], module: h28 },
  { pattern: ["admin", "slides", ":name"], module: h29 },
  { pattern: ["admin", "users"], module: h30 },
  { pattern: ["admin", "users", ":id"], module: h31 },
  { pattern: ["auth", "login"], module: h32 },
  { pattern: ["auth", "logout"], module: h33 },
  { pattern: ["borang", "actions"], module: h34 },
  { pattern: ["borang", "actions", ":id"], module: h35 },
  { pattern: ["borang", "entries"], module: h36 },
  { pattern: ["borang", "entries", ":id"], module: h37 },
  { pattern: ["borang", "entries", ":id", "workflow"], module: h38 },
  { pattern: ["borang", "export"], module: h39 },
  { pattern: ["diklat", "trainings"], module: h40 },
  { pattern: ["diklat", "trainings", ":id"], module: h41 },
  { pattern: ["diklat", "trainings", ":id", "assessments"], module: h42 },
  { pattern: ["diklat", "trainings", ":id", "attendance"], module: h43 },
  { pattern: ["diklat", "trainings", ":id", "certificates"], module: h44 },
  { pattern: ["diklat", "trainings", ":id", "participants"], module: h45 },
  { pattern: ["diklat", "trainings", ":id", "participants", ":participantId"], module: h46 },
  { pattern: ["diklat", "trainings", ":id", "certificates", "generate"], module: h54 },
  { pattern: ["diklat", "certificate-template"], module: h53 },
  { pattern: ["documents", ":id"], module: h47 },
  { pattern: ["documents", ":id", "download"], module: h48 },
  { pattern: ["documents", ":id", "thumbnail"], module: h52 },
  { pattern: ["komite", "staff"], module: h49 },
  { pattern: ["komite", "staff", ":id"], module: h50 },
  { pattern: ["komite", "staff", ":id", "documents"], module: h51 },
  { pattern: ["csp-report"], module: h55 },
];

const handlers = createGroupHandler([], routes);

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;

export const dynamic = "force-dynamic";
