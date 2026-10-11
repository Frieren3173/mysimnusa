/**
 * Minimal in-memory Prisma double for route-level regression tests.
 *
 * It is NOT a full Prisma emulator — it supports exactly the operations the
 * Diklat routes under test use, and — crucially — it ENFORCES the unique
 * constraints the routes rely on, so tests can verify real business outcomes
 * (e.g. a duplicate attendance upsert updates instead of inserting, a duplicate
 * participant insert raises P2002) rather than only that a mock was called.
 *
 * Supported: findUnique / findFirst / findMany / create / update / updateMany /
 * count / delete / deleteMany / upsert, plus `$transaction`.
 */

export interface Row {
  [key: string]: unknown;
}

interface UniqueSpec {
  fields: string[];
  /** Prisma-style constraint name, e.g. "trainingId_staffId_key". */
  name: string;
}

export class PrismaUniqueError extends Error {
  code = "P2002";
  meta: { target: string[] };
  constructor(public model: string, public constraint: UniqueSpec) {
    super(`Unique constraint failed on the fields: (${constraint.fields.join(",")})`);
    this.meta = { target: constraint.fields };
  }
}

/** Raised to simulate a transient write conflict (Prisma P2034). */
export class PrismaWriteConflictError extends Error {
  code = "P2034";
  constructor() {
    super("Transaction failed due to a write conflict or a deadlock");
  }
}

type Where = Record<string, unknown>;

function cmp(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/** Matches a value against a scalar filter ({ equals, gte, lt, not, in, … }). */
function matchScalar(value: unknown, filter: unknown): boolean {
  if (filter === null || filter === undefined) return value === filter;
  if (filter instanceof Date) return value instanceof Date && value.getTime() === filter.getTime();
  if (typeof filter !== "object") return value === filter;

  const f = filter as Record<string, unknown>;
  const insensitive = f.mode === "insensitive";
  const eq = (a: unknown, b: unknown) =>
    insensitive && typeof a === "string" && typeof b === "string" ? a.toLowerCase() === b.toLowerCase() : matchScalar(a, b);
  if ("equals" in f && !eq(value, f.equals)) return false;
  if ("not" in f && matchScalar(value, f.not)) return false;
  if ("in" in f && Array.isArray(f.in) && !f.in.some((x) => eq(value, x))) return false;
  if ("notIn" in f && Array.isArray(f.notIn) && f.notIn.some((x) => eq(value, x))) return false;
  if (
    "contains" in f &&
    typeof value === "string" &&
    typeof f.contains === "string" &&
    !value.toLowerCase().includes(f.contains.toLowerCase())
  )
    return false;
  if ("gte" in f && !(cmp(value, f.gte) >= 0)) return false;
  if ("gt" in f && !(cmp(value, f.gt) > 0)) return false;
  if ("lte" in f && !(cmp(value, f.lte) <= 0)) return false;
  if ("lt" in f && !(cmp(value, f.lt) < 0)) return false;
  return true;
}

/** Recursively matches a row against a Prisma `where` (incl. AND/OR, composite). */
export function matchWhere(
  row: Row,
  where: Where | undefined,
  relations?: Record<string, (row: Row) => Row | null>,
): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === "AND") {
      const arr = Array.isArray(cond) ? cond : [cond];
      if (!arr.every((c) => matchWhere(row, c as Where, relations))) return false;
      continue;
    }
    if (key === "OR") {
      const arr = Array.isArray(cond) ? cond : [cond];
      if (!arr.some((c) => matchWhere(row, c as Where, relations))) return false;
      continue;
    }
    if (key === "NOT") {
      const arr = Array.isArray(cond) ? cond : [cond];
      if (arr.some((c) => matchWhere(row, c as Where, relations))) return false;
      continue;
    }
    // Nested relation filter, e.g. `where: { training: { startDate: { gte } } }`.
    // Only attempted when the key is a registered relation AND not a raw column.
    if (relations && key in relations && !(key in row)) {
      const related = relations[key](row);
      if (!related || !matchWhere(related, cond as Where, relations)) return false;
      continue;
    }
    // Composite/compound key, e.g. trainingId_staffId: { trainingId, staffId }.
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      const sub = cond as Row;
      // Compound-key detection: every key exists on the row AND its value is a
      // scalar (string/number/Date) — NOT a nested filter ({gte}, {in}, …).
      const isCompound =
        Object.keys(sub).length > 0 &&
        Object.keys(sub).every((k) => k in row) &&
        Object.values(sub).every((v) => v === null || typeof v !== "object" || v instanceof Date);
      if (isCompound) {
        if (!Object.entries(sub).every(([k, v]) => matchScalar(row[k], v))) return false;
        continue;
      }
    }
    if (typeof cond === "object" && cond !== null && !(cond instanceof Date)) {
      if (!matchScalar(row[key], cond)) return false;
    } else {
      if (!matchScalar(row[key], cond)) return false;
    }
  }
  return true;
}

type Include = Record<string, boolean | { select?: Record<string, boolean> } | undefined>;

/**
 * Projects a RELATED row through a nested `select` — scalar columns only (enough
 * for the depth the routes use, e.g. participant.training.{id,title,startDate}).
 */
function projectRelated(row: Row, select?: SelectSpec): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const [k, on] of Object.entries(select)) if (on === true) out[k] = row[k];
  return out;
}

/** A Prisma `select` may contain nested relation selects (value = { select }). */
type SelectSpec = Record<string, boolean | { select?: SelectSpec }>;

/**
 * Applies `select` OR `include` (relations) to a row. Nested relation entries in
 * `select` (e.g. `{ training: { select: { id: true } } }`) are resolved through
 * the model's relation resolvers, so routes that read `p.training` work.
 */
function project(
  model: FakeModel,
  row: Row,
  select?: SelectSpec | null,
  include?: Include | null,
): Row {
  if (select) {
    const out: Row = {};
    for (const [k, spec] of Object.entries(select)) {
      if (spec === true) {
        out[k] = row[k];
        continue;
      }
      if (spec && typeof spec === "object") {
        const resolver = model.relations[k];
        const related = resolver ? resolver(row) : null;
        out[k] = related ? projectRelated(related, spec.select) : null;
      }
    }
    return out;
  }
  const out = { ...row };
  if (include) {
    for (const [rel, spec] of Object.entries(include)) {
      if (!spec) continue;
      const resolver = model.relations[rel];
      const related = resolver ? resolver(row) : null;
      if (related && typeof spec === "object" && spec.select) {
        out[rel] = projectRelated(related, spec.select);
      } else {
        out[rel] = related;
      }
    }
  }
  return out;
}

let idCounter = 0;
function genId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter.toString().padStart(6, "0")}`;
}

/** One model's in-memory table. */
export class FakeModel {
  rows: Row[] = [];
  /**
   * Resolver for nested `include`/relation reads, e.g. `{ staff: (row) => ... }`.
   * Set by the owning fake client so `findMany({ include })` can populate the
   * relation the routes rely on (participants → staff).
   */
  relations: Record<string, (row: Row) => Row | null> = {};
  constructor(public name: string, private uniques: UniqueSpec[] = [], private idPrefix = "id") {}

  private enforceUniques(row: Row, ignoreId?: string) {
    for (const u of this.uniques) {
      const clash = this.rows.some(
        (r) => r.id !== ignoreId && u.fields.every((f) => matchScalar(r[f], row[f])),
      );
      if (clash) throw new PrismaUniqueError(this.name, u);
    }
  }

  async findUnique({ where, select, include }: { where: Where; select?: SelectSpec; include?: Include }) {
    const row = this.rows.find((r) => matchWhere(r, where, this.relations));
    return row ? project(this, row, select, include) : null;
  }

  async findFirst({ where, select, include }: { where?: Where; select?: SelectSpec; include?: Include } = {}) {
    const row = this.rows.find((r) => matchWhere(r, where, this.relations));
    return row ? project(this, row, select, include) : null;
  }

  async findMany({
    where,
    select,
    include,
    orderBy,
  }: {
    where?: Where;
    select?: SelectSpec;
    include?: Include;
    orderBy?: Record<string, "asc" | "desc">;
  } = {}) {
    let out = this.rows.filter((r) => matchWhere(r, where, this.relations));
    if (orderBy) {
      const [field, dir] = Object.entries(orderBy)[0] ?? [];
      if (field) out = [...out].sort((a, b) => (dir === "desc" ? cmp(b[field], a[field]) : cmp(a[field], b[field])));
    }
    return out.map((r) => project(this, r, select, include));
  }

  async count({ where }: { where?: Where } = {}) {
    return this.rows.filter((r) => matchWhere(r, where, this.relations)).length;
  }

  async create({ data, select, include }: { data: Row; select?: SelectSpec; include?: Include }) {
    const row: Row = {
      id: (data.id as string) ?? genId(this.idPrefix),
      createdAt: data.createdAt ?? new Date(),
      updatedAt: data.updatedAt ?? new Date(),
      ...data,
    };
    this.enforceUniques(row);
    this.rows.push(row);
    return project(this, row, select, include);
  }

  async update({ where, data, select, include }: { where: Where; data: Row; select?: SelectSpec; include?: Include }) {
    const idx = this.rows.findIndex((r) => matchWhere(r, where, this.relations));
    if (idx < 0) throw new Error(`FakeModel(${this.name}).update: not found`);
    const next = { ...this.rows[idx], ...data, updatedAt: new Date() };
    this.enforceUniques(next, String(this.rows[idx].id));
    this.rows[idx] = next;
    return project(this, next, select, include);
  }

  async updateMany({ where, data }: { where?: Where; data: Row }) {
    let n = 0;
    for (let i = 0; i < this.rows.length; i++) {
      if (matchWhere(this.rows[i], where, this.relations)) {
        this.rows[i] = { ...this.rows[i], ...data, updatedAt: new Date() };
        n++;
      }
    }
    return { count: n };
  }

  async delete({ where }: { where: Where }) {
    const idx = this.rows.findIndex((r) => matchWhere(r, where, this.relations));
    if (idx < 0) throw new Error(`FakeModel(${this.name}).delete: not found`);
    return this.rows.splice(idx, 1)[0];
  }

  async deleteMany({ where }: { where?: Where } = {}) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matchWhere(r, where, this.relations));
    return { count: before - this.rows.length };
  }

  async upsert({ where, create, update }: { where: Where; create: Row; update: Row }) {
    const existing = this.rows.find((r) => matchWhere(r, where, this.relations));
    if (existing) return this.update({ where: { id: existing.id }, data: update });
    return this.create({ data: create });
  }
}

/** A fake `PrismaClient` wired to the Diklat models used by the routes. */
export function makeFakePrisma() {
  const attendance = new FakeModel("training_attendance", [
    { fields: ["trainingId", "staffId", "date"], name: "trainingId_staffId_date_key" },
  ]);
  const participants = new FakeModel("training_participants", [
    { fields: ["trainingId", "staffId"], name: "trainingId_staffId_key" },
  ]);
  const certificate = new FakeModel("certificates", [
    { fields: ["certificateNumber"], name: "certificateNumber_key" },
    { fields: ["trainingId", "staffId"], name: "trainingId_staffId_key" },
  ]);
  const training = new FakeModel("trainings");
  const assessment = new FakeModel("training_assessments", [
    { fields: ["trainingId", "staffId"], name: "trainingId_staffId_key" },
  ]);
  const staff = new FakeModel("staff");
  const notification = new FakeModel("notifications");
  const room = new FakeModel("rooms");
  // Borang workflow models.
  const borangEntry = new FakeModel("borang_entries");
  const borangVerification = new FakeModel("borang_verifications");
  const auditLog = new FakeModel("audit_logs");
  const roomKepalaRuang = new FakeModel("room_kepala_ruang", [
    { fields: ["roomId"], name: "room_kepala_ruang_roomId_key" },
  ]);
  const user = new FakeModel("users");
  const nursingAction = new FakeModel("nursing_actions", [
    { fields: ["code"], name: "nursing_actions_code_key" },
    { fields: ["name"], name: "nursing_actions_name_key" },
  ]);
  const documentType = new FakeModel("document_types", [{ fields: ["code"], name: "document_types_code_key" }]);
  // Document needs documentType relation for the export/doc routes.
  const document = new FakeModel("documents");
  const patientRegisterEntry = new FakeModel("patient_register_entries", [
    { fields: ["roomId", "rmNumber"], name: "patient_register_entries_roomId_rmNumber_key" },
  ]);

  // Relation resolvers used by routes that `include` a related model.
  participants.relations.staff = (row) => staff.rows.find((s) => s.id === row.staffId) ?? null;
  participants.relations.training = (row) => training.rows.find((t) => t.id === row.trainingId) ?? null;
  borangEntry.relations.room = (row) => room.rows.find((r) => r.id === row.roomId) ?? null;
  borangEntry.relations.staff = (row) => staff.rows.find((s) => s.id === row.staffId) ?? null;
  document.relations.documentType = (row) => documentType.rows.find((d) => d.id === row.documentTypeId) ?? null;

  const client = {
    training,
    trainingParticipant: participants,
    trainingAttendance: attendance,
    trainingAssessment: assessment,
    certificate,
    staff,
    notification,
    room,
    borangEntry,
    borangVerification,
    auditLog,
    roomKepalaRuang,
    user,
    nursingAction,
    documentType,
    document,
    patientRegisterEntry,
    /** Snapshot/rollback transaction to emulate atomicity for the capacity test. */
    async $transaction<T>(fn: (tx: unknown) => Promise<T>, opts?: unknown): Promise<T> {
      void opts; // isolation level is irrelevant for the in-memory double
      const snapshot = {
        participants: participants.rows.map((r) => ({ ...r })),
        certificate: certificate.rows.map((r) => ({ ...r })),
        borangEntry: borangEntry.rows.map((r) => ({ ...r })),
        borangVerification: borangVerification.rows.map((r) => ({ ...r })),
      };
      try {
        return await fn(client);
      } catch (e) {
        participants.rows = snapshot.participants;
        certificate.rows = snapshot.certificate;
        borangEntry.rows = snapshot.borangEntry;
        borangVerification.rows = snapshot.borangVerification;
        throw e;
      }
    },
  };
  return {
    client,
    models: { attendance, participants, certificate, training, assessment, staff, notification, room, borangEntry, borangVerification, auditLog, roomKepalaRuang, user, nursingAction, documentType, document, patientRegisterEntry },
  };
}

export type FakePrisma = ReturnType<typeof makeFakePrisma>["client"];

/**
 * Process-wide singleton so that a `vi.mock` factory (hoisted, imported at
 * module-eval time) and the test body observe the SAME fake database, without
 * relying on `vi.hoisted` + `require`.
 */
let singleton: ReturnType<typeof makeFakePrisma> | null = null;
export function getFakePrisma(): ReturnType<typeof makeFakePrisma> {
  if (!singleton) singleton = makeFakePrisma();
  return singleton;
}

/** Resets every table — call in `beforeEach` for isolation between tests. */
export function resetFakePrisma() {
  const f = getFakePrisma();
  for (const model of Object.values(f.models)) model.rows = [];
}
