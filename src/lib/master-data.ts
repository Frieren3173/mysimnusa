export const ROOM_TYPES = [
  "IGD",
  "Rawat Inap",
  "ICU",
  "Kamar Operasi",
  "Kebidanan",
  "Rawat Jalan",
  "Khusus",
  "Lainnya",
] as const;

export const ROOM_TYPE_RULES: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /\bigd\b|gawat darurat/i, type: "IGD" },
  {
    pattern: /\biccu\b|\bnicu\b|\bpicu\b|\bicu\b|perina|neonatal|intensive care/i,
    type: "ICU",
  },
  { pattern: /operasi|cathlab|recovery|bedah sentral/i, type: "Kamar Operasi" },
  { pattern: /bersalin|\bvk\b|bidan|nifas|ponek|postpartum/i, type: "Kebidanan" },
  { pattern: /hemodial|\bhd\b/i, type: "Khusus" },
  { pattern: /poli|rawat jalan/i, type: "Rawat Jalan" },
  { pattern: /rawat inap|kris|vip|isolasi/i, type: "Rawat Inap" },
  { pattern: /forklin|\bppi\b/i, type: "Khusus" },
];

export function guessRoomType(name: string, code: string | null): string {
  const haystack = `${name} ${code ?? ""}`;
  for (const rule of ROOM_TYPE_RULES) {
    if (rule.pattern.test(haystack)) return rule.type;
  }
  return "Lainnya";
}

export interface MasterRoomSeed {
  code: string;
  name: string;
  type: string;
  description: string;
  aliases: string[];
}

export const MASTER_ROOMS: MasterRoomSeed[] = [
  {
    code: "IGD",
    name: "Instalasi Gawat Darurat",
    type: "IGD",
    description: "Pelayanan gawat darurat 24 jam",
    aliases: ["IGD"],
  },
  {
    code: "RI-01",
    name: "Rawat Inap 1",
    type: "Rawat Inap",
    description: "Ruang rawat inap lantai 1",
    aliases: [],
  },
  {
    code: "ICU",
    name: "Intensive Care Unit",
    type: "ICU",
    description: "Ruang perawatan intensif dewasa",
    aliases: ["ICU"],
  },
  {
    code: "ICCU",
    name: "Intensive Cardiac Care Unit",
    type: "ICU",
    description: "Ruang perawatan intensif kardiologi",
    aliases: [],
  },
  {
    code: "NICU",
    name: "Neonatal Intensive Care Unit",
    type: "ICU",
    description: "Ruang perawatan intensif neonatus",
    aliases: ["NICU/PERINA"],
  },
  {
    code: "PICU",
    name: "Pediatric Intensive Care Unit",
    type: "ICU",
    description: "Ruang perawatan intensif anak",
    aliases: ["PICU"],
  },
  {
    code: "IBS",
    name: "Instalasi Bedah Sentral",
    type: "Kamar Operasi",
    description: "Kamar operasi terpusat",
    aliases: ["IBS"],
  },
  {
    code: "RR",
    name: "Recovery Room",
    type: "Kamar Operasi",
    description: "Ruang pemulihan pasca anestesi",
    aliases: [],
  },
  {
    code: "VK",
    name: "Ruang Bersalin",
    type: "Kebidanan",
    description: "Ruang persalinan",
    aliases: ["VK / Bersalin", "VK/KEBIDANAN"],
  },
  {
    code: "NIFAS",
    name: "Ruang Nifas",
    type: "Kebidanan",
    description: "Ruang perawatan ibu postpartum",
    aliases: [],
  },
  {
    code: "HD",
    name: "Hemodialisa",
    type: "Khusus",
    description: "Instalasi cuci darah",
    aliases: ["Hemodialisa"],
  },
  {
    code: "POLI",
    name: "Rawat Jalan",
    type: "Rawat Jalan",
    description: "Pelayanan poliklinik",
    aliases: ["Poli Rawat Jalan", "POLI"],
  },
  {
    code: "PONEK",
    name: "Pelayanan Obstetri Neonatal Emergensi",
    type: "Kebidanan",
    description: "Layanan emergensi obstetri dan neonatal",
    aliases: ["PONEK"],
  },
];

export const NURSING_ACTION_CATEGORIES = [
  "Assessment",
  "Monitoring",
  "Pemberian Obat",
  "Tindakan Invasif",
  "Perawatan Luka",
  "Respirasi",
  "Nutrisi",
  "Eliminasi",
  "Mobilisasi",
  "Pemeriksaan",
  "Edukasi",
  "Pencegahan Infeksi",
  "Kegawatdaruratan",
  "Perioperatif",
  "Neonatus",
  "Kebidanan",
  "Lainnya",
] as const;

export interface MasterActionSeed {
  name: string;
  category: string;
}

export const NURSING_ACTIONS: MasterActionSeed[] = [
  { name: "Pemeriksaan Tanda Vital", category: "Assessment" },
  { name: "Monitoring Kesadaran", category: "Monitoring" },
  { name: "Monitoring GCS", category: "Monitoring" },
  { name: "Monitoring Nyeri", category: "Monitoring" },
  { name: "Monitoring Saturasi Oksigen", category: "Monitoring" },
  { name: "Monitoring Balance Cairan", category: "Monitoring" },
  { name: "Monitoring Intake Output", category: "Monitoring" },
  { name: "Monitoring Hemodinamik", category: "Monitoring" },
  { name: "Monitoring EKG", category: "Monitoring" },

  { name: "Pemberian Obat Oral", category: "Pemberian Obat" },
  { name: "Pemberian Obat Intravena", category: "Pemberian Obat" },
  { name: "Pemberian Obat Intramuskular", category: "Pemberian Obat" },
  { name: "Pemberian Obat Subkutan", category: "Pemberian Obat" },
  { name: "Pemberian Obat Intradermal", category: "Pemberian Obat" },
  { name: "Pemberian Obat melalui NGT", category: "Pemberian Obat" },
  { name: "Pemberian Obat melalui Nebulizer", category: "Pemberian Obat" },
  { name: "Pemberian Obat Topikal", category: "Pemberian Obat" },

  { name: "Pemasangan Infus", category: "Tindakan Invasif" },
  { name: "Penggantian Infus", category: "Tindakan Invasif" },
  { name: "Pelepasan Infus", category: "Tindakan Invasif" },
  { name: "Pemasangan Kateter Urin", category: "Tindakan Invasif" },
  { name: "Pelepasan Kateter Urin", category: "Tindakan Invasif" },
  { name: "Pemasangan NGT", category: "Tindakan Invasif" },
  { name: "Pelepasan NGT", category: "Tindakan Invasif" },
  { name: "Perawatan CVC", category: "Tindakan Invasif" },
  { name: "Pengambilan Sampel Darah", category: "Tindakan Invasif" },
  { name: "Pengambilan Spesimen", category: "Tindakan Invasif" },

  { name: "Pemberian Oksigen", category: "Respirasi" },
  { name: "Nasal Cannula", category: "Respirasi" },
  { name: "Simple Mask", category: "Respirasi" },
  { name: "Non Rebreathing Mask", category: "Respirasi" },
  { name: "Suction", category: "Respirasi" },
  { name: "Nebulizer", category: "Respirasi" },
  { name: "Perawatan Trakeostomi", category: "Respirasi" },
  { name: "Monitoring Ventilator", category: "Respirasi" },

  { name: "Assessment Luka", category: "Perawatan Luka" },
  { name: "Perawatan Luka", category: "Perawatan Luka" },
  { name: "Wound Dressing", category: "Perawatan Luka" },
  { name: "Penggantian Balutan", category: "Perawatan Luka" },
  { name: "Pelepasan Jahitan", category: "Perawatan Luka" },
  { name: "Perawatan Luka Operasi", category: "Perawatan Luka" },
  { name: "Perawatan Drain", category: "Perawatan Luka" },
  { name: "Perawatan Luka Dekubitus", category: "Perawatan Luka" },

  { name: "Mobilisasi Pasien", category: "Mobilisasi" },
  { name: "Ambulasi", category: "Mobilisasi" },
  { name: "Positioning", category: "Mobilisasi" },
  { name: "Repositioning", category: "Mobilisasi" },
  { name: "Latihan Rentang Gerak", category: "Mobilisasi" },
  { name: "Pencegahan Risiko Jatuh", category: "Mobilisasi" },

  { name: "Pemeriksaan Gula Darah", category: "Pemeriksaan" },
  { name: "EKG", category: "Pemeriksaan" },
  { name: "Pengambilan Darah", category: "Pemeriksaan" },
  { name: "Pengambilan Urin", category: "Pemeriksaan" },
  { name: "Pengambilan Sputum", category: "Pemeriksaan" },
  { name: "Pemeriksaan Antropometri", category: "Pemeriksaan" },

  { name: "Edukasi Pasien", category: "Edukasi" },
  { name: "Edukasi Keluarga", category: "Edukasi" },
  { name: "Edukasi Obat", category: "Edukasi" },
  { name: "Edukasi Perawatan Luka", category: "Edukasi" },
  { name: "Edukasi Diet", category: "Edukasi" },
  { name: "Edukasi Pencegahan Infeksi", category: "Edukasi" },
  { name: "Edukasi Mobilisasi", category: "Edukasi" },

  { name: "Persiapan Pasien Operasi", category: "Perioperatif" },
  { name: "Surgical Site Preparation", category: "Perioperatif" },
  { name: "Surgical Count", category: "Perioperatif" },
  { name: "Positioning Intraoperatif", category: "Perioperatif" },
  { name: "Monitoring Intraoperatif", category: "Perioperatif" },
  { name: "Persiapan Instrumen", category: "Perioperatif" },
  { name: "Persiapan Area Operasi", category: "Perioperatif" },
  { name: "Observasi Pasca Operasi", category: "Perioperatif" },

  { name: "Triage", category: "Kegawatdaruratan" },
  { name: "Bantuan Hidup Dasar", category: "Kegawatdaruratan" },
  { name: "Bantuan Hidup Lanjut", category: "Kegawatdaruratan" },
  { name: "Resusitasi", category: "Kegawatdaruratan" },
  { name: "Persiapan Defibrilasi", category: "Kegawatdaruratan" },
  { name: "Monitoring Pasien Kritis", category: "Kegawatdaruratan" },

  { name: "Perawatan Neonatus", category: "Neonatus" },
  { name: "Monitoring Suhu Neonatus", category: "Neonatus" },
  { name: "Monitoring Saturasi Neonatus", category: "Neonatus" },
  { name: "Perawatan Tali Pusat", category: "Neonatus" },
  { name: "Pemberian ASI", category: "Neonatus" },
  { name: "Pemberian Nutrisi melalui OGT/NGT", category: "Neonatus" },
  { name: "Fototerapi", category: "Neonatus" },

  { name: "Monitoring Ibu", category: "Kebidanan" },
  { name: "Monitoring Janin", category: "Kebidanan" },
  { name: "Monitoring Kontraksi", category: "Kebidanan" },
  { name: "Persiapan Persalinan", category: "Kebidanan" },
  { name: "Perawatan Postpartum", category: "Kebidanan" },
  { name: "Observasi Perdarahan Postpartum", category: "Kebidanan" },
  { name: "Perawatan Luka Perineum", category: "Kebidanan" },
  { name: "Perawatan Luka Sectio Caesarea", category: "Kebidanan" },
];

export interface RoomActionGroupSeed {
  key: string;
  type?: string;
  namePattern?: RegExp;
  excludeNamePattern?: RegExp;
  actions: string[];
}

export const ROOM_ACTION_GROUPS: RoomActionGroupSeed[] = [
  {
    key: "igd",
    type: "IGD",
    actions: [
      "Triage",
      "Pemeriksaan Tanda Vital",
      "Pemasangan Infus",
      "Pemberian Oksigen",
      "EKG",
      "Pengambilan Darah",
      "Pemberian Obat Oral",
      "Perawatan Luka",
      "Suction",
      "Resusitasi",
      "Monitoring Kesadaran",
    ],
  },
  {
    key: "rawat-inap",
    type: "Rawat Inap",
    actions: [
      "Pemeriksaan Tanda Vital",
      "Pemberian Obat Oral",
      "Pemasangan Infus",
      "Perawatan Luka",
      "Pemasangan Kateter Urin",
      "Pemasangan NGT",
      "Pengambilan Darah",
      "Mobilisasi Pasien",
      "Edukasi Pasien",
      "Monitoring Balance Cairan",
    ],
  },
  {
    key: "icu",
    type: "ICU",
    excludeNamePattern: /nicu|perina/i,
    actions: [
      "Pemeriksaan Tanda Vital",
      "Monitoring GCS",
      "Monitoring Hemodinamik",
      "Monitoring Ventilator",
      "Suction",
      "Pemberian Oksigen",
      "Pemasangan Infus",
      "Perawatan CVC",
      "Pemasangan Kateter Urin",
      "Monitoring Balance Cairan",
      "Positioning",
      "Pemberian Obat Intravena",
    ],
  },
  {
    key: "nicu",
    namePattern: /nicu|perina/i,
    actions: [
      "Perawatan Neonatus",
      "Monitoring Suhu Neonatus",
      "Monitoring Saturasi Neonatus",
      "Perawatan Tali Pusat",
      "Pemberian ASI",
      "Pemberian Nutrisi melalui OGT/NGT",
      "Fototerapi",
      "Pemberian Oksigen",
      "Pemeriksaan Tanda Vital",
    ],
  },
  {
    key: "ibs",
    type: "Kamar Operasi",
    actions: [
      "Persiapan Pasien Operasi",
      "Surgical Site Preparation",
      "Pemasangan Kateter Urin",
      "Positioning Intraoperatif",
      "Surgical Count",
      "Monitoring Intraoperatif",
      "Persiapan Instrumen",
      "Persiapan Area Operasi",
      "Observasi Pasca Operasi",
    ],
  },
  {
    key: "vk",
    type: "Kebidanan",
    excludeNamePattern: /nifas/i,
    actions: [
      "Monitoring Ibu",
      "Monitoring Janin",
      "Monitoring Kontraksi",
      "Persiapan Persalinan",
      "Pemeriksaan Tanda Vital",
      "Pemasangan Infus",
      "Pemberian Obat Oral",
      "Perawatan Postpartum",
    ],
  },
  {
    key: "nifas",
    namePattern: /nifas/i,
    actions: [
      "Pemeriksaan Tanda Vital",
      "Observasi Perdarahan Postpartum",
      "Perawatan Luka Perineum",
      "Perawatan Luka Sectio Caesarea",
      "Mobilisasi Pasien",
      "Edukasi Pasien",
    ],
  },
];
